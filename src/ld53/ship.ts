import { ColorDef } from "../color/color-ecs.js";
import {
  NetEntityOpts,
  createRef,
  defineNetEntityHelper,
} from "../ecs/em-helpers.js";
import { EM, EntityW, Resources } from "../ecs/entity-manager.js";
import {
  AllMeshesDef,
  CannonLD51Mesh,
  MastMesh,
  RudderPrimMesh,
} from "../meshes/mesh-list.js";
import { vec3, quat } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { createMast, MastDef } from "../wind/sail.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { constructNetTurret, TurretDef } from "../turret/turret.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { PartyDef } from "../camera/party.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { InteractableDef } from "../input/interact.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { CameraFollowDef } from "../camera/camera.js";
import { createSock } from "../wind/windsock.js";
import { BARGE_AABBS, SHIP_SMALL_AABBS } from "../meshes/primatives.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createLD53Ship, ld53ShipAABBs } from "../wood/shipyard.js";
import { getAABBFromMesh, transformMesh } from "../meshes/mesh.js";
import { createWoodHealth, WoodHealthDef, WoodStateDef } from "../wood/wood.js";
import { addGizmoChild, addColliderDbgVis } from "../utils/utils-game.js";
import { getSizeFromAABB } from "../physics/aabb.js";
import {
  CannonLocalDef,
  createCannon,
  createCannonNow,
} from "../cannons/cannon.js";
import { Phase } from "../ecs/sys-phase.js";
import { ShipHealthDef } from "./ship-health.js";

// TODO(@darzu): remove / rework "ld52ship"
export const LD52ShipDef = EM.defineComponent("ld52ship", () => ({
  mast: createRef(0, [MastDef, RotationDef]),
  rudder: createRef(0, [
    RudderDef,
    YawPitchDef,
    TurretDef,
    // CameraFollowDef,
    AuthorityDef,
    PositionDef,
  ]),
  cannonR: createRef(0, [
    CannonLocalDef,
    YawPitchDef,
    TurretDef,
    // CameraFollowDef,
    AuthorityDef,
    PositionDef,
  ]),
  cannonL: createRef(0, [
    CannonLocalDef,
    YawPitchDef,
    TurretDef,
    // CameraFollowDef,
    AuthorityDef,
    PositionDef,
  ]),
  cuttingEnabled: true,
}));

const MIN_SPEED = 0.0001;
const MAX_SPEED = 10.0;
const VELOCITY_DRAG = 30.0; // squared drag factor
// const VELOCITY_DECAY = 0.995; // linear decay scalar
const SAIL_ACCEL_RATE = 0.001;
const RUDDER_ROTATION_RATE = 0.01;

export const cannonDefaultPitch = Math.PI * +0.05;

