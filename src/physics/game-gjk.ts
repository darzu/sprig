import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ColliderDef } from "./collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { Shape, gjk, penetrationDepth } from "./narrowphase.js";
import { WorldFrameDef } from "./nonintersection.js";
import { PAD } from "./phys.js";
import { PositionDef, RotationDef, ScaleDef } from "./transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh } from "../meshes/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { farthestPointInDir } from "../utils/utils-3d.js";
import { AllMeshesDef, GameMesh, GizmoMesh } from "../meshes/meshes.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { createGhost } from "../debug/ghost.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { dbgLogMilestone } from "../utils/util.js";

/*
Init perf work:
25.00ms: until start of index.html
294.90ms: until start of main.ts
  looks like up to 200ms could be saved if we bundled and minified our JS
543.8ms: from start of main.ts to end of waiting on resources

w/ cache
  GJK start init at: 684.60
w/o cache
  GJK start init at: 875.50

Chrome lighthouse estimates:
  0.48s w/ compression
  0.16s w/ minified js

  scripts are 1.5mb,
    gl-matrix.js is largest at 216kb

"Errors":
  - Does not have a <meta name="viewport"> tag with width or initial-scaleNo `<meta name="viewport">` tag found
    - prevents a 300 millisecond delay to user input (?)
  - "<html> element does not have a [lang] attribute"
  

*/

