import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import { RenderableConstructDef } from "../render/renderer.js";
import {
  Frame,
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { Deserializer, Serializer } from "../serialize.js";
import { DetectedEvents, DetectedEventsDef } from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { registerEventHandler } from "../net/events.js";
import { ToolDef } from "./tool.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { CameraDef, LocalPlayerDef, PlayerEntDef } from "./player.js";
import { Assets, AssetsDef } from "./assets.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { MusicDef, randChordId } from "../music.js";
import { InputsDef } from "../inputs.js";
import { pitch } from "../utils-3d.js";
import { clamp } from "../math.js";
import { DeletedDef } from "../delete.js";

const CANNON_FRAMES = 180;

export const CannonDef = EM.defineComponent("cannon", () => {
  return {
    loaded: true,
    mannedId: 0,
    pitch: 0,
    yaw: 0,
    minYaw: -Math.PI * 0.5,
    maxYaw: +Math.PI * 0.5,
    minPitch: -Math.PI * 0.3,
    maxPitch: Math.PI * 0.1,
    fireMs: 0,
    fireDelayMs: 1000,
    loadedId: 0,
  };
});
export type Cannon = Component<typeof CannonDef>;

export const CannonConstructDef = EM.defineComponent(
  "cannonConstruct",
  (loc?: vec3, yaw?: number, pitch?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      yaw: yaw ?? 0,
      pitch: pitch ?? 0,
    };
  }
);

export function registerPlayerCannonSystem(em: EntityManager) {
  // em.registerSystem(
  //   [CannonDef, InteractableDef],
  //   [PhysicsResultsDef],
  //   (cannons, res) => {
  //     for (let c of cannons) {
  //       const otherHits =
  //         res.physicsResults.collidesWith.get(c.cannon.interactBox) ?? [];
  //       for (let o of otherHits) {
  //         let player = EM.findEntity(o, [PlayerEntDef])!;
  //         if (player) console.log(player);
  //       }
  //     }
  //   },
  //   "playerCannon2"
  // );

  em.registerSystem(
    [CannonDef, RotationDef],
    [CameraDef],
    (cannons, res) => {
      for (let c of cannons) {
        quat.copy(c.rotation, quat.IDENTITY);
        quat.rotateY(c.rotation, c.rotation, c.cannon.yaw);
        quat.rotateZ(c.rotation, c.rotation, c.cannon.pitch);
        // quat.fromEuler(c.rotation, 0, c.cannon.yaw, c.cannon.pitch);
      }
    },
    "rotateCannons"
  );

  em.registerSystem(
    [CannonDef],
    [PhysicsTimerDef],
    (cannons, res) => {
      for (let c of cannons) {
        if (c.cannon.fireMs > 0) {
          c.cannon.fireMs -= res.physicsTimer.period * res.physicsTimer.steps;
        }
      }
    },
    "reloadCannon"
  );

  em.registerSystem(
    [CannonDef, WorldFrameDef, InRangeDef, RotationDef],
    [
      DetectedEventsDef,
      MusicDef,
      InputsDef,
      PhysicsResultsDef,
      MeDef,
      CameraDef,
      LocalPlayerDef,
    ],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerEntDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;

        function unman() {
          player.player.manning = false;
          quat.identity(res.camera.rotation);
          res.camera.targetId = 0;
          c.cannon.mannedId = 0;
        }
        function doman() {
          player.player.manning = true;
          c.cannon.mannedId = player.id;
        }

        if (res.inputs.keyClicks["e"]) {
          if (c.cannon.mannedId) {
            unman();
          } else {
            doman();
          }
        }

        if (res.inputs.lclick && c.cannon.fireMs <= 0) {
          c.cannon.fireMs = c.cannon.fireDelayMs;
          // console.log("someone is interacting with the cannon");
          // let player = EM.findEntity(interacting.id, [PlayerEntDef])!;

          // TODO(@darzu): cannon fire sound

          fireFromCannon(em, c.world);

          const chord = randChordId();
          res.music.playChords([chord], "major", 2.0, 3.0, -2);
        }

        if (c.cannon.mannedId) {
          c.cannon.yaw += -res.inputs.mouseMovX * 0.005;
          c.cannon.yaw = clamp(c.cannon.yaw, c.cannon.minYaw, c.cannon.maxYaw);
          c.cannon.pitch += res.inputs.mouseMovY * 0.002;
          c.cannon.pitch = clamp(
            c.cannon.pitch,
            c.cannon.minPitch,
            c.cannon.maxPitch
          );

          res.camera.targetId = c.id;
          quat.rotateY(res.camera.rotation, quat.IDENTITY, +Math.PI / 2);
          quat.rotateX(
            res.camera.rotation,
            res.camera.rotation,
            -Math.PI * 0.15
          );
        }
        // quat.rotateZ(c.rotation, c.rotation, -res.inputs.mouseMovY * 0.005);
        // quat.rotateY(c.rotation, c.rotation, -res.inputs.mouseMovX * 0.005);
        // quat.rotateX(
        //   camera.rotation,
        //   camera.rotation,
        //   -inputs.mouseMovY * 0.001
        // );

        // em.removeComponent(id, InteractingDef);
      }
    },
    "playerCannon"
  );
}

