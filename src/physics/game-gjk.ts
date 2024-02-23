import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ColliderDef } from "./collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { Shape, gjk, penetrationDepth } from "./narrowphase.js";
import { WorldFrameDef } from "./nonintersection.js";
import { PAD } from "./phys.js";
import { PositionDef, RotationDef, ScaleDef } from "./transform.js";
import { PointLightDef } from "../render/lights.js";
import { Mesh, cloneMesh, getAABBFromMesh, scaleMesh } from "../meshes/mesh.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { farthestPointInDir } from "../utils/utils-3d.js";
import { AllMeshesDef, GizmoMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { GameMesh, gameMeshFromMesh } from "../meshes/mesh-loader.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { createGhost } from "../debug/ghost.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { dbgLogMilestone } from "../utils/util.js";
import { createObj, defineObj } from "../graybox/objects.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";

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

const ObjDef = [
  RenderableConstructDef,
  ColorDef,
  PositionDef,
  RotationDef,
  WorldFrameDef,
  ColliderDef,
  AngularVelocityDef,
] as const;

let __frame = 0;
export async function initGJKSandbox() {
  stdGridRender.fragOverrides!.lineSpacing1 = 1.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.02;
  stdGridRender.fragOverrides!.lineSpacing2 = 0.05;
  stdGridRender.fragOverrides!.lineWidth2 = 0.0;
  stdGridRender.fragOverrides!.ringStart = 0;
  stdGridRender.fragOverrides!.ringWidth = 0;

  console.log(`stdGridRender.fragOverrides:`);
  console.dir(stdGridRender.fragOverrides);

  outlineRender.fragOverrides!.lineWidth = 4;

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
    stdMeshPipe,
    outlineRender,
    deferredPipeline,
    stdGridRender,
    postProcess,
  ];

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * res.camera.viewDist, 2 * res.camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [1, 1, 0.5],
      // color: [1, 1, 1],
    }
  );

  // sun
  const sunlight = createObj(
    [PointLightDef, PositionDef, RenderableConstructDef] as const,
    {
      pointLight: {
        constant: 1.0,
        ambient: V(0.8, 0.8, 0.8),
      },
      position: [10, 10, 100],
      renderableConstruct: [res.allMeshes.ball.proto],
    }
  );

  // TODO(@darzu): use or lose global cursor stuff?
  console.log(`assuming global cursor`);
  console.dir(res.globalCursor3d);
  console.dir(res.globalCursor3d.cursor());
  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  // // ground
  // const ground = createObj(
  //   [RenderableConstructDef, ColorDef, PositionDef] as const,
  //   [[PlaneMesh], V(0.2, 0.3, 0.2), V(0, 0, -5)]
  // );

  // world gizmo
  const worldGizmo = createObj(
    [PositionDef, ScaleDef, RenderableConstructDef] as const,
    [[0, 0, 0], [1, 1, 1], [GizmoMesh]]
  );

  // ghost
  const ghostMesh = cloneMesh(res.allMeshes.cube.mesh);
  scaleMesh(ghostMesh, 0.5);
  const ghostGameMesh = gameMeshFromMesh(ghostMesh, res.renderer.renderer);
  const g = createGhost(ghostMesh);
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
  EM.set(g, PositionDef, V(0, 0, 4));
  // EM.set(b2, PositionDef, [0, 0, -1.2]);
  EM.set(g, WorldFrameDef);
  // EM.set(b2, PhysicsParentDef, g.id);
  EM.set(g, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: getAABBFromMesh(ghostMesh),
  });
  // EM.set(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });
  gjkTest(g, ghostGameMesh);
}

async function gjkTest(
  g: EntityW<[typeof PositionDef, typeof RotationDef, typeof ColorDef]>,
  ghostGameMesh: GameMesh
) {
  const res = await EM.whenResources(AllMeshesDef, RendererDef);

  const gjkGameMeshes = [
    res.allMeshes.cube,
    res.allMeshes.ball,
    res.allMeshes.tetra,
  ];

  // cube
  const cube = createObj(ObjDef, [
    [cloneMesh(res.allMeshes.cube.mesh)],
    V(0.1, 0.1, 0.1),
    V(3, 0, 3),
    undefined,
    undefined,
    {
      shape: "AABB",
      solid: false,
      aabb: res.allMeshes.cube.aabb,
    },
    V(0, 0.001, 0.001),
  ]);

  // ball
  const ball = createObj(ObjDef, [
    [cloneMesh(res.allMeshes.ball.mesh)],
    V(0.1, 0.1, 0.1),
    V(-4, 0, 3),
    undefined,
    undefined,
    {
      shape: "AABB",
      solid: false,
      aabb: res.allMeshes.ball.aabb,
    },
    undefined,
  ]);
  // EM.set(ball, ScaleDef, [0.5, 0.5, 0.5]);

  // tetra
  const tetra = createObj(ObjDef, [
    [cloneMesh(res.allMeshes.tetra.mesh)],
    V(0.1, 0.1, 0.1),
    V(0, 0, 0),
    undefined,
    undefined,
    {
      shape: "AABB",
      solid: false,
      aabb: res.allMeshes.tetra.aabb,
    },
    undefined,
  ]);

  const gjkEnts = [cube, ball, tetra];

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
    V3.clone(cube.position),
    V3.clone(ball.position),
    V3.clone(tetra.position),
  ];
  let lastWorldRot: quat[] = [
    quat.clone(cube.rotation),
    quat.clone(ball.rotation),
    quat.clone(tetra.rotation),
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
        ghostGameMesh,
        g.position,
        g.rotation,
        lastPlayerPos
      );

      let backTravelD = 0;

      for (let i = 0; i < gjkEnts.length; i++) {
        g.color[i] = 0.1;
        gjkEnts[i].color[i] = 0.1;

        let shapeOther = createWorldShape(
          gjkGameMeshes[i],
          gjkEnts[i].position,
          gjkEnts[i].rotation,
          lastWorldPos[i]
        );
        let simplex = gjk(shapeOther, playerShape);
        if (simplex) {
          g.color[i] = 0.3;
          gjkEnts[i].color[i] = 0.3;
        }
        if (
          simplex &&
          (!quat.equals(lastWorldRot[i], gjkEnts[i].rotation) ||
            !quat.equals(lastPlayerRot, g.rotation))
        ) {
          // rotation happened, undo it
          quat.copy(gjkEnts[i].rotation, lastWorldRot[i]);
          quat.copy(g.rotation, lastPlayerRot);

          shapeOther = createWorldShape(
            gjkGameMeshes[i],
            gjkEnts[i].position,
            gjkEnts[i].rotation,
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
        V3.clone(cube.position),
        V3.clone(ball.position),
        V3.clone(tetra.position),
      ];
      lastWorldRot = [
        quat.clone(cube.rotation),
        quat.clone(ball.rotation),
        quat.clone(tetra.rotation),
      ];
      lastPlayerPos = V3.clone(g.position);
      lastPlayerRot = quat.clone(g.rotation);
    }
  );

  dbgLogMilestone("Game playable");
}