export const { createLd53ShipAsync, Ld53ShipPropsDef } = defineNetEntityHelper({
  name: "ld53Ship",
  defaultProps: () => {},
  updateProps: (p) => p,
  serializeProps: (o, buf) => {},
  deserializeProps: (o, buf) => {},
  defaultLocal: () => {},
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [CannonLD51Mesh.def, MastMesh.def, RudderPrimMesh.def, MeDef],
  build: (ship, res) => {
    // TODO(@darzu):

    const homeShip = createLD53Ship();

    EM.set(
      ship,
      RenderableConstructDef,
      homeShip.timberMesh
      // res.allMeshes.ship_small.proto
    );
    EM.set(ship, WoodStateDef, homeShip.timberState);
    // EM.set(ent, ColliderDef, {
    //   shape: "AABB",
    //   solid: true,
    //   aabb: res.allMeshes.ship.aabb,
    // });

    const timberHealth = createWoodHealth(homeShip.timberState);
    EM.set(ship, WoodHealthDef, timberHealth);

    // const timberAABB = getAABBFromMesh(homeShip.timberMesh);
    // console.log("ship size:");
    // console.dir(timberAABB);
    // console.dir(getSizeFromAABB(timberAABB));

    const mc: MultiCollider = {
      shape: "Multi",
      solid: true,
      // TODO(@darzu): integrate these in the assets pipeline
      children: ld53ShipAABBs.map((aabb) => ({
        shape: "AABB",
        solid: true,
        aabb,
      })),
    };
    // EM.set(ent, ColliderDef, {
    //   shape: "AABB",
    //   solid: false,
    //   aabb: timberAABB,
    // });
    EM.set(ship, ColliderDef, mc);

    // addColliderDbgVis(ship);

    EM.set(ship, PositionDef, V(0, 0, 0));
    EM.set(ship, RotationDef);
    quat.yaw(ship.rotation, Math.PI / 2, ship.rotation);
    EM.set(ship, LinearVelocityDef);
    // EM.set(ent, ColorDef, V(0.5, 0.3, 0.1));
    EM.set(ship, ColorDef, V(0, 0, 0)); // painted by individual planks!

    const mast = createMast(res);
    EM.set(mast, PhysicsParentDef, ship.id);

    addGizmoChild(mast, 20, [0, 0, 0]);
    // addColliderDbgVis(mast);

    const sock = createSock(2.0);
    EM.set(sock, PhysicsParentDef, ship.id);
    sock.position[2] =
      mast.position[2] + (mast.collider as AABBCollider).aabb.max[2];

    const rudder = createRudder(res);
    EM.set(rudder, PhysicsParentDef, ship.id);
    // console.log("setting position");
    vec3.set(0, -25, 4, rudder.position);
    // console.log(`rudder: ${rudder.id}`);

    // addGizmoChild(rudder, 2, [0, 5, 0]);

    // make debug gizmo
    // TODO(@darzu): would be nice to have as a little helper function?
    // const gizmo = EM.new();
    // EM.set(gizmo, PositionDef, V(0, 20, 0));
    // EM.set(gizmo, ScaleDef, V(10, 10, 10));
    // EM.set(gizmo, PhysicsParentDef, ship.id);
    // EM.set(gizmo, RenderableConstructDef, res.allMeshes.gizmo.proto);

    addGizmoChild(ship, 10);

    //  [{ min: V(-13.8, 4.0, -2.9), max: V(-5.8, 6.0, -0.9) }];

    // create cannons
    const cannonR = createCannonNow(
      res,
      V(8, -7, 4.7),
      0.5 * Math.PI,
      cannonDefaultPitch,
      ship.id
    );
    vec3.copy(cannonR.color, ENDESGA16.darkGray);
    const cannonL = createCannonNow(
      res,
      V(-8, -7, 4.7),
      -0.5 * Math.PI,
      cannonDefaultPitch,
      ship.id
    );
    vec3.copy(cannonL.color, ENDESGA16.darkGray);

    addGizmoChild(cannonR, 3);
    addGizmoChild(cannonL, 3);

    // NOTE: we need to build the ship all at once so we don't have dangling references
    EM.set(ship, LD52ShipDef);
    ship.ld52ship.mast = createRef(mast);
    ship.ld52ship.rudder = createRef(rudder);
    ship.ld52ship.cannonR = createRef(cannonR);
    ship.ld52ship.cannonL = createRef(cannonL);

    EM.set(ship, ShipHealthDef);

    return ship;
  },
});

const AHEAD_DIR = V(0, 1, 0);