export function fireFromCannon(em: EntityManager, cannon: Frame) {
  // TODO(@darzu): capture this elsewhere
  const fireDir = quat.create();
  quat.rotateY(fireDir, cannon.rotation, Math.PI * 0.5);
  const firePos = vec3.create();
  vec3.transformQuat(firePos, firePos, fireDir);
  vec3.add(firePos, firePos, cannon.position);

  fireBullet(em, 1, firePos, fireDir, 0.1);

  // TODO(@darzu): do we need events?
  // detectedEvents: DetectedEvents,
  // detectedEvents.push({
  //   type: "fire-cannon",
  //   entities: [interacting.id, id],
  //   location: null,
  // });
}

export function registerCannonEventHandlers() {
  // registerEventHandler("load-cannon", {
  //   eventAuthorityEntity: (entities) => entities[0],
  //   legalEvent: (em, entities) =>
  //     !em.findEntity(entities[1], [CannonDef])!.cannon!.loaded &&
  //     em.findEntity(entities[2], [AmmunitionDef])!.ammunition.amount > 0,
  //   runEvent: (em, entities) => {
  //     let cannon = em.findEntity(entities[1], [CannonDef])!.cannon;
  //     let ammunition = em.findEntity(entities[2], [AmmunitionDef])!.ammunition;
  //     cannon.loaded = true;
  //     ammunition.amount -= 1;
  //   },
  // });

  registerEventHandler("fire-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (em, entities) =>
      !!em.findEntity(entities[1], [CannonDef])!.cannon!.loaded,
    runEvent: (em, entities) => {
      let { cannon, authority } = em.findEntity(entities[1], [
        CannonDef,
        AuthorityDef,
      ])!;
      // cannon.loaded = false;
      // cannon.firing = true;
      // cannon.countdown = CANNON_FRAMES;
      // TODO: this is maybe weird?
      authority.pid = em.findEntity(entities[0], [AuthorityDef])!.authority.pid;
      authority.seq++;
      authority.updateSeq = 0;
    },
  });

  // TODO: figure out authority etc. for this event
  // registerEventHandler("fired-cannon", {
  //   eventAuthorityEntity: (entities) => entities[0],
  //   legalEvent: (_em, _entities) => true,
  //   runEvent: (em, entities) => {
  //     let cannon = em.findEntity(entities[0], [CannonDef])!.cannon;
  //     // cannon.firing = false;
  //   },
  // });
}

// TODO: call this from game somewhere?
registerCannonEventHandlers();

export type CannonConstruct = Component<typeof CannonConstructDef>;

function serializeCannonConstruct(c: CannonConstruct, buf: Serializer) {
  buf.writeVec3(c.location);
  buf.writeFloat32(c.yaw);
  buf.writeFloat32(c.pitch);
}

