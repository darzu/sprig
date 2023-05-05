import { ColorDef } from "../color/color-ecs.js";
import { createRef } from "../ecs/em_helpers.js";
import { EM, EntityManager, EntityW } from "../ecs/entity-manager.js";
import { AssetsDef } from "../assets.js";
import { vec3, quat } from "../sprig-matrix.js";
import { LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../sprig-matrix.js";
import { createMast, MastDef } from "./sail.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { constructNetTurret, TurretDef } from "../games/turret.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { YawPitchDef } from "../yawpitch.js";
import { PartyDef } from "../games/party.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { InteractableDef } from "../games/interact.js";
import { vec3Dbg } from "../utils-3d.js";
import { CameraFollowDef } from "../camera.js";
import { createSock } from "./windsock.js";
import { BARGE_AABBS, SHIP_SMALL_AABBS } from "../primatives.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createHomeShip, homeShipAABBs } from "../shipyard/shipyard.js";
import { getAABBFromMesh, transformMesh } from "../render/mesh.js";
import { createWoodHealth, WoodHealthDef, WoodStateDef } from "../wood.js";
import { addGizmoChild } from "../utils-game.js";
import { getSizeFromAABB } from "../physics/aabb.js";
import {
  CannonLocalDef,
  createCannon,
  createCannonNow,
} from "../cannons/cannon.js";

export const ShipDef = EM.defineComponent("ld52ship", () => ({
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

export async function createShip(em: EntityManager) {
  const res = await em.whenResources(AssetsDef, MeDef);
  const ent = em.new();
  em.ensureComponentOn(ent, ShipDef);

  const homeShip = createHomeShip();

  em.ensureComponentOn(
    ent,
    RenderableConstructDef,
    homeShip.timberMesh
    // res.assets.ship_small.proto
  );
  em.ensureComponentOn(ent, WoodStateDef, homeShip.timberState);
  // em.set(ent, ColliderDef, {
  //   shape: "AABB",
  //   solid: true,
  //   aabb: res.assets.ship.aabb,
  // });

  const timberHealth = createWoodHealth(homeShip.timberState);
  em.ensureComponentOn(ent, WoodHealthDef, timberHealth);

  // const timberAABB = getAABBFromMesh(homeShip.timberMesh);
  // console.log("ship size:");
  // console.dir(timberAABB);
  // console.dir(getSizeFromAABB(timberAABB));

  const mc: MultiCollider = {
    shape: "Multi",
    solid: true,
    // TODO(@darzu): integrate these in the assets pipeline
    children: homeShipAABBs.map((aabb) => ({
      shape: "AABB",
      solid: true,
      aabb,
    })),
  };
  // em.ensureComponentOn(ent, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: timberAABB,
  // });
  em.ensureComponentOn(ent, ColliderDef, mc);
  em.ensureComponentOn(ent, PositionDef, V(0, 0, 0));
  em.ensureComponentOn(ent, RotationDef);
  em.ensureComponentOn(ent, LinearVelocityDef);
  // em.ensureComponentOn(ent, ColorDef, V(0.5, 0.3, 0.1));
  em.ensureComponentOn(ent, ColorDef, V(0, 0, 0)); // painted by individual planks!

  const mast = await createMast(em);
  em.ensureComponentOn(mast, PhysicsParentDef, ent.id);

  const sock = createSock(em, 2.0);
  em.ensureComponentOn(sock, PhysicsParentDef, ent.id);
  sock.position[1] =
    mast.position[1] + (mast.collider as AABBCollider).aabb.max[1];

  ent.ld52ship.mast = createRef(mast);

  const rudder = await createRudder(em);
  em.ensureComponentOn(rudder, PhysicsParentDef, ent.id);
  // console.log("setting position");
  vec3.set(0, 4, -25, rudder.position);
  // console.log(`rudder: ${rudder.id}`);

  // addGizmoChild(rudder, 2, [0, 5, 0]);

  ent.ld52ship.rudder = createRef(rudder);

  // make debug gizmo
  // TODO(@darzu): would be nice to have as a little helper function?
  // const gizmo = EM.new();
  // EM.ensureComponentOn(gizmo, PositionDef, V(0, 20, 0));
  // EM.ensureComponentOn(gizmo, ScaleDef, V(10, 10, 10));
  // EM.ensureComponentOn(gizmo, PhysicsParentDef, ent.id);
  // EM.ensureComponentOn(gizmo, RenderableConstructDef, res.assets.gizmo.proto);

  // addGizmoChild(ent, 10);

  //  [{ min: V(-13.8, 4.0, -2.9), max: V(-5.8, 6.0, -0.9) }];

  // create cannons
  const cannonR = createCannonNow(
    res,
    V(-8, 4.7, -7),
    Math.PI * 0.5,
    cannonDefaultPitch,
    ent.id
  );
  vec3.copy(cannonR.color, ENDESGA16.darkGray);
  ent.ld52ship.cannonR = createRef(cannonR);
  const cannonL = createCannonNow(
    res,
    V(8, 4.7, -7),
    Math.PI * 1.5,
    cannonDefaultPitch,
    ent.id
  );
  vec3.copy(cannonL.color, ENDESGA16.darkGray);
  ent.ld52ship.cannonL = createRef(cannonL);

  return ent;
}

const AHEAD_DIR = V(0, 0, 1);

EM.registerSystem(
  [ShipDef, WorldFrameDef, RotationDef, LinearVelocityDef],
  [],
  (es) => {
    for (let e of es) {
      // rudderc
      let yaw = e.ld52ship.rudder()!.yawpitch.yaw;
      quat.rotateY(e.rotation, yaw * RUDDER_ROTATION_RATE, e.rotation);

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
  },
  "sailShip"
);

export const RudderDef = EM.defineComponent("rudder", () => true);

async function createRudder(em: EntityManager) {
  const res = await em.whenResources(AssetsDef, MeDef);
  const ent = em.new();
  em.ensureComponentOn(ent, RudderDef);
  em.ensureComponentOn(
    ent,
    RenderableConstructDef,
    res.assets.rudderPrim.proto
  );
  // em.ensureComponentOn(ent, ColorDef, V(0.2, 0.1, 0.05));
  em.ensureComponentOn(ent, ColorDef, ENDESGA16.midBrown);
  em.ensureComponentOn(ent, PositionDef);
  em.ensureComponentOn(ent, RotationDef);
  em.ensureComponentOn(ent, AuthorityDef, res.me.pid);
  const interactBox = em.new();
  em.ensureComponentOn(interactBox, PhysicsParentDef, ent.id);
  em.ensureComponentOn(interactBox, PositionDef);
  em.ensureComponentOn(interactBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: {
      min: V(-1, -2, -2),
      max: V(1, 2, 2.5),
    },
  });
  constructNetTurret(
    ent,
    0,
    0,
    interactBox,
    Math.PI,
    // -Math.PI / 8,
    -Math.PI / 12,
    1.6,
    // V(0, 20, 50),
    V(0, 10, 30),
    true,
    1,
    Math.PI,
    "W/S: unfurl/furl sail, A/D: turn, E: drop rudder"
  );

  ent.turret.maxPitch = 0;
  ent.turret.minPitch = 0;
  ent.turret.maxYaw = Math.PI / 6;
  ent.turret.minYaw = -Math.PI / 6;
  ent.turret.invertYaw = true;

  return ent;
}

// If a rudder isn't being manned, smooth it back towards straight
EM.registerSystem(
  [RudderDef, TurretDef, YawPitchDef, AuthorityDef],
  [MeDef],
  (rudders, res) => {
    for (let r of rudders) {
      if (r.authority.pid !== res.me.pid) return;
      if (r.turret.mannedId !== 0) return;
      if (Math.abs(r.yawpitch.yaw) < 0.01) r.yawpitch.yaw = 0;
      r.yawpitch.yaw *= 0.9;
    }
  },
  "easeRudderLD52"
);

EM.addConstraint(["sailShip", "after", "mastForce"]);
EM.addConstraint(["sailShip", "after", "easeRudderLD52"]);

EM.registerSystem(
  [ShipDef, PositionDef, RotationDef],
  [PartyDef],
  (es, res) => {
    if (es[0]) {
      vec3.transformQuat(AHEAD_DIR, es[0].rotation, res.party.dir);
      vec3.copy(res.party.pos, es[0].position);
    }
  },
  "shipParty"
);
