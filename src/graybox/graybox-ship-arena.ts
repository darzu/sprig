import { StatBarDef, createMultiBarMesh } from "../adornments/status-bar.js";
import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { fireBullet } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16, seqEndesga16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { DeletedDef } from "../ecs/delete.js";
import { EM, EntityW, Resources } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { createHexGrid, hexXYZ, hexesWithin } from "../hex/hex.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { InputsDef } from "../input/inputs.js";
import {
  HasRudderDef,
  HasRudderObj,
  createRudder,
  createRudderTurret,
} from "../ld53/rudder.js";
import { V, quat, tmpStack, V3, mat4, V4 } from "../matrix/sprig-matrix.js";
import {
  BallMesh,
  CannonMesh,
  CubeMesh,
  HexMesh,
  MastMesh,
  PlaneMesh,
  TetraMesh,
} from "../meshes/mesh-list.js";
import {
  Mesh,
  RawMesh,
  cloneMesh,
  getAABBFromMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
} from "../meshes/mesh.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { GravityDef } from "../motion/gravity.js";
import {
  Parametric,
  ParametricDef,
  copyParamateric,
  createParametric,
  createPathFromParameteric,
} from "../motion/parametric-motion.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import {
  AABBCollider,
  ColliderDef,
  ColliderFromMeshDef,
} from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { onCollides } from "../physics/phys-helpers.js";
import {
  Frame,
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { CanvasDef, HasFirstInteractionDef } from "../render/canvas.js";
import { CyArray } from "../render/data-webgpu.js";
import { fullQuad } from "../render/gpu-helper.js";
import {
  CY,
  linearSamplerPtr,
  nearestSamplerPtr,
} from "../render/gpu-registry.js";
import { GraphicsSettingsDef } from "../render/graphics-settings.js";
import { PointLightDef } from "../render/lights.js";
import {
  DEFAULT_MASK,
  GRID_MASK,
  JFA_PRE_PASS_MASK,
} from "../render/pipeline-masks.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import {
  DotStruct,
  DotTS,
  MAX_NUM_DOTS,
  dotDataPtr,
  initDots,
  renderDots,
} from "../render/pipelines/std-dots.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import {
  LineRenderDataDef,
  lineMeshPoolPtr,
  pointMeshPoolPtr,
  stdLinePrepassPipe,
  stdLinesRender,
  stdPointPrepassPipe,
  stdPointsRender,
  xpPointLitTex,
  xpPointMaskTex,
} from "../render/pipelines/std-line-point.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RenderDataStdDef,
  canvasTexturePtr,
  meshPoolPtr,
  sceneBufPtr,
} from "../render/pipelines/std-scene.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import {
  align,
  clamp,
  jitter,
  lerp,
  randInt,
  remap,
  unlerp,
  wrap,
} from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { PI, flatten } from "../utils/util-no-import.js";
import { assert, dbgOnce, range, zip } from "../utils/util.js";
import {
  angleBetween,
  angleBetweenXZ,
  computeTriangleNormal,
  randNormalVec3,
  randVec3OfLen,
  signedAreaOfTriangle,
  vec3Dbg,
} from "../utils/utils-3d.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { HasMastDef, HasMastObj, createMast } from "../wind/mast.js";
import { WindDef, setWindAngle } from "../wind/wind.js";
import { createSock } from "../wind/windsock.js";
import { dbgPathWithGizmos } from "../wood/shipyard.js";
import { DotsDef } from "./dots.js";
import { GlitchDef } from "./glitch.js";
import { createSun, initGhost, initGrayboxWorld } from "./graybox-helpers.js";
import { testingLSys } from "./l-systems.js";
import { ObjEnt, T, createObj, defineObj, mixinObj } from "./objects.js";

/*
Prioritized ToDo:
[x] aim cannon
[x] enemy exists
[ ] player and enemy health
[x] enemy moves
[ ] enemy fires
[ ] smart enemy ai    
*/

const DBG_GHOST = true;
const DBG_GIZMO = true;
const DBG_DOTS = false;
const DBG_ENEMY = true;
const DBG_POINTS = true;
const DBG_LINE = true;

const SAIL_FURL_RATE = 0.02;

const CannonObj = defineObj({
  name: "cannon2",
  propsType: T<{ yaw: number }>(),
  components: [
    PositionDef,
    RotationDef,
    RenderableConstructDef,
    ColorDef,
    YawPitchDef,
  ],
} as const);

