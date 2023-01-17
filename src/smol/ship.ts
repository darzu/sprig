import { ColorDef } from "../color-ecs.js";
import { createRef } from "../em_helpers.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { AssetsDef, BARGE_AABBS } from "../assets.js";
import { vec3, quat } from "../sprig-matrix.js";
import { LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsParentDef,
  PositionDef,
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
  cuttingEnabled: true,
}));

const MIN_SPEED = 0.0001;
const MAX_SPEED = 10.0;
const VELOCITY_DRAG = 30.0; // squared drag factor
// const VELOCITY_DECAY = 0.995; // linear decay scalar
const SAIL_ACCEL_RATE = 0.001;
const RUDDER_ROTATION_RATE = 0.01;

export async function createShip(em: EntityManager) {
  const res = await em.whenResources(AssetsDef);
  const ent = em.new();
  em.ensureComponentOn(ent, ShipDef);
  em.ensureComponentOn(ent, RenderableConstructDef, res.assets.ship.proto);
  // em.set(ent, ColliderDef, {
  //   shape: "AABB",
  //   solid: true,
  //   aabb: res.assets.ship.aabb,
  // });
  const mc: MultiCollider = {
    shape: "Multi",
    solid: true,
    // TODO(@darzu): integrate these in the assets pipeline
    children: BARGE_AABBS.map((aabb) => ({
      shape: "AABB",
      solid: true,
      aabb,
    })),
  };
  em.ensureComponentOn(ent, ColliderDef, mc);
  em.ensureComponentOn(ent, PositionDef, V(0, 2, 0));
  em.ensureComponentOn(ent, RotationDef);
  em.ensureComponentOn(ent, LinearVelocityDef);
  em.ensureComponentOn(ent, ColorDef, V(0.5, 0.3, 0.1));

  const mast = await createMast(em);
  em.ensureComponentOn(mast, PhysicsParentDef, ent.id);

  const sock = createSock(em, 2.0);
  em.ensureComponentOn(sock, PhysicsParentDef, ent.id);
  sock.position[1] =
    mast.position[1] + (mast.collider as AABBCollider).aabb.max[1];

  ent.ld52ship.mast = createRef(mast);

  const rudder = await createRudder(em);
  em.ensureComponentOn(rudder, PhysicsParentDef, ent.id);
  console.log("setting position");
  vec3.set(0, 0, -12, rudder.position);

  ent.ld52ship.rudder = createRef(rudder);
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
  em.ensureComponentOn(ent, RenderableConstructDef, res.assets.rudder.proto);
  em.ensureComponentOn(ent, ColorDef, V(0.2, 0.1, 0.05));
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
    -Math.PI / 8,
    1.5,
    V(0, 20, 50),
    true
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
