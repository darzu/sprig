import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { fireBullet } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
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
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import {
  BallMesh,
  CannonMesh,
  CubeMesh,
  HexMesh,
  MastMesh,
} from "../meshes/mesh-list.js";
import { scaleMesh3 } from "../meshes/mesh.js";
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
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  Frame,
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { CyArray } from "../render/data-webgpu.js";
import { GraphicsSettingsDef } from "../render/graphics-settings.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import {
  DotStruct,
  DotTS,
  MAX_NUM_DOTS,
  dotDataPtr,
  initDots,
  renderDots,
} from "../render/pipelines/std-dots.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { clamp } from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { PI } from "../utils/util-no-import.js";
import { assert, dbgOnce, range } from "../utils/util.js";
import { randVec3OfLen } from "../utils/utils-3d.js";
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
[ ] aim cannon
[ ] enemy exists
[ ] player and enemy health
[ ] enemy moves and fires
[ ] smart enemy ai    
*/

const DBG_GHOST = false;

const DBG_GIZMO = true;

const DBG_DOTS = false;

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
  ],
} as const);

function cannonFireCurve(frame: Frame, speed: number, out: Parametric) {
  // TODO(@darzu): IMPL!
  const axis = vec3.transformQuat(vec3.FWD, frame.rotation);
  const vel = vec3.scale(axis, speed);

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
  color: vec3.InputT,
  size: number
): DotPath {
  const path: Path = range(len).map((_) => ({
    pos: vec3.create(),
    rot: quat.create(),
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

const oceanRadius = 5;

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

  const createTile = (xyz: vec3.InputT) =>
    createObj(tileCS, [
      vec3.add(ENDESGA16.blue, randVec3OfLen(0.1)),
      xyz,
      [HexMesh],
      [size, size, 1],
    ]);
  const grid = createHexGrid<typeT>();

  for (let [q, r] of hexesWithin(0, 0, oceanRadius)) {
    const loc = hexXYZ(vec3.create(), q, r, size);
    loc[2] -= 0.9;
    const tile = createTile(loc);
    grid.set(q, r, tile);
  }

  return grid;
}

export async function initGrayboxShipArena() {
  // TODO(@darzu): WORK AROUND: see below
  EM.addEagerInit([], [RendererDef, GraphicsSettingsDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      renderDots,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  vec3.set(-200, -200, -200, camera.maxWorldAABB.min);
  vec3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // TODO(@darzu): WORK AROUND: For whatever reason this particular init order and this obj are
  //  needed to avoid a bug in canary (122.0.6255.1) not present in retail (120.0.6099.234)
  //  more on branch: white-screen-bug-repro
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

  const wind = EM.addResource(WindDef);
  setWindAngle(wind, PI * 0.4);

  const ship = await createShip();

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  // cannon launch intermediates
  const _dotPaths: DotPath[] = [];
  function getDotPath(i: number) {
    assert(0 <= i && i <= 10);
    while (i >= _dotPaths.length) {
      _dotPaths.push(mkDotPath(res, 20, ENDESGA16.yellow, 2.0));
    }
    return _dotPaths[i];
  }

  const _launchParam: Parametric = createParametric();

  EM.addSystem(
    "controlShip",
    Phase.GAME_PLAYERS,
    [ShipDef, HasRudderDef, HasMastDef, CameraFollowDef],
    [InputsDef, HasFirstInteractionDef, RendererDef],
    (es, res) => {
      if (es.length === 0) return;
      assert(es.length === 1);
      const ship = es[0];

      const mast = ship.hasMast.mast;
      const rudder = ship.hasRudder.rudder;

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
        ship.cameraFollow.yawOffset = clamp(
          ship.cameraFollow.yawOffset,
          -PI * 0.5,
          PI * 0.5
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
      position: [40, 40, 3],
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

  const res = await EM.whenResources(MastMesh.def, MeDef);

  const mast = createMast(res);

  mixinObj(ship, HasMastObj, {
    args: [],
    children: {
      mast,
    },
  });

  const sock = createSock(2.0);
  sock.position[2] =
    mast.position[2] + (mast.collider as AABBCollider).aabb.max[2];
  EM.set(sock, PhysicsParentDef, ship.id);

  const rudder = createRudder();
  // console.log("setting position");
  vec3.set(0, -25, 4, rudder.position);

  mixinObj(ship, HasRudderObj, {
    args: [],
    children: {
      rudder,
    },
  });

  vec3.copy(ship.cameraFollow.positionOffset, [0.0, -100.0, 0]);
  ship.cameraFollow.pitchOffset = -PI * 0.2;

  if (DBG_GIZMO) addGizmoChild(ship, 10);

  return ship;
}
