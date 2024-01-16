import { ColorDef } from "../color/color-ecs.js";
import { EM, Resources } from "../ecs/entity-manager.js";
import {
  CannonLD51Mesh,
  MastMesh,
  RudderPrimMesh,
} from "../meshes/mesh-list.js";
import { vec3, quat } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { createMast, MastDef } from "../wind/mast.js";
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
import { createSock } from "../wind/windsock.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createLD53Ship, ld53ShipAABBs } from "../wood/shipyard.js";
import { createWoodHealth, WoodHealthDef, WoodStateDef } from "../wood/wood.js";
import { addGizmoChild } from "../utils/utils-game.js";
import { CannonLocalDef, createCannonNow } from "../cannons/cannon.js";
import { Phase } from "../ecs/sys-phase.js";
import { ShipHealthDef } from "./ship-health.js";
import { T, defineObj } from "../graybox/objects.js";
import { FinishedDef } from "../ecs/em-helpers.js";
import { RudderDef, createRudder } from "./rudder.js";

// TODO(@darzu): RENAME
const LD52ShipDefObj = defineObj({
  name: "ld52ship",
  components: [
    PositionDef,
    RotationDef,
    RenderableConstructDef,
    WoodStateDef,
    WoodHealthDef,
    ShipHealthDef,
    ColliderDef,
    LinearVelocityDef,
    ColorDef,
  ],
  propsType: T<{
    // TODO(@darzu): remove
    cuttingEnabled: boolean;
  }>(),
  physicsParentChildren: true,
  children: {
    mast: [MastDef, RotationDef],
    sock: [PositionDef],
    rudder: [
      RudderDef,
      YawPitchDef,
      TurretDef,
      // CameraFollowDef,
      AuthorityDef,
      PositionDef,
    ],
    cannonR: [
      CannonLocalDef,
      YawPitchDef,
      TurretDef,
      // CameraFollowDef,
      AuthorityDef,
      PositionDef,
    ],
    cannonL: [
      CannonLocalDef,
      YawPitchDef,
      TurretDef,
      // CameraFollowDef,
      AuthorityDef,
      PositionDef,
    ],
  },
} as const);
export const LD52ShipDef = LD52ShipDefObj.props;

const MIN_SPEED = 0.0001;
const MAX_SPEED = 10.0;
const VELOCITY_DRAG = 30.0; // squared drag factor
// const VELOCITY_DECAY = 0.995; // linear decay scalar
const SAIL_ACCEL_RATE = 0.001;
const RUDDER_ROTATION_RATE = 0.01;

export const cannonDefaultPitch = Math.PI * +0.05;

// TODO(@darzu): rename
export async function createLd53ShipAsync() {
  const res = await EM.whenResources(MeDef, MastMesh.def, CannonLD51Mesh.def);
  // TODO(@darzu):

  const homeShip = createLD53Ship();

  // EM.set(ent, ColliderDef, {
  //   shape: "AABB",
  //   solid: true,
  //   aabb: res.allMeshes.ship.aabb,
  // });

  const timberHealth = createWoodHealth(homeShip.timberState);

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

  // addColliderDbgVis(ship);

  const mast = createMast(res);

  addGizmoChild(mast, 20, [0, 0, 0]);
  // addColliderDbgVis(mast);

  const sock = createSock(2.0);
  sock.position[2] =
    mast.position[2] + (mast.collider as AABBCollider).aabb.max[2];

  const rudder = createRudder(res);
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

  //  [{ min: V(-13.8, 4.0, -2.9), max: V(-5.8, 6.0, -0.9) }];

  // create cannons
  const cannonR = createCannonNow(
    res,
    V(8, -7, 4.7),
    0.5 * Math.PI,
    cannonDefaultPitch
  );
  vec3.copy(cannonR.color, ENDESGA16.darkGray);
  const cannonL = createCannonNow(
    res,
    V(-8, -7, 4.7),
    -0.5 * Math.PI,
    cannonDefaultPitch
  );
  vec3.copy(cannonL.color, ENDESGA16.darkGray);

  addGizmoChild(cannonR, 3);
  addGizmoChild(cannonL, 3);

  const ship = LD52ShipDefObj.new({
    props: { cuttingEnabled: true },
    args: {
      position: [0, 0, 0],
      rotation: quat.fromYawPitchRoll(Math.PI / 2, 0, 0),
      renderableConstruct: [homeShip.timberMesh],
      woodState: homeShip.timberState,
      woodHealth: timberHealth,
      shipHealth: undefined,
      collider: mc,
      linearVelocity: undefined,
      color: [0, 0, 0], // painted by individual planks!
    },
    children: {
      mast,
      rudder,
      cannonR,
      cannonL,
      sock,
    },
  });

  addGizmoChild(ship, 10);

  // TODO(@darzu): Incorperate these into Object?
  EM.set(ship, FinishedDef); // TODO(@darzu): remove?
  EM.set(ship, AuthorityDef, res.me.pid);

  return ship;
}

EM.addSystem(
  "sailShip",
  Phase.GAME_PLAYERS,
  [LD52ShipDef, WorldFrameDef, RotationDef, LinearVelocityDef],
  [],
  (es) => {
    for (let e of es) {
      // rudder
      let yaw = e.ld52ship.rudder.yawpitch.yaw;
      quat.yaw(e.rotation, yaw * RUDDER_ROTATION_RATE, e.rotation);

      // acceleration
      const direction = vec3.transformQuat(vec3.FWD, e.world.rotation);
      const sailAccel = vec3.scale(
        direction,
        e.ld52ship.mast.mast.force * SAIL_ACCEL_RATE
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
        const sail = e.ld52ship.mast.mast.sail.sail;
        if (sail.unfurledAmount > sail.minFurl) {
          vec3.scale(vec3.FWD, MIN_SPEED, e.linearVelocity);
        } else {
          vec3.set(0, 0, 0, e.linearVelocity);
        }
      }
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
      vec3.transformQuat(vec3.FWD, es[0].rotation, res.party.dir);
      vec3.copy(res.party.pos, es[0].position);
    }
  }
);
