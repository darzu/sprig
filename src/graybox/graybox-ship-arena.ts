import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { fireBullet } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
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
import { ParametricDef } from "../motion/parametric-motion.js";
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
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { clamp } from "../utils/math.js";
import { PI } from "../utils/util-no-import.js";
import { assert } from "../utils/util.js";
import { randVec3OfLen } from "../utils/utils-3d.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { HasMastDef, HasMastObj, createMast } from "../wind/mast.js";
import { WindDef, setWindAngle } from "../wind/wind.js";
import { createSock } from "../wind/windsock.js";
import { createSun, initGhost, initGrayboxWorld } from "./graybox-helpers.js";
import { createObj, defineObj, mixinObj } from "./objects.js";

const DBG_GHOST = false;

const DBG_GIZMO = true;

const SAIL_FURL_RATE = 0.02;

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
    cannonL: [PositionDef, RotationDef],
    cannonR: [PositionDef, RotationDef],
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

// TODO(@darzu): PERF. use pools!!
function launchBall(frame: Frame, speed: number) {
  const axis = vec3.transformQuat(vec3.FWD, frame.rotation);
  const vel = vec3.scale(axis, speed);

  const time = EM.getResource(TimeDef)!;

  const GRAVITY = -8 * 0.00001;

  const ball = createObj(CannonBallObj, {
    args: {
      position: undefined,
      rotation: undefined,
      parametric: {
        pos: frame.position,
        vel,
        accel: [0, 0, GRAVITY],
        time: time.time,
      },
      color: ENDESGA16.darkGray,
      renderableConstruct: [BallMesh],
    },
  });

  return ball;
}

// TODO(@darzu): projectile paths: use particle system?

function createOcean() {
  // TODO(@darzu): more efficient if we use one mesh
  const tileCS = [
    ColorDef,
    PositionDef,
    RenderableConstructDef,
    ScaleDef,
  ] as const;
  type typeT = EntityW<[...typeof tileCS]>;
  const radius = 5;
  const size = 100;

  const createTile = (xyz: vec3.InputT) =>
    createObj(tileCS, [
      vec3.add(ENDESGA16.blue, randVec3OfLen(0.1)),
      xyz,
      [HexMesh],
      [size, size, 1],
    ]);
  const grid = createHexGrid<typeT>();

  for (let [q, r] of hexesWithin(0, 0, radius)) {
    const loc = hexXYZ(vec3.create(), q, r, size);
    loc[2] -= 0.9;
    const tile = createTile(loc);
    grid.set(q, r, tile);
  }

  return grid;
}

export async function initGrayboxShipArena() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  vec3.set(-200, -200, -200, camera.maxWorldAABB.min);
  vec3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // sun
  createSun();

  // gizmo
  addWorldGizmo(V(0, 0, 0), 5);

  // ocean
  const oceanGrid = createOcean();

  const wind = EM.addResource(WindDef);
  setWindAngle(wind, PI * 0.4);

  const ship = await createShip();

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  EM.addSystem(
    "controlShip",
    Phase.GAME_PLAYERS,
    [ShipDef, HasRudderDef, HasMastDef, CameraFollowDef],
    [InputsDef, HasFirstInteractionDef],
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

      // camera
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

      // cannons
      const ballSpeed = 0.2;
      if (res.inputs.keyClicks[" "]) {
        const cannons = [ship.ship.cannonL, ship.ship.cannonR];
        for (let c of cannons) {
          if (WorldFrameDef.isOn(c)) launchBall(c.world, ballSpeed);
        }
      }
    }
  );
}

const CannonObj = defineObj({
  name: "cannon2",
  components: [PositionDef, RotationDef, RenderableConstructDef, ColorDef],
} as const);

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

  const cannonL = createObj(CannonObj, {
    args: {
      position: [-10, 0, 2],
      rotation: quat.fromYawPitchRoll(-PI * 0.5, PI * 0.1, 0),
      renderableConstruct: [CannonMesh],
      color: ENDESGA16.darkGray,
    },
  });
  const cannonR = createObj(CannonObj, {
    args: {
      position: [+10, 0, 2],
      rotation: quat.fromYawPitchRoll(PI * 0.5, PI * 0.1, 0),
      renderableConstruct: [CannonMesh],
      color: ENDESGA16.darkGray,
    },
  });

  const ship = ShipObj.new({
    args: {
      color: ENDESGA16.midBrown,
      position: [40, 40, 3],
      renderableConstruct: [shipMesh],
      cameraFollow: undefined,
      linearVelocity: undefined,
    },
    children: {
      cannonL,
      cannonR,
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