function deserializeCannonConstruct(c: CannonConstruct, buf: Deserializer) {
  buf.readVec3(c.location);
  c.yaw = buf.readFloat32();
  c.pitch = buf.readFloat32();
}

EM.registerSerializerPair(
  CannonConstructDef,
  serializeCannonConstruct,
  deserializeCannonConstruct
);

export function createPlayerCannon(
  em: EntityManager,
  e: Entity & { cannonConstruct: CannonConstruct },
  pid: number,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.cannonConstruct;
  em.ensureComponent(e.id, PositionDef, props.location);
  em.ensureComponent(e.id, RotationDef);
  em.ensureComponent(e.id, ColorDef, [0, 0, 0]);
  //TODO: do we need motion smoothing?
  //if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  em.ensureComponent(e.id, RenderableConstructDef, assets.cannon.mesh);
  em.ensureComponent(e.id, AuthorityDef, pid);
  em.ensureComponentOn(e, CannonDef);
  e.cannon.yaw = props.yaw;
  e.cannon.pitch = props.pitch;
  e.cannon.minYaw += props.yaw;
  e.cannon.maxYaw += props.yaw;
  em.ensureComponent(e.id, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: assets.cannon.aabb,
  });
  em.ensureComponent(e.id, SyncDef, [CannonConstructDef.id, RotationDef.id]);
  em.addComponent(e.id, FinishedDef);

  // create seperate hitbox for interacting with the cannon
  const interactBox = em.newEntity();
  const interactAABB = copyAABB(createAABB(), assets.cannon.aabb);
  // interactAABB.max[0] += 1;
  vec3.scale(interactAABB.min, interactAABB.min, 2);
  vec3.scale(interactAABB.max, interactAABB.max, 2);
  em.ensureComponentOn(interactBox, PhysicsParentDef, e.id);
  em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
  em.ensureComponentOn(interactBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: interactAABB,
  });

  em.ensureComponent(e.id, InteractableDef, interactBox.id);
}

export function registerBuildCannonsSystem(em: EntityManager) {
  em.registerSystem(
    [CannonConstructDef],
    [MeDef, AssetsDef],
    (cannons, res) => {
      for (let b of cannons) createPlayerCannon(em, b, res.me.pid, res.assets);
    },
    "buildCannons"
  );
}

export const AmmunitionDef = EM.defineComponent(
  "ammunition",
  (amount?: number) => {
    return {
      amount: amount || 0,
    };
  }
);
export type Ammunition = Component<typeof AmmunitionDef>;

export const AmmunitionConstructDef = EM.defineComponent(
  "ammunitionConstruct",
  (loc?: vec3, amount?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      amount: amount || 0,
    };
  }
);

export type AmmunitionConstruct = Component<typeof AmmunitionConstructDef>;

function serializeAmmunitionConstruct(c: AmmunitionConstruct, buf: Serializer) {
  buf.writeVec3(c.location);
  buf.writeUint16(c.amount);
}

function deserializeAmmunitionConstruct(
  c: AmmunitionConstruct,
  buf: Deserializer
) {
  buf.readVec3(c.location);
  c.amount = buf.readUint16();
}

EM.registerSerializerPair(
  AmmunitionConstructDef,
  serializeAmmunitionConstruct,
  deserializeAmmunitionConstruct
);

