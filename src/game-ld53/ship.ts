import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/ecs.js";
import { Resources } from "../ecs/em-resources.js";
import {
  CannonLD51Mesh,
  MastMesh,
  RudderPrimMesh,
} from "../meshes/mesh-list.js";
import { V3, quat, tV } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { createMast, HasMastDef, HasMastObj, MastDef } from "../wind/mast.js";
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
import { WoodStateDef } from "../wood/wood-builder.js";
import { WoodHealthDef } from "../wood/wood-health.js";
import { createWoodHealth } from "../wood/wood-health.js";
import { addGizmoChild } from "../utils/utils-game.js";
import { CannonLocalDef, createCannonNow } from "../cannons/cannon.js";
import { Phase } from "../ecs/sys-phase.js";
import { ShipHealthDef } from "./ship-health.js";
import { defineObj, mixinObj } from "../ecs/em-objects.js";
import { T } from "../utils/util-no-import.js";
import { FinishedDef } from "../ecs/em-helpers.js";
import { HasRudderObj, RudderDef, createRudderTurret } from "./rudder.js";
import { assert, dbgOnce } from "../utils/util.js";
import { createAABB, mergeAABBs } from "../physics/aabb.js";

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
    // sock: [PositionDef],
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

export const cannonDefaultPitch = Math.PI * +0.05;

// TODO(@darzu): rename
export async function createLd53ShipAsync() {
  const res = await EM.whenResources(MeDef, CannonLD51Mesh.def);
  // TODO(@darzu):

  const homeShip = createLD53Ship();

  // EM.set(ent, ColliderDef, {
  //   shape: "AABB",
  //   solid: true,
  //   aabb: res.allMeshes.ship.aabb,
  // });

  const timberHealth = createWoodHealth(homeShip.state);

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
  V3.copy(cannonR.color, ENDESGA16.darkGray);
  const cannonL = createCannonNow(
    res,
    V(-8, -7, 4.7),
    -0.5 * Math.PI,
    cannonDefaultPitch
  );
  V3.copy(cannonL.color, ENDESGA16.darkGray);

  addGizmoChild(cannonR, 3);
  addGizmoChild(cannonL, 3);

  const ship = LD52ShipDefObj.new({
    props: { cuttingEnabled: true },
    args: {
      position: [0, 0, 0],
      rotation: quat.fromYawPitchRoll(Math.PI / 2, 0, 0),
      renderableConstruct: [homeShip.mesh],
      woodState: homeShip.state,
      woodHealth: timberHealth,
      shipHealth: undefined,
      collider: mc,
      linearVelocity: undefined,
      color: [0, 0, 0], // painted by individual planks!
    },
    children: {
      // mast,
      // rudder,
      cannonR,
      cannonL,
      // sock,
    },
  });

  addGizmoChild(ship, 10);

  const mast = createMast();
  addGizmoChild(mast, 20, [0, 0, 0]);
  // addColliderDbgVis(mast);

  EM.whenEntityHas(mast, ColliderDef, PositionDef).then((mast) => {
    const sock = createSock(2.0);
    sock.position[2] =
      mast.position[2] + (mast.collider as AABBCollider).aabb.max[2];
    EM.set(sock, PhysicsParentDef, ship.id);
  });

  mixinObj(ship, HasMastObj, {
    args: [],
    children: {
      mast,
    },
  });

  const rudder = createRudderTurret(res);

  EM.set(rudder, AuthorityDef, res.me.pid);

  // console.log("setting position");
  V3.set(0, -25, 4, rudder.position);
  // console.log(`rudder: ${rudder.id}`);

  // addGizmoChild(rudder, 2, [0, 5, 0]);

  mixinObj(ship, HasRudderObj, {
    args: [],
    children: {
      rudder,
    },
  });

  // TODO(@darzu): Incorperate these into Object?
  EM.set(ship, FinishedDef); // TODO(@darzu): remove?
  EM.set(ship, AuthorityDef, res.me.pid);

  return ship;
}

// EM.addConstraint(["sailShip", "after", "mastForce"]);
// EM.addConstraint(["sailShip", "after", "easeRudderLD52"]);

EM.addSystem(
  "shipParty",
  Phase.GAME_WORLD,
  [LD52ShipDef, PositionDef, RotationDef, ColliderDef, WorldFrameDef],
  [PartyDef],
  (es, res) => {
    if (!es.length) return;
    const ship = es[0];
    quat.fwd(ship.rotation, res.party.dir);
    V3.copy(res.party.pos, ship.world.position);

    // get obb from ship collider
    assert(ship.collider.shape === "Multi");
    const localAABB = createAABB(
      tV(+Infinity, +Infinity, +Infinity),
      tV(-Infinity, -Infinity, -Infinity)
    );
    ship.collider.children.forEach((c) => {
      assert(c.shape === "AABB");
      mergeAABBs(localAABB, localAABB, c.aabb);
    });
    res.party.obb.updateFromMat4(localAABB, ship.world.transform);
  }
);