const ShipObj = defineObj({
  name: "ship",
  components: [
    ColorDef,
    PositionDef,
    RenderableConstructDef,
    CameraFollowDef,
    LinearVelocityDef,
  ],
  physicsParentChildren: true,
  children: {
    cannonL0: CannonObj,
    cannonL1: CannonObj,
    cannonL2: CannonObj,
    cannonR0: CannonObj,
    cannonR1: CannonObj,
    cannonR2: CannonObj,
  },
} as const);

const ShipDef = ShipObj.props;

const CannonBallObj = defineObj({
  name: "cannonBall",
  components: [
    PositionDef,
    RotationDef,
    ParametricDef,
    ColorDef,
    RenderableConstructDef,
    ColliderFromMeshDef,
  ],
} as const);
const CannonBallDef = CannonBallObj.props;

const EnemyObj = defineObj({
  name: "enemy",
  propsType: T<{ sailTarget: V3 }>(),
  components: [
    RenderableConstructDef,
    PositionDef,
    ColorDef,
    ColliderFromMeshDef,
    LinearVelocityDef,
  ],
  physicsParentChildren: true,
  children: {
    healthBar: [StatBarDef, PositionDef, RenderableConstructDef],
  },
} as const);
const EnemyDef = EnemyObj.props;

function cannonFireCurve(frame: Frame, speed: number, out: Parametric) {
  // TODO(@darzu): IMPL!
  const axis = quat.fwd(frame.rotation);
  const vel = V3.scale(axis, speed);

  const time = EM.getResource(TimeDef)!;

  const GRAVITY = -8 * 0.00001;

  copyParamateric(out, {
    pos: frame.position,
    vel,
    accel: [0, 0, GRAVITY],
    time: time.time,
  });

  return out;
}

function launchBall(params: Parametric) {
  // TODO(@darzu): PERF. use pools!!
  const ball = createObj(CannonBallObj, {
    args: {
      position: undefined,
      rotation: undefined,
      parametric: params,
      color: ENDESGA16.darkGray,
      renderableConstruct: [BallMesh],
      colliderFromMesh: true,
    },
  });

  return ball;
}

interface DotPath {
  path: Path;
  isVisible: boolean;
  update: () => void;
  hide: () => void;
}
function mkDotPath(
  dotsRes: Resources<[typeof DotsDef]>,
  len: number,
  color: V3.InputT,
  size: number
): DotPath {
  const path: Path = range(len).map((_) => ({
    pos: V3.mk(),
    rot: quat.mk(),
  }));

  const dots = dotsRes.dots.allocDots(len);

  const dotPath = {
    path,
    // dots,
    isVisible: false,
    update,
    hide,
  };

  function update() {
    for (let i = 0; i < path.length; i++) dots.set(i, path[i].pos, color, size);
    dots.queueUpdate();
    dotPath.isVisible = true;
  }
  function hide() {
    if (dotPath.isVisible) {
      dots.data.forEach((d) => (d.size = 0.0));
      dots.queueUpdate();
      dotPath.isVisible = false;
    }
  }

  return dotPath;
}

// TODO(@darzu): projectile paths: use particle system?

const oceanRadius = 1;

function createOcean() {
  // TODO(@darzu): more efficient if we use one mesh
  const tileCS = [
    ColorDef,
    PositionDef,
    RenderableConstructDef,
    ScaleDef,
  ] as const;
  type typeT = EntityW<[...typeof tileCS]>;
  const size = 100;
  const height = 10;

  const createTile = (xyz: V3.InputT) =>
    createObj(tileCS, [
      V3.add(ENDESGA16.blue, randVec3OfLen(0.1)),
      xyz,
      [HexMesh],
      [size, size, height],
    ]);
  const grid = createHexGrid<typeT>();

  for (let [q, r] of hexesWithin(0, 0, oceanRadius)) {
    const loc = hexXYZ(V3.mk(), q, r, size);
    loc[2] -= height + 2;
    const tile = createTile(loc);
    grid.set(q, r, tile);
  }

  return grid;
}

const pointsJFA = createJfaPipelines(xpPointMaskTex, "interior", 64);

