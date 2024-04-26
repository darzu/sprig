import { CameraDef } from "../camera/camera.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { Entity, EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, V4, quat, mat4, V, tV } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ColliderDef, isAABBCollider } from "./collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { Shape, gjk, penetrationDepth } from "./narrowphase.js";
import { WorldFrameDef } from "./nonintersection.js";
import { PAD } from "./phys.js";
import { PositionDef, RotationDef, ScaleDef } from "./transform.js";
import { PointLightDef } from "../render/lights.js";
import {
  Mesh,
  RawMesh,
  cloneMesh,
  getAABBFromMesh,
  mapMeshPositions,
  mergeMeshes,
  scaleMesh,
  scaleMesh3,
} from "../meshes/mesh.js";
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
import { assert, dbgLogMilestone, range } from "../utils/util.js";
import {
  ObjChildEnt,
  ObjEnt,
  createObj,
  defineObj,
  mixinObj,
} from "../ecs/objects.js";
import { ALPHA_MASK, GRID_MASK } from "../render/pipeline-masks.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { OBB, OBBDef } from "./obb.js";
import { Sphere } from "./broadphase.js";
import { getHalfsizeFromAABB, getSizeFromAABB } from "./aabb.js";
import { min, sum } from "../utils/math.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import { initGhost } from "../graybox/graybox-helpers.js";

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
    // alphaRenderPipeline,
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

  // ghost mesh
  const ghostMesh = cloneMesh(res.allMeshes.ball.mesh);
  scaleMesh(ghostMesh, 0.3);
  const ghostGameMesh = gameMeshFromMesh(ghostMesh, res.renderer.renderer);

  // ghost
  const g = initGhost(ghostMesh);
  g.controllable.speed /= 10;
  // const g = createGhost(ghostMesh);
  // // EM.set(g, RenderableConstructDef, res.allMeshes.cube.proto);
  // // createPlayer();

  // quat.copy(g.rotation, [0.0, 0.0, 0.0, 1.0]);
  V3.copy(g.cameraFollow.positionOffset, [0.0, -5.0, 0.0]);
  // g.cameraFollow.yawOffset = -0.034;
  // g.cameraFollow.pitchOffset = -0.428;

  // g.controllable.modes.canYaw = false;
  // g.controllable.modes.canCameraYaw = true;
  // g.controllable.modes.canPitch = true;
  g.controllable.speed *= 0.5;
  g.controllable.sprintMul = 4;

  EM.set(g, ColorDef, V(0.1, 0.1, 0.1));
  // EM.set(g, PositionDef, V(0, 0, 4));
  // // EM.set(b2, PositionDef, [0, 0, -1.2]);
  EM.set(g, WorldFrameDef);
  // // EM.set(b2, PhysicsParentDef, g.id);
  EM.set(g, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: getAABBFromMesh(ghostMesh),
  });

  gjkTest(g, ghostGameMesh);

  obbTest(g);
}

