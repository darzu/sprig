import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion, MotionDef } from "../phys_motion.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import {
  MotionSmoothingDef,
  ParentDef,
  RenderableDef,
  TransformDef,
} from "../renderer.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { AABBCollider, ColliderDef } from "../collider.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
} from "../net/components.js";
import {
  getAABBFromMesh,
  Mesh,
  scaleMesh3,
  unshareProvokingVertices,
} from "../mesh-pool.js";
import { AABB } from "../phys_broadphase.js";
import { Deserializer, Serializer } from "../serialize.js";
import { CUBE_MESH } from "./assets.js";
import { _GAME_ASSETS } from "../main.js";
import { DetectedEventsDef } from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { registerEventHandler } from "../net/events.js";
import { ToolDef } from "./tool.js";
import { InteractableDef, InteractingDef } from "./interact.js";
import { PlayerEntDef } from "./player.js";

const CANNON_FRAMES = 180;

export const CannonDef = EM.defineComponent("cannon", () => {
  return {
    loaded: false,
    firing: false,
    countdown: 0,
  };
});
export type Cannon = Component<typeof CannonDef>;

export const CannonConstructDef = EM.defineComponent(
  "cannonConstruct",
  (loc?: vec3) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
    };
  }
);

export function registerStepCannonsSystem(em: EntityManager) {
  em.registerSystem(
    [CannonDef, MotionDef, AuthorityDef],
    [DetectedEventsDef, PhysicsTimerDef, MeDef],
    (cannons, { detectedEvents, physicsTimer, me }) => {
      for (let { cannon, authority, motion, id } of cannons) {
        if (cannon.firing) {
          cannon.countdown -= physicsTimer.steps;
          if (cannon.countdown <= 0) {
            // TODO: cannon firing animation
            if (authority.pid === me.pid) {
              fireBullet(em, motion.location, motion.rotation);
              detectedEvents.push({
                type: "fired-cannon",
                entities: [id],
                location: null,
              });
            }
          }
        }
      }
    }
  );
}

export function registerPlayerCannonSystem(em: EntityManager) {
  em.registerSystem(
    [CannonDef, InteractingDef],
    [DetectedEventsDef],
    (cannons, { detectedEvents }) => {
      for (let { cannon, interacting, id } of cannons) {
        console.log("someone is interacting with the cannon");
        let player = EM.findEntity(interacting.id, [PlayerEntDef])!;
        if (player.player.tool) {
          let tool = EM.findEntity(player.player.tool, [ToolDef])!;
          if (AmmunitionDef.isOn(tool) && !cannon.loaded) {
            let ammunition = tool.ammunition;
            if (ammunition.amount > 0) {
              detectedEvents.push({
                type: "load-cannon",
                entities: [interacting.id, id, tool.id],
                location: null,
              });
            }
          } else if (LinstockDef.isOn(tool) && cannon.loaded) {
            detectedEvents.push({
              type: "fire-cannon",
              entities: [interacting.id, id],
              location: null,
            });
          }
        }
        EM.removeComponent(id, InteractingDef);
      }
    }
  );
}

export function registerCannonEventHandlers() {
  registerEventHandler("load-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (em, entities) =>
      !em.findEntity(entities[1], [CannonDef])!.cannon!.loaded &&
      em.findEntity(entities[2], [AmmunitionDef])!.ammunition.amount > 0,
    runEvent: (em, entities) => {
      let cannon = em.findEntity(entities[1], [CannonDef])!.cannon;
      let ammunition = em.findEntity(entities[2], [AmmunitionDef])!.ammunition;
      cannon.loaded = true;
      ammunition.amount -= 1;
    },
  });

  registerEventHandler("fire-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (em, entities) =>
      !!em.findEntity(entities[1], [CannonDef])!.cannon!.loaded,
    runEvent: (em, entities) => {
      let { cannon, authority } = em.findEntity(entities[1], [
        CannonDef,
        AuthorityDef,
      ])!;
      cannon.loaded = false;
      cannon.firing = true;
      cannon.countdown = CANNON_FRAMES;
      // TODO: this is maybe weird?
      authority.pid = em.findEntity(entities[0], [AuthorityDef])!.authority.pid;
      authority.seq++;
      authority.updateSeq = 0;
    },
  });

  registerEventHandler("fired-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (_em, _entities) => true,
    runEvent: (em, entities) => {
      let cannon = em.findEntity(entities[0], [CannonDef])!.cannon;
      cannon.firing = false;
    },
  });
}

// TODO: call this from game somewhere?
registerCannonEventHandlers();

export type CannonConstruct = Component<typeof CannonConstructDef>;

function serializeCannonConstruct(c: CannonConstruct, buf: Serializer) {
  buf.writeVec3(c.location);
}

function deserializeCannonConstruct(c: CannonConstruct, buf: Deserializer) {
  buf.readVec3(c.location);
}

EM.registerSerializerPair(
  CannonConstructDef,
  serializeCannonConstruct,
  deserializeCannonConstruct
);

// TODO(@darzu): move these to the asset system
let _cannonMesh: Mesh | undefined = undefined;
let _cannonAABB: AABB | undefined = undefined;
function getCannonMesh(): Mesh {
  if (!_cannonMesh) _cannonMesh = scaleMesh3(CUBE_MESH, [1.5, 1.5, 5]);
  return _cannonMesh;
}
function getCannonAABB(): AABB {
  if (!_cannonAABB) _cannonAABB = getAABBFromMesh(getCannonMesh());
  return _cannonAABB;
}