const pointJFAColorPipe = CY.createRenderPipeline("colorPointsJFA", {
  globals: [
    // { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: nearestSamplerPtr, alias: "samp" },
    { ptr: pointsJFA.voronoiTex, alias: "voronoiTex" },
    { ptr: xpPointLitTex, alias: "colorTex" },
    { ptr: fullQuad, alias: "quad" },
    sceneBufPtr,
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [
    {
      ptr: canvasTexturePtr,
      clear: "once",
    },
  ],
  shader: (shaderSet) => `
  ${shaderSet["std-helpers"].code}
  ${shaderSet["std-screen-quad-vert"].code}
  ${shaderSet["xp-point-voronoi"].code}
  `,
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});

// const dbgGrid = [
//   [xpPointTex, xpPointTex],
//   [xpPointTex, xpPointTex],
// ];
const dbgGrid = [
  [pointsJFA._inputMaskTex, pointsJFA._uvMaskTex],
  [pointsJFA.voronoiTex, pointsJFA.sdfTex],
  // [pointsJFA.voronoiTex],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);
// let dbgGridCompose = createGridComposePipelines(pointsJFA._debugGrid);

export async function initGrayboxShipArena() {
  // TODO(@darzu): WORLD GRID:
  /*
  plane fit to frustum
  uv based on world pos

  */

  // TODO(@darzu): WORK AROUND: see below

  const normalMode = false;

  EM.addSystem(
    "shipArenaPipelines",
    Phase.GAME_WORLD,
    [],
    [RendererDef, GraphicsSettingsDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [];
      if (normalMode)
        res.renderer.pipelines.push(
          ...shadowPipelines,
          stdMeshPipe,
          // stdLinesRender,
          renderDots,
          outlineRender,
          deferredPipeline,
          stdGridRender,
          stdLinesRender,
          stdPointsRender,
          postProcess
        );
      else
        res.renderer.pipelines.push(
          ...shadowPipelines,
          stdMeshPipe,
          stdLinePrepassPipe,
          stdPointPrepassPipe,
          // outlineRender,
          // deferredPipeline,
          // TODO(@darzu): experiment
          // TODO(@darzu): LIGHTING!
          // TODO(@darzu): OUTLINE?
          stdPointsRender,
          stdLinesRender,

          ...pointsJFA.allPipes(),

          // postProcess,

          pointJFAColorPipe
        );
      res.renderer.pipelines.push(
        ...(res.dev.showConsole ? dbgGridCompose : [])
      );
    }
  );

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 10000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // TODO(@darzu): WORK AROUND: For whatever reason this particular init order and this obj are
  //  needed to avoid a bug in canary (122.0.6255.1) not present in retail (120.0.6099.234)
  //  more on branch: white-screen-bug-repro
  // TODO(@darzu): if you're here from the future, try removing this workaround (this obj, collapse the
  //  whenResources calls, remove the unnecessary addEagerInit)
  const __bugWorkAround = createObj([RenderableConstructDef] as const, [
    [CubeMesh, false],
  ]);

  const res = await EM.whenResources(RendererDef, DotsDef);

  // sun
  createSun();

  // gizmo
  // const gizmo = addWorldGizmo(V(0, 0, 0), 50);
  // EM.set(gizmo, GlitchDef);

  // ocean
  // const oceanGrid = createOcean();

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  // line exp
  if (DBG_LINE) {
    const box = createObj(
      [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
      {
        renderableConstruct: [
          mkCubeMesh(),
          true,
          undefined,
          JFA_PRE_PASS_MASK | DEFAULT_MASK,
          lineMeshPoolPtr,
        ],
        position: [240, 40, 40],
        scale: [10, 10, 10],
        color: ENDESGA16.lightBrown,
      }
    );
    // EM.set(box, GlitchDef);
    EM.whenResources(BallMesh.def).then((ball) => {
      const mesh = cloneMesh(ball.mesh_ball.mesh);
      mesh.lines = range(9).map((_) => V(0, 1));

      const e = createObj(
        [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
        {
          renderableConstruct: [
            mesh,
            true,
            undefined,
            JFA_PRE_PASS_MASK | DEFAULT_MASK,
            lineMeshPoolPtr,
          ],
          position: [240, 80, 40],
          scale: [10, 10, 10],
          color: ENDESGA16.darkBrown,
        }
      );

      EM.set(e, GlitchDef);
    });
  }

  testingLSys();

  function distributePointsOnTriangleOrQuad(
    pos: V3[],
    ind: V3 | V4,
    ptsPerArea: number,
    quad: boolean
  ): V3[] {
    const points: V3[] = [];

    // TODO(@darzu): use blue noise!

    const p0 = pos[ind[0]];
    const p1 = pos[ind[1]];
    const p2 = quad ? pos[ind[3]] : pos[ind[2]];
    // const p2 = pos[ind[2]];

    const u = V3.sub(p2, p0);
    const v = V3.sub(p1, p0);
    const area = (quad ? 1 : 0.5) * V3.len(V3.cross(u, v));
    const num = align(Math.ceil(area * ptsPerArea), 2);
    // console.log(`area: ${area}, num: ${num}`);

    const _stk = tmpStack();

    for (let i = 0; i < num; i++) {
      // const uLen = V3.len(u);
      // const vLen = V3.len(v);

      let uLen = Math.random();
      let vLen = Math.random();
      if (!quad)
        while (uLen + vLen > 1.0) {
          // TODO(@darzu): reflect accross u = -v + 1
          uLen = Math.random();
          vLen = Math.random();
        }

      const randU = V3.scale(u, uLen);
      const randV = V3.scale(v, vLen);

      const newP = V3.add(p0, V3.add(randU, randV), V3.mk());
      points.push(newP);

      _stk.popAndRemark();
    }
    _stk.pop();

    return points;
  }

  function morphMeshIntoPts(m: RawMesh, ptsPerArea: number): void {
    scaleMesh(m, 0.99);

    // TODO(@darzu): use blue noise for even-ish distribution?

    // console.log("MORPH: " + m.dbgName);
    let newPoints: V3[] = [];
    let posNormals: V3[] = [];
    let _stk = tmpStack();
    for (let t of [...m.tri, ...m.quad]) {
      const norm = computeTriangleNormal(
        m.pos[t[0]],
        m.pos[t[1]],
        m.pos[t[2]],
        V3.mk()
      );
      // console.log(vec3Dbg(norm));
      const isQuad = t.length === 4;
      const ps = distributePointsOnTriangleOrQuad(m.pos, t, ptsPerArea, isQuad);
      ps.forEach((p) => newPoints.push(p));
      ps.forEach((_) => {
        const n = V3.clone(norm);
        V3.add(n, randVec3OfLen(0.05), n);
        V3.norm(n, n);
        posNormals.push(n);
        _stk.popAndRemark();
      }); // TODO(@darzu): okay to share normals like this?
      _stk.popAndRemark();
    }
    _stk.pop();
    m.pos = newPoints;
    m.tri = [];
    m.quad = [];
    m.colors = [];
    m.surfaceIds = [];
    m.lines = undefined;
    m.posNormals = posNormals;
    // console.dir(m);
  }

  // point exp
  if (DBG_POINTS) {
    function makePlaneMesh(
      x1: number,
      x2: number,
      y1: number,
      y2: number
    ): Mesh {
      const res: Mesh = {
        pos: [V(x1, y1, 0), V(x2, y1, 0), V(x2, y2, 0), V(x1, y2, 0)],
        tri: [],
        quad: [
          V(0, 1, 2, 3), // top
        ],
        colors: [V3.mk()],
        surfaceIds: [1],
        usesProvoking: true,
        dbgName: "plane",
      };
      return res;
    }
    EM.whenResources(BallMesh.def, TetraMesh.def, CubeMesh.def).then((res) => {
      const size = 512;
      const ptsPerArea = 1 / 32.0;
      // const ptsPerPlane = size * size * ptsPerArea;
      const xyPlane = makePlaneMesh(0, size, 0, size);
      const xzPlane = makePlaneMesh(0, size, 0, size);
      transformMesh(
        xzPlane,
        mat4.mul(mat4.fromYaw(PI / 2), mat4.fromRoll(-PI / 2))
      );
      const yzPlane = makePlaneMesh(0, size, 0, size);
      transformMesh(
        yzPlane,
        mat4.mul(mat4.fromYaw(-PI / 2), mat4.fromPitch(PI / 2))
      );

      const L = 0.1;
      // const planeColors: V3.InputT[] = [
      //   [L, L, 0],
      //   [L, 0, L],
      //   [0, L, L],
      // ];
      const planeColors: V3.InputT[] = [
        ENDESGA16.lightGray,
        ENDESGA16.lightGray,
        ENDESGA16.lightGray,
      ];
      let planeObjId = 200;
      for (let [plane, color] of zip(
        [xyPlane, xzPlane, yzPlane],
        planeColors
      )) {
        if (!normalMode) {
          let planePts = cloneMesh(plane);
          morphMeshIntoPts(planePts, ptsPerArea);
          createObj([RenderableConstructDef, PositionDef, ColorDef] as const, {
            renderableConstruct: [
              planePts,
              true,
              undefined,
              undefined,
              pointMeshPoolPtr,
              undefined,
              undefined,
              planeObjId,
            ],
            position: undefined,
            color,
          });
        }

        createObj([RenderableConstructDef, PositionDef, ColorDef] as const, {
          renderableConstruct: [
            plane,
            true,
            undefined,
            undefined,
            meshPoolPtr,
            undefined,
            undefined,
            planeObjId,
          ],
          position: undefined,
          color,
        });
      }

      // const ptMesh = cloneMesh(ball.mesh_ball.mesh);
      // // console.log(`ball tris: ${ptMesh.tri.length + ptMesh.quad.length * 2}`);
      // morphMeshIntoPts(ptMesh, 16);

      let objMeshes = [
        res.mesh_ball,
        res.mesh_tetra,
        res.mesh_cube,
        res.mesh_ball,
      ];

      let balLColors = [
        ENDESGA16.orange,
        ENDESGA16.blue,
        ENDESGA16.darkRed,
        ENDESGA16.darkGreen,
      ];

      let scales: V3.InputT[] = [
        [10, 10, 10],
        [10, 10, 20],
        [15, 15, 15],
        [10, 10, 10],
      ];

      for (let i = 0; i < 4; i++) {
        const objId = 100 + i;

        // const color = seqEndesga16();
        let pos: V3.InputT = [40 * (i + 1), 40 * (i + 1), 40];
        const color = balLColors[i];
        createObj(
          [
            RenderableConstructDef,
            PositionDef,
            ColorDef,
            ScaleDef,
            RotationDef,
          ] as const,
          {
            renderableConstruct: [
              objMeshes[i].proto,
              true,
              undefined,
              undefined,
              meshPoolPtr,
              undefined,
              undefined,
              objId,
            ],
            // position: [-40, 0, 40],
            position: pos,
            scale: scales[i],
            rotation: quat.fromYawPitchRoll(i * PI * 0.123),
            color,
          }
        );

        const ptMesh = cloneMesh(objMeshes[i].mesh);
        morphMeshIntoPts(ptMesh, 16);

        createObj(
          [
            RenderableConstructDef,
            PositionDef,
            ColorDef,
            ScaleDef,
            RotationDef,
          ] as const,
          {
            renderableConstruct: [
              ptMesh,
              true,
              undefined,
              undefined,
              pointMeshPoolPtr,
              undefined,
              undefined,
              objId,
            ],
            // position: [-40, 0, 40],
            position: pos,
            scale: scales[i],
            rotation: quat.fromYawPitchRoll(i * PI * 0.123),
            color,
          }
        );
      }

      // EM.set(e, GlitchDef);
    });
  }

  // bouncing balls
  // createBouncingBalls();

  // wind
  const wind = EM.addResource(WindDef);
  setWindAngle(wind, PI * 0.4);

  // player ship
  // const ship = await createShip();

  // enemy
  // createEnemy();

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  // cannon launch intermediates
  const _dotPaths: DotPath[] = [];
  function getDotPath(i: number) {
    assert(0 <= i && i <= 10);
    while (i >= _dotPaths.length) {
      _dotPaths.push(mkDotPath(res, 20, ENDESGA16.yellow, 1.0));
    }
    return _dotPaths[i];
  }

  const _launchParam: Parametric = createParametric();

  // let _imATmp = V3.tmp();

  EM.addSystem(
    "controlShip",
    Phase.GAME_PLAYERS,
    [ShipDef, HasRudderDef, HasMastDef, CameraFollowDef],
    [InputsDef, CanvasDef, RendererDef],
    (es, res) => {
      if (!res.htmlCanvas.hasMouseLock()) return;
      if (es.length === 0) return;
      assert(es.length === 1);
      const ship = es[0];

      const mast = ship.hasMast.mast;
      const rudder = ship.hasRudder.rudder;

      // _imATmp[1] += 2; // causes error! "Using tmp from gen 11 after reset! Current gen 42"

      // TODO(@darzu): how do we make this code re-usable across games and keybindings?
      // furl/unfurl
      const sail = mast.mast.sail.sail;
      if (res.inputs.keyDowns["w"]) sail.unfurledAmount += SAIL_FURL_RATE;
      if (res.inputs.keyDowns["s"]) sail.unfurledAmount -= SAIL_FURL_RATE;

      // rudder
      if (res.inputs.keyDowns["a"]) rudder.yawpitch.yaw -= 0.05;
      if (res.inputs.keyDowns["d"]) rudder.yawpitch.yaw += 0.05;
      rudder.yawpitch.yaw = clamp(rudder.yawpitch.yaw, -PI * 0.3, PI * 0.3);
      quat.fromYawPitchRoll(-rudder.yawpitch.yaw, 0, 0, rudder.rotation);

      // aiming?
      const aiming = res.inputs.keyDowns["shift"];

      // camera
      if (!aiming) {
        // TODO(@darzu): extract to some kinda ball cam?
        ship.cameraFollow.yawOffset += res.inputs.mouseMov[0] * 0.005;
        ship.cameraFollow.pitchOffset -= res.inputs.mouseMov[1] * 0.005;
        ship.cameraFollow.pitchOffset = clamp(
          ship.cameraFollow.pitchOffset,
          -PI * 0.5,
          0
        );
        ship.cameraFollow.yawOffset = wrap(
          ship.cameraFollow.yawOffset,
          -PI,
          PI
        );
      }

      // which cannons?
      const facingLeft = ship.cameraFollow.yawOffset < 0;
      const cannons = facingLeft
        ? [ship.ship.cannonL0, ship.ship.cannonL1, ship.ship.cannonL2]
        : [ship.ship.cannonR0, ship.ship.cannonR1, ship.ship.cannonR2];

      // aim cannons
      if (aiming) {
        for (let c of cannons) {
          c.yawpitch.yaw += res.inputs.mouseMov[0] * 0.005;
          c.yawpitch.pitch -= res.inputs.mouseMov[1] * 0.005;
          c.yawpitch.pitch = clamp(c.yawpitch.pitch, 0, PI * 0.5);
          c.yawpitch.yaw =
            clamp(c.yawpitch.yaw - c.cannon2.yaw, -PI * 0.2, PI * 0.2) +
            c.cannon2.yaw;
        }
      }
      for (let c of cannons) {
        quat.fromYawPitch(c.yawpitch, c.rotation);
      }

      // firing?
      const ballSpeed = 0.2;
      if (aiming) {
        const doFire = res.inputs.keyClicks[" "];

        let idx = 0;
        for (let c of cannons) {
          if (!WorldFrameDef.isOn(c)) continue;
          // get fire solution
          cannonFireCurve(c.world, ballSpeed, _launchParam);

          // display path
          const dotPath = getDotPath(idx);
          createPathFromParameteric(_launchParam, 100, dotPath.path);
          dotPath.update();

          // launch?
          if (doFire) {
            launchBall(_launchParam);
          }

          idx++;
        }
      } else {
        // hide path?
        _dotPaths.forEach((p) => p.hide());
      }
    }
  );

  onCollides([CannonBallDef], [EnemyDef], [], (ball, enemy) => {
    // TODO(@darzu):
    enemy.enemy.healthBar.statBar.value -= 10;
    EM.set(ball, DeletedDef);
  });

  initEnemies();
}

async function createBouncingBalls() {
  const ballObj = defineObj({
    name: "ball",
    components: [
      PositionDef,
      RotationDef,
      // AngularVelocityDef,
      ColorDef,
      RenderableConstructDef,
      ScaleDef,
    ],
  } as const);
  const { mesh_ball, renderer } = await EM.whenResources(
    BallMesh.def,
    RendererDef
  );
  const ballM1 = mesh_ball.proto;
  const _ballM2 = cloneMesh(ballM1.mesh);
  const ballM2 = renderer.renderer.stdPool.addMesh(_ballM2);

  const NUM = 10;
  // const RADIUS = 200;
  for (let i = 0; i < NUM; i++) {
    const t = i * ((PI * 2) / NUM);
    // const s = Math.random() * 50 + 5;
    const s = 25;
    // const ring = Math.floor(i / NUM);
    // const r = 100 + s * 5; // * Math.pow(5, ring);
    const r = 400;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    const glitch = i % 2 === 0;
    const ball = createObj(ballObj, {
      args: {
        scale: [s, s, s],
        position: [x, y, 0],
        renderableConstruct: [glitch ? ballM2 : ballM1],
        rotation: undefined,
        // angularVelocity: V3.scale(randNormalVec3(), 0.001),
        color: seqEndesga16(),
      },
    });
    if (glitch) EM.set(ball, GlitchDef);
  }
  EM.addSystem(
    "bounceBall",
    Phase.GAME_WORLD,
    [ballObj.props, PositionDef],
    [TimeDef],
    (es, res) => {
      for (let e of es) {
        const t = Math.atan2(e.position[1], e.position[0]);
        e.position[2] = 100 * Math.sin(t * 7.0 + res.time.time * 0.001);
      }
    }
  );
}

async function createShip() {
  const shipMesh = mkCubeMesh();
  shipMesh.pos.forEach((p) => {
    // top of ship at height 0
    p[2] -= 1.0;
    // scale
    p[0] *= 12;
    p[1] *= 24;
    p[2] *= 2;
  });

  const cSpacing = 10;
  const cannonLs: ObjEnt<typeof CannonObj>[] = [];
  const cannonRs: ObjEnt<typeof CannonObj>[] = [];
  for (let i = 0; i < 3; i++) {
    const y = -cSpacing + i * cSpacing;
    const cl = createObj(CannonObj, {
      props: {
        yaw: -PI * 0.5,
      },
      args: {
        position: [-10, y, 2],
        rotation: undefined,
        renderableConstruct: [CannonMesh],
        color: ENDESGA16.darkGray,
        yawpitch: [-PI * 0.5, PI * 0.1],
      },
    });
    EM.set(cl, GlitchDef);
    quat.fromYawPitch(cl.yawpitch, cl.rotation);
    cannonLs.push(cl);

    const cr = createObj(CannonObj, {
      props: {
        yaw: PI * 0.5,
      },
      args: {
        position: [+10, y, 2],
        rotation: undefined,
        renderableConstruct: [CannonMesh],
        color: ENDESGA16.darkGray,
        yawpitch: [PI * 0.5, PI * 0.1],
      },
    });
    EM.set(cr, GlitchDef);
    quat.fromYawPitch(cr.yawpitch, cr.rotation);
    cannonRs.push(cr);
  }

  const ship = ShipObj.new({
    args: {
      color: ENDESGA16.midBrown,
      position: [-200, -200, 3],
      renderableConstruct: [shipMesh],
      cameraFollow: undefined,
      linearVelocity: undefined,
    },
    children: {
      cannonL0: cannonLs[0],
      cannonL1: cannonLs[1],
      cannonL2: cannonLs[2],
      cannonR0: cannonRs[0],
      cannonR1: cannonRs[1],
      cannonR2: cannonRs[2],
    },
  });
  EM.set(ship, GlitchDef);

  const mast = createMast();
  EM.set(mast, GlitchDef);
  EM.set(mast.mast.sail, GlitchDef);

  mixinObj(ship, HasMastObj, {
    args: [],
    children: {
      mast,
    },
  });

  EM.whenEntityHas(mast, ColliderDef, PositionDef).then((mast) => {
    const sock = createSock(2.0);
    sock.position[2] =
      mast.position[2] + (mast.collider as AABBCollider).aabb.max[2];
    EM.set(sock, PhysicsParentDef, ship.id);
  });

  const rudder = createRudder();
  // console.log("setting position");
  V3.set(0, -25, 4, rudder.position);
  EM.set(rudder, GlitchDef);

  mixinObj(ship, HasRudderObj, {
    args: [],
    children: {
      rudder,
    },
  });

  V3.copy(ship.cameraFollow.positionOffset, [0.0, -100.0, 0]);
  ship.cameraFollow.pitchOffset = -PI * 0.2;

  if (DBG_GIZMO) addGizmoChild(ship, 10);

  return ship;
}

/*
enemy AI
--------
aim for tangent on circle around player
need:
  from point get two tangents on circle
  pick closest based on current direction


*/

// TODO(@darzu): move to maths
// NOTE: works on the XY plane; ignores Z
function getDirsToTan(
  src: V3.InputT,
  trg: V3.InputT,
  trgRad: number,
  outL: V3,
  outR: V3
): void {
  const srcToTrg = V3.sub(trg, src);
  const perpR: V3.InputT = [srcToTrg[1], -srcToTrg[0], 0];
  const normR = V3.norm(perpR);
  const scaledR = V3.scale(normR, trgRad);
  const scaledL = V3.neg(scaledR);
  V3.add(trg, scaledR, outR);
  V3.add(trg, scaledL, outL);
}

function createEnemy() {
  const shipMesh = mkCubeMesh();
  shipMesh.pos.forEach((p) => {
    // top of ship at height 0
    p[2] -= 1.0;
    // scale
    p[0] *= 12;
    p[1] *= 24;
    p[2] *= 2;
  });

  const ship = createObj(EnemyObj, {
    props: {
      sailTarget: V(0, 0, 0),
    },
    args: {
      color: ENDESGA16.darkRed,
      position: [-40, -40, 3],
      renderableConstruct: [shipMesh],
      colliderFromMesh: true,
      linearVelocity: undefined,
    },
    children: {
      // TODO(@darzu): it'd be nice if the healthbar faced the player.
      healthBar: {
        statBar: [0, 100, 80],
        position: [0, 0, 15],
        renderableConstruct: [
          createMultiBarMesh({
            width: 2,
            length: 30,
            centered: true,
            fullColor: ENDESGA16.red,
            missingColor: ENDESGA16.darkRed,
          }),
        ],
      },
    },
  });

  const mast = createMast();

  mixinObj(ship, HasMastObj, {
    args: [],
    children: {
      mast,
    },
  });

  const rudder = createRudder();
  V3.set(0, -25, 4, rudder.position);

  mixinObj(ship, HasRudderObj, {
    args: [],
    children: {
      rudder,
    },
  });
}

async function initEnemies() {
  const attackRadius = 100;

  const player = await EM.whenSingleEntity(ShipDef, PositionDef);

  const { dots } = await EM.whenResources(DotsDef);

  const trgDots = DBG_ENEMY ? dots.allocDots(10) : undefined;

  const steerFreq = 20;
  EM.addSystem(
    "enemySailFindTarget",
    Phase.GAME_WORLD,
    [EnemyDef, PositionDef, RotationDef, HasRudderDef],
    [TimeDef],
    (es, res) => {
      // run once every 20 frames
      if (res.time.step % steerFreq !== 0) return;

      for (let e of es) {
        const trgL = V3.tmp();
        const trgR = V3.tmp();
        getDirsToTan(e.position, player.position, attackRadius, trgL, trgR);

        let toTrgL = V3.sub(trgL, e.position);
        toTrgL = V3.norm(toTrgL);
        let toTrgR = V3.sub(trgR, e.position);
        toTrgR = V3.norm(toTrgR);

        const curDir = quat.fwd(e.rotation);

        const lDot = V3.dot(toTrgL, curDir);
        const rDot = V3.dot(toTrgR, curDir);

        const turnLeft = lDot > rDot;

        V3.copy(e.enemy.sailTarget, turnLeft ? trgL : trgR);

        if (DBG_ENEMY) {
          assert(trgDots);
          trgDots.set(0, e.enemy.sailTarget, ENDESGA16.red, 10);
          trgDots.set(1, turnLeft ? trgR : trgL, ENDESGA16.orange, 10);
          trgDots.queueUpdate();
        }
      }
    }
  );

  EM.addSystem(
    "enemySailToward",
    Phase.GAME_WORLD,
    [EnemyDef, PositionDef, RotationDef, HasRudderDef, HasMastDef],
    [TimeDef],
    (es, res) => {
      // if (res.time.step % steerFreq !== 0) return;

      // TODO(@darzu): can we show a ghost of where the enemy will be in 100 frames, 200 frames, etc... ?
      //  - find relevant systems, create N ghost copies, run them all in X times
      //  - systems need to be pure for this to work!

      for (let e of es) {
        // TODO(@darzu): maybe when you're within a certain range, turn to fire instead of turn to chase

        // stear
        const curDir = quat.fwd(e.rotation);
        const toTrg = V3.sub(e.enemy.sailTarget, e.position);
        const trgDist = V3.len(toTrg);
        const trgDir = V3.scale(toTrg, 1 / trgDist);
        const turnDot = V3.dot(curDir, trgDir);
        const MAX_TURN_STR = 0.05 * 4; // * steerFreq;
        const turnStr = remap(turnDot, -1, 0.8, MAX_TURN_STR, 0);
        const ang = angleBetween(curDir[0], curDir[1], trgDir[0], trgDir[1]);
        const turnSign = ang >= 0 ? -1 : 1;
        const turnYaw = turnSign * turnStr;
        const rudder = e.hasRudder.rudder;
        rudder.yawpitch.yaw += turnYaw;
        rudder.yawpitch.yaw = clamp(rudder.yawpitch.yaw, -PI * 0.3, PI * 0.3); // TODO(@darzu): extract constants
        quat.fromYawPitchRoll(-rudder.yawpitch.yaw, 0, 0, rudder.rotation);

        // mast
        const turnFactor = clamp(remap(turnDot, 0, 1, 0, 1), 0, 1);
        const distFactor = clamp(remap(trgDist, 0, 100, 0, 1), 0, 1);
        const mastFactor = turnFactor * distFactor;
        e.hasMast.mast.mast.sail.sail.unfurledAmount = mastFactor;
      }
    }
  );

  // TODO(@darzu): simulateSystems
  // TODO(@darzu): DBG_SIM_SYSTEMS_INNER_MUTATE_ONLY
  //    replace all entity components and all resources with proxys so we can
  //    make sure only that entities components are mutated
  // TODO(@darzu): would love to have a "clone" object

  // TODO(@darzu): enemy systems:
  /*
  linearVelocityMovesPosition
  enemySailFindTarget
  enemySailToward
  rudderTurn
  autoTurnMast
  mastPush

  updateLocalFromPosRotScale
  updateWorldFromLocalAndParent1
  */

  /*
  all systems that apply:
// constructRenderables
linearVelocityMovesPosition
// colliderFromMeshDef
enemySailFindTarget
enemySailToward
rudderTurn
// ensureWorldFrame
// clampVelocityBySize
// updateLocalFromPosRotScale
// updateSmoothedWorldFrames
// physicsInit
// updateWorldFromLocalAndParent1
// updatePhysInContact
// updateWorldFromLocalAndParent2
// updateRendererWorldFrames
autoTurnMast
// updateWorldAABBs
mastPush
// physicsStepContact
// renderList
// stdRenderList
  */
}
