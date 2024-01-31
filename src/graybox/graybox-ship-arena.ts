import { StatBarDef, createMultiBarMesh } from "../adornments/status-bar.js";
import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { fireBullet } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
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
import { V, quat, tmpStack, V3 } from "../matrix/sprig-matrix.js";
import {
  BallMesh,
  CannonMesh,
  CubeMesh,
  HexMesh,
  MastMesh,
  PlaneMesh,
} from "../meshes/mesh-list.js";
import { getAABBFromMesh, scaleMesh3 } from "../meshes/mesh.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { GravityDef } from "../motion/gravity.js";
import {
  Parametric,
  ParametricDef,
  copyParamateric,
  createParametric,
  createPathFromParameteric,
} from "../motion/parametric-motion.js";
import { LinearVelocityDef } from "../motion/velocity.js";
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
import { GraphicsSettingsDef } from "../render/graphics-settings.js";
import { PointLightDef } from "../render/lights.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
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
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { clamp, lerp, remap, unlerp, wrap } from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { PI } from "../utils/util-no-import.js";
import { assert, dbgOnce, range } from "../utils/util.js";
import {
  angleBetween,
  angleBetweenXZ,
  randVec3OfLen,
} from "../utils/utils-3d.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { HasMastDef, HasMastObj, createMast } from "../wind/mast.js";
import { WindDef, setWindAngle } from "../wind/wind.js";
import { createSock } from "../wind/windsock.js";
import { dbgPathWithGizmos } from "../wood/shipyard.js";
import { DotsDef } from "./dots.js";
import { createSun, initGhost, initGrayboxWorld } from "./graybox-helpers.js";
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
    loc[2] -= height + 0.2;
    const tile = createTile(loc);
    grid.set(q, r, tile);
  }

  return grid;
}

export async function initGrayboxShipArena() {
  // TODO(@darzu): WORLD GRID:
  /*
  plane fit to frustum
  uv based on world pos

  */

  // TODO(@darzu): WORK AROUND: see below
  EM.addEagerInit([], [RendererDef, GraphicsSettingsDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      renderDots,
      stdGridRender,
      // TODO(@darzu): RENDER WORLD GRID
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
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
  addWorldGizmo(V(0, 0, 0), 50);

  // ocean
  const oceanGrid = createOcean();

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      color: [0, 1, 1],
    }
  );

  // wind
  const wind = EM.addResource(WindDef);
  setWindAngle(wind, PI * 0.4);

  // player ship
  const ship = await createShip();

  // enemy
  createEnemy();

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

  const mast = createMast();

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