function createCannon(
  em: EntityManager,
  e: Entity & { cannonConstruct: CannonConstruct },
  pid: number
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.cannonConstruct;
  if (!MotionDef.isOn(e)) em.addComponent(e.id, MotionDef, props.location);
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0, 0, 0]);
  if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
  //TODO: do we need motion smoothing?
  //if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, getCannonMesh());
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
  if (!CannonDef.isOn(e)) em.addComponent(e.id, CannonDef);
  if (!ColliderDef.isOn(e)) {
    const collider = em.addComponent(e.id, ColliderDef);
    collider.shape = "AABB";
    collider.solid = true;
    (collider as AABBCollider).aabb = getCannonAABB();
  }
  if (!InteractableDef.isOn(e)) {
    em.addComponent(e.id, InteractableDef);
  }
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(CannonConstructDef.id);
  }
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildCannonsSystem(em: EntityManager) {
  em.registerSystem([CannonConstructDef], [MeDef], (cannons, res) => {
    for (let b of cannons) createCannon(em, b, res.me.pid);
  });
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

let _ammunitionMesh: Mesh | undefined = undefined;
let _ammunitionAABB: AABB | undefined = undefined;
function getAmmunitionMesh(): Mesh {
  if (!_ammunitionMesh) _ammunitionMesh = _GAME_ASSETS?.ammunitionBox!;
  return _ammunitionMesh;
}
function getAmmunitionAABB(): AABB {
  if (!_ammunitionAABB) _ammunitionAABB = getAABBFromMesh(getAmmunitionMesh());
  return _ammunitionAABB;
}

export function registerBuildAmmunitionSystem(em: EntityManager) {
  em.registerSystem([AmmunitionConstructDef], [MeDef], (boxes, res) => {
    for (let e of boxes) {
      if (FinishedDef.isOn(e)) return;
      const props = e.ammunitionConstruct;
      if (!MotionDef.isOn(e)) {
        let motion = em.addComponent(e.id, MotionDef, props.location);
        // TODO: the asset is upside down. should probably fix the asset
        quat.rotateX(motion.rotation, motion.rotation, Math.PI);
        quat.normalize(motion.rotation, motion.rotation);
      }
      if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.2, 0.1, 0.05]);
      if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
      if (!ParentDef.isOn(e)) em.addComponent(e.id, ParentDef);
      if (!RenderableDef.isOn(e))
        em.addComponent(e.id, RenderableDef, getAmmunitionMesh());
      if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
      if (!AuthorityDef.isOn(e))
        em.addComponent(e.id, AuthorityDef, res.me.pid);
      if (!AmmunitionDef.isOn(e))
        em.addComponent(e.id, AmmunitionDef, props.amount);
      if (!ColliderDef.isOn(e)) {
        const collider = em.addComponent(e.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = true;
        (collider as AABBCollider).aabb = getAmmunitionAABB();
      }
      if (!ToolDef.isOn(e)) {
        const tool = em.addComponent(e.id, ToolDef);
        tool.type = "ammunition";
      }
      if (!InteractableDef.isOn(e)) em.addComponent(e.id, InteractableDef);
      if (!SyncDef.isOn(e)) {
        const sync = em.addComponent(e.id, SyncDef);
        sync.fullComponents.push(AmmunitionConstructDef.id);
      }
      em.addComponent(e.id, FinishedDef);
    }
  });
}

export const LinstockDef = EM.defineComponent("linstock", (amount?: number) => {
  return {
    amount: amount || 0,
  };
});
export type Linstock = Component<typeof LinstockDef>;

export const LinstockConstructDef = EM.defineComponent(
  "linstockConstruct",
  (loc?: vec3, amount?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      amount: amount || 0,
    };
  }
);

let _linstockMesh: Mesh | undefined = undefined;
let _linstockAABB: AABB | undefined = undefined;
function getLinstockMesh(): Mesh {
  if (!_linstockMesh) _linstockMesh = _GAME_ASSETS?.linstock!;
  return _linstockMesh;
}
function getLinstockAABB(): AABB {
  if (!_linstockAABB) _linstockAABB = getAABBFromMesh(getLinstockMesh());
  return _linstockAABB;
}

export function registerBuildLinstockSystem(em: EntityManager) {
  em.registerSystem([LinstockConstructDef], [MeDef], (boxes, res) => {
    for (let e of boxes) {
      if (FinishedDef.isOn(e)) return;
      const props = e.linstockConstruct;
      if (!MotionDef.isOn(e)) {
        let motion = em.addComponent(e.id, MotionDef, props.location);
      }
      if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.0, 0.0, 0.0]);
      if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
      if (!ParentDef.isOn(e)) em.addComponent(e.id, ParentDef);
      if (!RenderableDef.isOn(e))
        em.addComponent(e.id, RenderableDef, getLinstockMesh());
      if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
      if (!AuthorityDef.isOn(e))
        em.addComponent(e.id, AuthorityDef, res.me.pid);
      if (!LinstockDef.isOn(e))
        em.addComponent(e.id, LinstockDef, props.amount);
      if (!ColliderDef.isOn(e)) {
        const collider = em.addComponent(e.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = true;
        (collider as AABBCollider).aabb = getLinstockAABB();
      }
      if (!ToolDef.isOn(e)) {
        const tool = em.addComponent(e.id, ToolDef);
        tool.type = "linstock";
      }
      if (!InteractableDef.isOn(e)) em.addComponent(e.id, InteractableDef);
      if (!SyncDef.isOn(e)) {
        const sync = em.addComponent(e.id, SyncDef);
        sync.fullComponents.push(LinstockConstructDef.id);
      }
      em.addComponent(e.id, FinishedDef);
    }
  });
}
