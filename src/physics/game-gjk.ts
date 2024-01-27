import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/entity-manager.js";
import { V2, V3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
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
import { AllMeshesDef, GizmoMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { GameMesh } from "../meshes/mesh-loader.js";
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
  EM.set(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  V3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  // vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sunlight, PositionDef, V(10, 10, 100));
  EM.set(sunlight, RenderableConstructDef, res.allMeshes.ball.proto);

  // TODO(@darzu): use or lose global cursor stuff?
  console.log(`assuming global cursor`);
  console.dir(res.globalCursor3d);
  console.dir(res.globalCursor3d.cursor());
  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  // ground
  const ground = EM.new();
  EM.set(ground, RenderableConstructDef, PlaneMesh);
  EM.set(ground, ColorDef, V(0.2, 0.3, 0.2));
  EM.set(ground, PositionDef, V(0, 0, -5));

  // world gizmo
  const worldGizmo = EM.new();
  EM.set(worldGizmo, PositionDef, V(-10, -10, -5));
  EM.set(worldGizmo, ScaleDef, V(10, 10, 10));
  EM.set(worldGizmo, RenderableConstructDef, GizmoMesh);

  // cube
  const b1 = EM.new();
  const m1 = cloneMesh(res.allMeshes.cube.mesh);
  EM.set(b1, RenderableConstructDef, m1);
  EM.set(b1, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(b1, PositionDef, V(3, 0, 0));
  EM.set(b1, RotationDef);
  EM.set(b1, AngularVelocityDef, V(0, 0.001, 0.001));
  EM.set(b1, WorldFrameDef);
  EM.set(b1, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.cube.aabb,
  });
  // EM.set(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  // us / ghost
  const m2 = cloneMesh(res.allMeshes.cube.mesh);

  // ghost
  const g = createGhost(m2);
  // EM.set(g, RenderableConstructDef, res.allMeshes.cube.proto);
  // createPlayer();

  V3.copy(g.position, [-3.42, -1.21, 1.88]);
  quat.copy(g.rotation, [0.0, 0.0, 0.0, 1.0]);
  V3.copy(g.cameraFollow.positionOffset, [0.0, -5.0, 0.0]);
  g.cameraFollow.yawOffset = -0.034;
  g.cameraFollow.pitchOffset = -0.428;

  g.controllable.modes.canYaw = false;
  g.controllable.modes.canCameraYaw = true;
  // g.controllable.modes.canPitch = true;
  g.controllable.speed *= 0.5;
  g.controllable.sprintMul = 10;

  EM.set(g, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(g, PositionDef, V(0, 0, 1));
  // EM.set(b2, PositionDef, [0, 0, -1.2]);
  EM.set(g, WorldFrameDef);
  // EM.set(b2, PhysicsParentDef, g.id);
  EM.set(g, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.cube.aabb,
  });
  // EM.set(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  // ball
  const b3 = EM.new();
  const m3 = cloneMesh(res.allMeshes.ball.mesh);
  EM.set(b3, RenderableConstructDef, m3);
  EM.set(b3, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(b3, PositionDef, V(-4, 0, 0));
  EM.set(b3, RotationDef);
  EM.set(b3, WorldFrameDef);
  EM.set(b3, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.ball.aabb,
  });

  // tetra
  const b4 = EM.new();
  const m4 = cloneMesh(res.allMeshes.tetra.mesh);
  EM.set(b4, RenderableConstructDef, m4);
  EM.set(b4, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(b4, PositionDef, V(0, 0, -3));
  EM.set(b4, RotationDef);
  EM.set(b4, WorldFrameDef);
  EM.set(b4, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.tetra.aabb,
  });

  // NOTE: this uses temp vectors, it must not live long
  // TODO(@darzu): for perf, this should be done only once per obj per frame;
  //    maybe we should transform the dir instead
  function createWorldShape(
    g: GameMesh,
    pos: V3,
    rot: quat,
    lastWorldPos: V3
  ): Shape {
    const transform = mat4.fromRotationTranslation(rot, pos, mat4.create());
    const worldVerts = g.uniqueVerts.map((p) => V3.tMat4(p, transform));
    const support = (d: V3) => farthestPointInDir(worldVerts, d);
    const center = V3.tMat4(g.center, transform);
    const travel = V3.sub(pos, lastWorldPos);
    return {
      center,
      support,
      travel,
    };
  }

  let lastPlayerPos = V3.clone(g.position);
  let lastPlayerRot = quat.clone(g.rotation);
  let lastWorldPos: V3[] = [
    V3.clone(b1.position),
    V3.clone(b3.position),
    V3.clone(b4.position),
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
        g.position,
        g.rotation,
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
        g.color[i] = 0.1;
        ents[i].color[i] = 0.1;

        let shapeOther = createWorldShape(
          gameMeshes[i],
          ents[i].position,
          ents[i].rotation,
          lastWorldPos[i]
        );
        let simplex = gjk(shapeOther, playerShape);
        if (simplex) {
          g.color[i] = 0.3;
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
            g.position,
            g.rotation,
            lastPlayerPos
          );
          simplex = gjk(shapeOther, playerShape);
        }

        if (simplex) {
          const penD = penetrationDepth(shapeOther, playerShape, simplex);
          const travelD = V3.len(playerShape.travel);
          if (penD < Infinity) {
            backTravelD += penD;
          }
          if (penD > travelD + PAD) console.error(`penD > travelD`);
          // console.log(
          //   `penD: ${penD.toFixed(3)}, travelD: ${travelD.toFixed(3)}`
          // );
        }
      }

      backTravelD = Math.min(backTravelD, V3.len(playerShape.travel));
      const travelN = V3.norm(playerShape.travel);
      const backTravel = V3.scale(travelN, backTravelD);

      // console.log(backTravel);
      // console.log(backTravel);
      V3.sub(g.position, backTravel, g.position);

      lastWorldPos = [
        V3.clone(b1.position),
        V3.clone(b3.position),
        V3.clone(b4.position),
      ];
      lastWorldRot = [
        quat.clone(b1.rotation),
        quat.clone(b3.rotation),
        quat.clone(b4.rotation),
      ];
      lastPlayerPos = V3.clone(g.position);
      lastPlayerRot = quat.clone(g.rotation);
    }
  );

  dbgLogMilestone("Game playable");
}