let __frame = 0;
export async function initGJKSandbox(hosting: boolean) {
  dbgLogMilestone("GJK waiting for resources");
  const res = await EM.whenResources(
    AllMeshesDef,
    GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );
  res.camera.fov = Math.PI * 0.5;

  dbgLogMilestone("GJK init has resources");

  res.renderer.pipelines = [
    // ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    deferredPipeline,
    postProcess,
  ];

  // sun
  const sunlight = EM.new();
  EM.ensureComponentOn(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  // vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.ensureComponentOn(sunlight, PositionDef, V(10, 100, 10));
  EM.ensureComponentOn(
    sunlight,
    RenderableConstructDef,
    res.allMeshes.ball.proto
  );

  // ghost
  const g = createGhost();
  // EM.ensureComponentOn(g, RenderableConstructDef, res.allMeshes.cube.proto);
  // createPlayer();

  // vec3.copy(e.position, [-16.6, 5, -5.1]);
  // quat.copy(e.rotation, [0, -0.77, 0, 0.636]);
  // vec3.copy(e.cameraFollow.positionOffset, [0, 0, 0]);
  // quat.copy(e.cameraFollow.rotationOffset, [-0.225, 0, 0, 0.974]);
  // vec3.copy(g.position, [-4.28, 0.97, 0.11]);
  // quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
  // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  // quat.copy(g.cameraFollow.rotationOffset, [-0.18, 0.0, 0.0, 0.98]);
  vec3.copy(g.position, [0, 1, 0]);
  quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
  // setCameraFollowPosition(g, "thirdPerson");
  g.cameraFollow.positionOffset = V(0, 0, 5);
  g.controllable.modes.canYaw = false;
  g.controllable.modes.canCameraYaw = true;
  // g.controllable.modes.canPitch = true;
  g.controllable.speed *= 0.5;
  g.controllable.sprintMul = 10;

  console.log(`assuming global cursor`);
  console.dir(res.globalCursor3d);
  console.dir(res.globalCursor3d.cursor());
  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(
    ground,
    RenderableConstructDef,
    res.allMeshes.plane.proto
  );
  EM.ensureComponentOn(ground, ColorDef, V(0.2, 0.3, 0.2));
  EM.ensureComponentOn(ground, PositionDef, V(0, -5, 0));

  // world gizmo
  const gizmoMesh = await GizmoMesh.gameMesh();
  const worldGizmo = EM.new();
  EM.ensureComponentOn(worldGizmo, PositionDef, V(-10, -5, -10));
  EM.ensureComponentOn(worldGizmo, ScaleDef, V(10, 10, 10));
  EM.ensureComponentOn(worldGizmo, RenderableConstructDef, gizmoMesh.proto);

  const b1 = EM.new();
  const m1 = cloneMesh(res.allMeshes.cube.mesh);
  EM.ensureComponentOn(b1, RenderableConstructDef, m1);
  EM.ensureComponentOn(b1, ColorDef, V(0.1, 0.1, 0.1));
  EM.ensureComponentOn(b1, PositionDef, V(0, 0, 3));
  EM.ensureComponentOn(b1, RotationDef);
  EM.ensureComponentOn(b1, AngularVelocityDef, V(0, 0.001, 0.001));
  EM.ensureComponentOn(b1, WorldFrameDef);
  EM.ensureComponentOn(b1, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.cube.aabb,
  });
  // EM.ensureComponentOn(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  const b2 = g;
  const m2 = cloneMesh(res.allMeshes.cube.mesh);
  EM.ensureComponentOn(b2, RenderableConstructDef, m2);
  EM.ensureComponentOn(b2, ColorDef, V(0.1, 0.1, 0.1));
  EM.ensureComponentOn(b2, PositionDef, V(0, 0, 0));
  // EM.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
  EM.ensureComponentOn(b2, WorldFrameDef);
  // EM.ensureComponentOn(b2, PhysicsParentDef, g.id);
  EM.ensureComponentOn(b2, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.cube.aabb,
  });
  // EM.ensureComponentOn(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  const b3 = EM.new();
  const m3 = cloneMesh(res.allMeshes.ball.mesh);
  EM.ensureComponentOn(b3, RenderableConstructDef, m3);
  EM.ensureComponentOn(b3, ColorDef, V(0.1, 0.1, 0.1));
  EM.ensureComponentOn(b3, PositionDef, V(0, 0, -4));
  EM.ensureComponentOn(b3, RotationDef);
  EM.ensureComponentOn(b3, WorldFrameDef);
  EM.ensureComponentOn(b3, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.ball.aabb,
  });

  const b4 = EM.new();
  const m4 = cloneMesh(res.allMeshes.tetra.mesh);
  EM.ensureComponentOn(b4, RenderableConstructDef, m4);
  EM.ensureComponentOn(b4, ColorDef, V(0.1, 0.1, 0.1));
  EM.ensureComponentOn(b4, PositionDef, V(0, -3, 0));
  EM.ensureComponentOn(b4, RotationDef);
  EM.ensureComponentOn(b4, WorldFrameDef);
  EM.ensureComponentOn(b4, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.tetra.aabb,
  });

  // NOTE: this uses temp vectors, it must not live long
  // TODO(@darzu): for perf, this should be done only once per obj per frame;
  //    maybe we should transform the dir instead
  function createWorldShape(
    g: GameMesh,
    pos: vec3,
    rot: quat,
    lastWorldPos: vec3
  ): Shape {
    const transform = mat4.fromRotationTranslation(rot, pos, mat4.create());
    const worldVerts = g.uniqueVerts.map((p) =>
      vec3.transformMat4(p, transform)
    );
    const support = (d: vec3) => farthestPointInDir(worldVerts, d);
    const center = vec3.transformMat4(g.center, transform);
    const travel = vec3.sub(pos, lastWorldPos);
    return {
      center,
      support,
      travel,
    };
  }

  let lastPlayerPos = vec3.clone(b2.position);
  let lastPlayerRot = quat.clone(b2.rotation);
  let lastWorldPos: vec3[] = [
    vec3.clone(b1.position),
    vec3.clone(b3.position),
    vec3.clone(b4.position),
  ];
  let lastWorldRot: quat[] = [
    quat.clone(b1.rotation),
    quat.clone(b3.rotation),
    quat.clone(b4.rotation),
  ];

  EM.addSystem(
    "checkGJK",
    Phase.GAME_WORLD,
    null,
    [InputsDef],
    (_, { inputs }) => {
      // console.log(__frame);
      // __frame++;
      // if (!inputs.keyClicks["g"]) return;

      // TODO(@darzu):

      let playerShape = createWorldShape(
        res.allMeshes.cube,
        b2.position,
        b2.rotation,
        lastPlayerPos
      );

      const gameMeshes = [
        res.allMeshes.cube,
        res.allMeshes.ball,
        res.allMeshes.tetra,
      ];
      const ents = [b1, b3, b4];

      let backTravelD = 0;

      for (let i = 0; i < ents.length; i++) {
        b2.color[i] = 0.1;
        ents[i].color[i] = 0.1;

        let shapeOther = createWorldShape(
          gameMeshes[i],
          ents[i].position,
          ents[i].rotation,
          lastWorldPos[i]
        );
        let simplex = gjk(shapeOther, playerShape);
        if (simplex) {
          b2.color[i] = 0.3;
          ents[i].color[i] = 0.3;
        }
        if (
          simplex &&
          (!quat.equals(lastWorldRot[i], ents[i].rotation) ||
            !quat.equals(lastPlayerRot, g.rotation))
        ) {
          // rotation happened, undo it
          quat.copy(ents[i].rotation, lastWorldRot[i]);
          quat.copy(g.rotation, lastPlayerRot);

          shapeOther = createWorldShape(
            gameMeshes[i],
            ents[i].position,
            ents[i].rotation,
            lastWorldPos[i]
          );
          playerShape = createWorldShape(
            res.allMeshes.cube,
            b2.position,
            b2.rotation,
            lastPlayerPos
          );
          simplex = gjk(shapeOther, playerShape);
        }

        if (simplex) {
          const penD = penetrationDepth(shapeOther, playerShape, simplex);
          const travelD = vec3.length(playerShape.travel);
          if (penD < Infinity) {
            backTravelD += penD;
          }
          if (penD > travelD + PAD) console.error(`penD > travelD`);
          // console.log(
          //   `penD: ${penD.toFixed(3)}, travelD: ${travelD.toFixed(3)}`
          // );
        }
      }

      backTravelD = Math.min(backTravelD, vec3.length(playerShape.travel));
      const travelN = vec3.normalize(playerShape.travel);
      const backTravel = vec3.scale(travelN, backTravelD);

      // console.log(backTravel);
      // console.log(backTravel);
      vec3.sub(b2.position, backTravel, b2.position);

      lastWorldPos = [
        vec3.clone(b1.position),
        vec3.clone(b3.position),
        vec3.clone(b4.position),
      ];
      lastWorldRot = [
        quat.clone(b1.rotation),
        quat.clone(b3.rotation),
        quat.clone(b4.rotation),
      ];
      lastPlayerPos = vec3.clone(b2.position);
      lastPlayerRot = quat.clone(b2.rotation);
    }
  );

  dbgLogMilestone("Game playable");
}