export function registerBuildAmmunitionSystem(em: EntityManager) {
  em.registerSystem(
    [AmmunitionConstructDef],
    [MeDef, AssetsDef],
    (boxes, res) => {
      for (let e of boxes) {
        if (FinishedDef.isOn(e)) continue;
        const props = e.ammunitionConstruct;
        if (!PositionDef.isOn(e)) {
          em.addComponent(e.id, PositionDef, props.location);
        }
        if (!RotationDef.isOn(e)) {
          // TODO: the asset is upside down. should probably fix the asset
          const rotation = quat.create();
          quat.rotateX(rotation, rotation, Math.PI);
          quat.normalize(rotation, rotation);
          em.addComponent(e.id, RotationDef, rotation);
        }
        if (!ColorDef.isOn(e))
          em.addComponent(e.id, ColorDef, [0.2, 0.1, 0.05]);
        if (!PhysicsParentDef.isOn(e)) em.addComponent(e.id, PhysicsParentDef);
        if (!RenderableConstructDef.isOn(e))
          em.addComponent(
            e.id,
            RenderableConstructDef,
            res.assets.ammunitionBox.mesh
          );
        if (!AuthorityDef.isOn(e))
          em.addComponent(e.id, AuthorityDef, res.me.pid);
        if (!AmmunitionDef.isOn(e))
          em.addComponent(e.id, AmmunitionDef, props.amount);
        if (!ColliderDef.isOn(e)) {
          const collider = em.addComponent(e.id, ColliderDef);
          collider.shape = "AABB";
          collider.solid = true;
          (collider as AABBCollider).aabb = res.assets.ammunitionBox.aabb;
        }
        if (!ToolDef.isOn(e)) {
          const tool = em.addComponent(e.id, ToolDef);
          tool.type = "ammunition";
        }
        // if (!InteractableDef.isOn(e)) em.addComponent(e.id, InteractableDef);
        if (!SyncDef.isOn(e)) {
          const sync = em.addComponent(e.id, SyncDef);
          sync.fullComponents.push(AmmunitionConstructDef.id);
        }
        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildAmmunition"
  );
}

export const LinstockDef = EM.defineComponent("linstock", () => true);
export type Linstock = Component<typeof LinstockDef>;

export const LinstockConstructDef = EM.defineComponent(
  "linstockConstruct",
  (loc?: vec3) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
    };
  }
);

export type LinstockConstruct = Component<typeof LinstockConstructDef>;

function serializeLinstockConstruct(c: LinstockConstruct, buf: Serializer) {
  buf.writeVec3(c.location);
}

function deserializeLinstockConstruct(c: LinstockConstruct, buf: Deserializer) {
  buf.readVec3(c.location);
}

EM.registerSerializerPair(
  LinstockConstructDef,
  serializeLinstockConstruct,
  deserializeLinstockConstruct
);

export function registerBuildLinstockSystem(em: EntityManager) {
  em.registerSystem(
    [LinstockConstructDef],
    [MeDef, AssetsDef],
    (boxes, res) => {
      for (let e of boxes) {
        if (FinishedDef.isOn(e)) continue;
        const props = e.linstockConstruct;
        if (!PositionDef.isOn(e))
          em.addComponent(e.id, PositionDef, props.location);
        if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.0, 0.0, 0.0]);
        if (!PhysicsParentDef.isOn(e)) em.addComponent(e.id, PhysicsParentDef);
        // TODO(@darzu): allow scaling to be configured on the asset import
        if (!RenderableConstructDef.isOn(e))
          em.addComponent(
            e.id,
            RenderableConstructDef,
            res.assets.linstock.mesh
          );
        if (!AuthorityDef.isOn(e))
          em.addComponent(e.id, AuthorityDef, res.me.pid);
        if (!LinstockDef.isOn(e)) em.addComponent(e.id, LinstockDef);
        if (!ColliderDef.isOn(e)) {
          const collider = em.addComponent(e.id, ColliderDef);
          collider.shape = "AABB";
          collider.solid = true;
          (collider as AABBCollider).aabb = res.assets.linstock.aabb;
        }
        if (!ToolDef.isOn(e)) {
          const tool = em.addComponent(e.id, ToolDef);
          tool.type = "linstock";
        }
        // if (!InteractableDef.isOn(e)) em.addComponent(e.id, InteractableDef);
        if (!SyncDef.isOn(e)) {
          const sync = em.addComponent(e.id, SyncDef);
          sync.fullComponents.push(LinstockConstructDef.id);
        }
        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildLinstock"
  );
}