EM.addSystem(
  "sailShip",
  Phase.GAME_PLAYERS,
  [LD52ShipDef, WorldFrameDef, RotationDef, LinearVelocityDef],
  [],
  (es) => {
    for (let e of es) {
      // rudder
      let yaw = e.ld52ship.rudder()!.yawpitch.yaw;
      quat.yaw(e.rotation, yaw * RUDDER_ROTATION_RATE, e.rotation);

      // acceleration
      const direction = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
      const sailAccel = vec3.scale(
        direction,
        e.ld52ship.mast()!.mast.force * SAIL_ACCEL_RATE
      );
      const linVelMag = vec3.length(e.linearVelocity);
      const velDrag = linVelMag * linVelMag * VELOCITY_DRAG;
      const dragForce = vec3.scale(vec3.negate(e.linearVelocity), velDrag);
      // console.log(
      //   `sail: ${vec3Dbg(vec3.scale(sailAccel, 100))}\n` +
      //     `drag: ${vec3Dbg(vec3.scale(dragForce, 100))}`
      // );
      const accel = vec3.add(sailAccel, dragForce);
      vec3.add(e.linearVelocity, accel, e.linearVelocity);
      // vec3.scale(e.linearVelocity, VELOCITY_DECAY, e.linearVelocity);
      //console.log(`ship speed is ${vec3.length(e.linearVelocity)}`);
      if (vec3.length(e.linearVelocity) > MAX_SPEED) {
        vec3.normalize(e.linearVelocity, e.linearVelocity);
        vec3.scale(e.linearVelocity, MAX_SPEED, e.linearVelocity);
      }
      if (vec3.length(e.linearVelocity) < MIN_SPEED) {
        // TODO: make this better
        const sail = e.ld52ship.mast()!.mast.sail()!.sail;
        if (sail.unfurledAmount > sail.minFurl) {
          vec3.scale(AHEAD_DIR, MIN_SPEED, e.linearVelocity);
        } else {
          vec3.set(0, 0, 0, e.linearVelocity);
        }
      }
    }
  }
);

export const RudderDef = EM.defineComponent("rudder", () => true);

function createRudder(
  res: Resources<[typeof MeDef, typeof RudderPrimMesh.def]>
) {
  const rudderMesh = res.mesh_rudderPrim;
  const rudder = EM.new();
  EM.set(rudder, RudderDef);
  EM.set(rudder, RenderableConstructDef, rudderMesh.proto);
  // EM.set(ent, ColorDef, V(0.2, 0.1, 0.05));
  EM.set(rudder, ColorDef, ENDESGA16.midBrown);
  EM.set(rudder, PositionDef);
  EM.set(rudder, RotationDef);
  EM.set(rudder, AuthorityDef, res.me.pid);

  addGizmoChild(rudder, 4);

  const interactBox = EM.new();
  EM.set(interactBox, PhysicsParentDef, rudder.id);
  EM.set(interactBox, PositionDef);
  EM.set(interactBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: {
      min: V(-1, -2, -2),
      max: V(1, 2.5, 2.5),
    },
  });
  constructNetTurret(
    rudder,
    0,
    0,
    interactBox,
    0.0 * Math.PI,
    // -Math.PI / 8,
    -Math.PI / 12,
    1.6,
    // V(0, 20, 50),
    V(0, -30, 10), // camera offset
    true,
    1,
    Math.PI,
    "W/S: unfurl/furl sail, A/D: turn, E: drop rudder"
  );

  rudder.turret.maxPitch = 0;
  rudder.turret.minPitch = 0;
  rudder.turret.maxYaw = Math.PI / 6;
  rudder.turret.minYaw = -Math.PI / 6;
  rudder.turret.invertYaw = true;

  return rudder;
}

// If a rudder isn't being manned, smooth it back towards straight
EM.addSystem(
  "easeRudderLD52",
  Phase.GAME_WORLD,
  [RudderDef, TurretDef, YawPitchDef, AuthorityDef],
  [MeDef],
  (rudders, res) => {
    for (let r of rudders) {
      if (r.authority.pid !== res.me.pid) return;
      if (r.turret.mannedId !== 0) return;
      if (Math.abs(r.yawpitch.yaw) < 0.01) r.yawpitch.yaw = 0;
      r.yawpitch.yaw *= 0.9;
    }
  }
);

// EM.addConstraint(["sailShip", "after", "mastForce"]);
// EM.addConstraint(["sailShip", "after", "easeRudderLD52"]);

EM.addSystem(
  "shipParty",
  Phase.GAME_WORLD,
  [LD52ShipDef, PositionDef, RotationDef],
  [PartyDef],
  (es, res) => {
    if (es[0]) {
      vec3.transformQuat(AHEAD_DIR, es[0].rotation, res.party.dir);
      vec3.copy(res.party.pos, es[0].position);
    }
  }
);
