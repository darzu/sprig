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
import {
  DetectedEvents,
  DetectedEventsDef,
  eventWizard,
} from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { registerEventHandler } from "../net/events.js";
import { ToolDef } from "./tool.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { LocalPlayerDef, PlayerEntDef } from "./player.js";
import { CameraDef } from "../camera.js";
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
import {
  defineNetEntityHelper,
  defineSerializableComponent,
} from "../em_helpers.js";
import { constructNetTurret, TurretDef, YawPitchDef } from "./turret.js";

export const { CannonPropsDef, CannonLocalDef, createCannon } =
  defineNetEntityHelper(EM, {
    name: "cannon",
    defaultProps: (
      loc?: vec3,
      yaw?: number,
      pitch?: number,
      parentId?: number
    ) => {
      return {
        location: loc ?? vec3.fromValues(0, 0, 0),
        yaw: yaw ?? 0,
        pitch: pitch ?? 0,
        parentId: parentId ?? 0,
      };
    },
    serializeProps: (c, buf) => {
      buf.writeVec3(c.location);
      buf.writeFloat32(c.yaw);
      buf.writeUint32(c.parentId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.location);
      c.yaw = buf.readFloat32();
      c.parentId = buf.readUint32();
    },
    defaultLocal: () => {
      return {
        loaded: true,
        fireMs: 0,
        fireDelayMs: 1000,
        loadedId: 0,
      };
    },
    dynamicComponents: [],
    buildResources: [AssetsDef, MeDef],
    build: (e, res) => {
      const em: EntityManager = EM;
      const props = e.cannonProps;
      em.ensureComponent(e.id, PositionDef, props.location);
      constructNetTurret(e, props.yaw, props.pitch, res.assets.cannon.aabb);
      em.ensureComponent(e.id, ColorDef, [0, 0, 0]);
      em.ensureComponent(e.id, RenderableConstructDef, res.assets.cannon.mesh);
      em.ensureComponent(e.id, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.assets.cannon.aabb,
      });
      em.ensureComponentOn(e, PhysicsParentDef, props.parentId);
    },
  });

export function registerCannonSystems(em: EntityManager) {
  em.registerSystem(
    [CannonLocalDef],
    [PhysicsTimerDef],
    (cannons, res) => {
      for (let c of cannons) {
        if (c.cannonLocal.fireMs > 0) {
          c.cannonLocal.fireMs -=
            res.physicsTimer.period * res.physicsTimer.steps;
        }
      }
    },
    "reloadCannon"
  );

  const raiseFireCannon = eventWizard(
    "fire-cannon",
    [[PlayerEntDef], [CannonLocalDef, WorldFrameDef]] as const,
    ([player, cannon]) => {
      // only the firing player creates a bullet
      if (player.id === EM.getResource(LocalPlayerDef)?.playerId) {
        const fireDir = quat.create();
        quat.rotateY(fireDir, cannon.world.rotation, Math.PI * 0.5);
        const firePos = vec3.create();
        vec3.transformQuat(firePos, firePos, fireDir);
        vec3.add(firePos, firePos, cannon.world.position);
        fireBullet(EM, 1, firePos, fireDir, 0.1);
      }

      // but everyone resets the cooldown and plays sound effects
      cannon.cannonLocal.fireMs = cannon.cannonLocal.fireDelayMs;

      const chord = randChordId();
      EM.getResource(MusicDef)!.playChords([chord], "major", 2.0, 3.0, -2);
    },
    {
      legalEvent: ([player, cannon]) => {
        return cannon.cannonLocal.fireMs <= 0;
      },
    }
  );

  em.registerSystem(
    [CannonLocalDef, TurretDef, WorldFrameDef],
    [InputsDef, LocalPlayerDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerEntDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;
        if (c.turret.mannedId !== player.id) continue;
        if (res.inputs.lclick && c.cannonLocal.fireMs <= 0) {
          raiseFireCannon(player, c);
        }
      }
    },
    "playerControlCannon"
  );

  em.registerSystem(
    [CannonLocalDef, TurretDef, InRangeDef, AuthorityDef, WorldFrameDef],
    [DetectedEventsDef, InputsDef, LocalPlayerDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [
        PlayerEntDef,
        AuthorityDef,
      ])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;
        // allow firing un-manned cannons
        if (
          res.inputs.lclick &&
          c.turret.mannedId === 0 &&
          c.cannonLocal.fireMs <= 0
        ) {
          raiseFireCannon(player, c);
        }
      }
    },
    "playerManCanon"
  );
}

export type CannonConstruct = Component<typeof CannonPropsDef>;

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