async function obbTest(
  g: EntityW<[typeof WorldFrameDef, typeof ColorDef, typeof ColliderDef]>
) {
  const res = await EM.whenResources(AllMeshesDef);

  const BoxDef = [
    RenderableConstructDef,
    PositionDef,
    AngularVelocityDef,
    RotationDef,
  ] as const;

  const cubeMesh = res.allMeshes.cube.mesh;

  const _cubes = [
    createObj(BoxDef, [
      [
        scaleMesh3(cloneMesh(cubeMesh), [1, 2, 1]),
        // undefined,
        // undefined,
        // ALPHA_MASK,
      ],
      [3, 10, 3],
      [0, 0.001, 0.001],
      quat.fromYawPitchRoll(0, 0, 0),
    ]),
    createObj(BoxDef, [
      [
        scaleMesh3(cloneMesh(cubeMesh), [0.5, 2, 0.75]),
        // false,
        // undefined,
        // ALPHA_MASK,
      ],
      [-3, 10, 3],
      [0, 0, 0],
      quat.fromYawPitchRoll(0.3, 0, 0),
    ]),
    createObj(BoxDef, [
      [
        scaleMesh3(cloneMesh(cubeMesh), [0.5, 2, 0.75]),
        // false,
        // undefined,
        // ALPHA_MASK,
      ],
      [-3, 20, 3],
      [0, 0, 0],
      quat.fromYawPitchRoll(0, 0.3, 0),
    ]),
  ];

  const cubes = _cubes.map((c) => {
    mixinObj(c, [ColorDef, WorldFrameDef, ColliderDef, OBBDef] as const, [
      V(0.1, 0.1, 0.1),
      undefined,
      {
        shape: "AABB",
        solid: false,
        aabb: getAABBFromMesh(c.renderableConstruct.meshOrProto as RawMesh),
      },
      undefined,
    ]);
    return c as ObjChildEnt<typeof ObjDef>;
  });

  assert(isAABBCollider(g.collider));
  const gSphere: Sphere = {
    org: V3.mk(),
    rad: Math.max(...getHalfsizeFromAABB(g.collider.aabb)),
  };

  const DBG_OBB_VIZ = false;

  const obbViz = new Map<
    number,
    EntityW<
      [
        typeof RenderableConstructDef,
        typeof PositionDef,
        typeof RotationDef,
        typeof ScaleDef
      ]
    >
  >();

  EM.addSystem("obbSandbox", Phase.GAME_WORLD, [OBBDef, ColorDef], [], (es) => {
    V3.copy(gSphere.org, g.world.position);

    for (let e of es) {
      e.color[1] = 0.1;
      if (e.obb.vsSphere(gSphere)) {
        e.color[1] = 0.3;
      }

      if (DBG_OBB_VIZ) {
        let viz = obbViz.get(e.id);
        if (!viz) {
          const m = checkerMesh(mkCubeMesh(), [4, 4, 4]);
          // scaleMesh3(m, e.obb.halfw);
          viz = createObj(
            [
              RenderableConstructDef,
              PositionDef,
              RotationDef,
              ScaleDef,
              ColorDef,
            ] as const,
            [[m], undefined, undefined, undefined, [0.2, 0.2, 0.2]]
          );
          obbViz.set(e.id, viz);
        }
        V3.copy(viz.position, e.obb.center);
        V3.copy(viz.scale, e.obb.halfw);
        quat.fromMat3(e.obb.mat, viz.rotation);
      }
    }
  });
}

function checkerMesh(m: Mesh, xyz: V3.InputT): Mesh {
  const aabb = getAABBFromMesh(m);
  const size = getSizeFromAABB(aabb);
  // const halfSize = V3.scale(size, 0.5);
  const newSize = tV(size[0] / xyz[0], size[1] / xyz[1], size[2] / xyz[2]);
  const scale3 = tV(
    newSize[0] / size[0],
    newSize[1] / size[1],
    newSize[2] / size[2]
  );
  mapMeshPositions(m, (p) => V3.sub(p, aabb.min, p)); // move to origin
  scaleMesh3(m, scale3);
  let meshes: Mesh[] = [];
  for (let xi of range(xyz[0]))
    for (let yi of range(xyz[1]))
      for (let zi of range(xyz[2])) {
        if ((xi + yi + zi) % 2 === 1) continue;
        if (
          xi !== 0 &&
          xi !== xyz[0] - 1 &&
          yi !== 0 &&
          yi !== xyz[1] - 1 &&
          zi !== 0 &&
          zi !== xyz[2] - 1
        )
          continue;
        const x = xi * newSize[0] + aabb.min[0];
        const y = yi * newSize[1] + aabb.min[1];
        const z = zi * newSize[2] + aabb.min[2];
        const c = cloneMesh(m);
        mapMeshPositions(c, (p) => V3.add(p, [x, y, z], p));
        meshes.push(c);
      }
  const res = mergeMeshes(...meshes);
  return res;
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

  EM.addSystem("checkGJK", Phase.GAME_WORLD, null, [], (_, {}) => {
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
      // g.color[i] = 0.1;
      gjkEnts[i].color[i] = 0.1;

      let shapeOther = createWorldShape(
        gjkGameMeshes[i],
        gjkEnts[i].position,
        gjkEnts[i].rotation,
        lastWorldPos[i]
      );
      let simplex = gjk(shapeOther, playerShape);
      if (simplex) {
        // g.color[i] = 0.3;
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
  });

  dbgLogMilestone("Game playable");
}

// interface ObbViz {
//   e: Entity;
// }

// function updateObbViz() {
//   // TODO(@darzu):
// }
