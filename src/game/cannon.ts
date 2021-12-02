import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion, MotionDef } from "../phys_motion.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import {
  MotionSmoothingDef,
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
import { getAABBFromMesh, Mesh, scaleMesh3 } from "../mesh-pool.js";
import { AABB } from "../phys_broadphase.js";
import { Deserializer, Serializer } from "../serialize.js";
import { CUBE_MESH } from "./assets.js";
import { DetectedEventsDef } from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { registerEventHandler } from "../net/events.js";

const CANNON_FRAMES = 180;

export const CannonDef = EM.defineComponent("cannon", () => {
  return {
    loaded: true,
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

export function registerCannonEventHandlers() {
  registerEventHandler("load-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (em, entities) =>
      !em.findEntity(entities[0], [CannonDef])!.cannon!.loaded,
    runEvent: (em, entities) => {
      let cannon = em.findEntity(entities[1], [CannonDef])!.cannon;
      cannon.loaded = true;
    },
  });

  registerEventHandler("fire-cannon", {
    eventAuthorityEntity: (entities) => entities[0],
    legalEvent: (em, entities) =>
      !!em.findEntity(entities[0], [CannonDef])!.cannon!.loaded,
    runEvent: (em, entities) => {
      let { cannon, authority } = em.findEntity(entities[1], [
        CannonDef,
        AuthorityDef,
      ])!;
      cannon.loaded = false;
      cannon.firing = true;
      cannon.countdown = CANNON_FRAMES;
      // TODO: this is maybe weird?
      authority.pid = entities[0];
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
