import { FinishedDef } from "../build.js";
import { AABBCollider, ColliderDef } from "../collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { HAT_OBJ, importObj, isParseError } from "../import_obj.js";
import {
  getAABBFromMesh,
  Mesh,
  unshareProvokingVertices,
} from "../mesh-pool.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { AABB } from "../phys_broadphase.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { RenderableDef } from "../renderer.js";
import {
  MotionSmoothingDef,
  ParentTransformDef,
  PositionDef,
  RotationDef,
  TransformWorldDef,
} from "../transform.js";
import { ColorDef } from "./game.js";
import { InteractingDef } from "./interact.js";
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { PlayerEntDef } from "./player.js";
import { InteractableDef } from "./interact.js";

export const HatDef = EM.defineComponent("hat", () => true);

export const HatConstructDef = EM.defineComponent(
  "hatConstruct",
  (loc?: vec3) => {
    return {
      loc: loc ?? vec3.create(),
    };
  }
);
export type HatConstruct = Component<typeof HatConstructDef>;

EM.registerSerializerPair(
  HatConstructDef,
  (c, buf) => {
    buf.writeVec3(c.loc);
  },
  (c, buf) => {
    buf.readVec3(c.loc);
  }
);

let _hatMesh: Mesh | undefined = undefined;
function getHatMesh(): Mesh {
  if (!_hatMesh) {
    const hatRaw = importObj(HAT_OBJ);
    if (isParseError(hatRaw)) throw hatRaw;
    const hat = unshareProvokingVertices(hatRaw);
    _hatMesh = hat;
  }
  return _hatMesh;
}
let _hatAABB: AABB | undefined = undefined;
function getHatAABB(): AABB {
  if (!_hatAABB) {
    _hatAABB = getAABBFromMesh(getHatMesh());
  }
  return _hatAABB;
}

function createHat(
  em: EntityManager,
  e: Entity & { hatConstruct: HatConstruct },
  pid: number
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.hatConstruct;
  if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.loc);
  if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef);
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.4, 0.1, 0.1]);
  if (!TransformWorldDef.isOn(e)) em.addComponent(e.id, TransformWorldDef);
  if (!ParentTransformDef.isOn(e)) em.addComponent(e.id, ParentTransformDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, getHatMesh());
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!ColliderDef.isOn(e)) {
    const collider = em.addComponent(e.id, ColliderDef);
    collider.shape = "AABB";
    collider.solid = false;
    (collider as AABBCollider).aabb = getHatAABB();
  }
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(HatConstructDef.id);
  }
  if (!HatDef.isOn(e)) {
    em.addComponent(e.id, HatDef);
  }
  em.ensureComponent(e.id, InteractableDef);
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildHatSystem(em: EntityManager) {
  em.registerSystem(
    [HatConstructDef],
    [MeDef],
    (hats, res) => {
      for (let s of hats) createHat(em, s, res.me.pid);
    },
    "buildHats"
  );
}

export function registerHatPickupSystem(em: EntityManager) {
  em.registerSystem(
    [HatDef, InteractingDef],
    [DetectedEventsDef],
    (hats, resources) => {
      for (let { interacting, id } of hats) {
        let player = EM.findEntity(interacting.id, [PlayerEntDef])!;
        if (player.player.hat === 0) {
          console.log("detecting pickup");
          resources.detectedEvents.push({
            type: "hat-pickup",
            entities: [player.id, id],
            location: null,
          });
        }
        em.removeComponent(id, InteractingDef);
      }
    },
    "hatPickup"
  );
}

export function registerHatDropSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, PositionDef, RotationDef],
    [DetectedEventsDef],
    (players, { detectedEvents }) => {
      for (let { player, id, position, rotation } of players) {
        // only drop a hat if we don't have a tool
        if (player.dropping && player.hat > 0 && player.tool === 0) {
          let dropLocation = vec3.fromValues(0, 0, -5);
          vec3.transformQuat(dropLocation, dropLocation, rotation);
          vec3.add(dropLocation, dropLocation, position);
          detectedEvents.push({
            type: "hat-drop",
            entities: [id, player.hat],
            location: dropLocation,
          });
        }
      }
    },
    "hatDrop"
  );
}

registerEventHandler("hat-pickup", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    let hat = em.findEntity(entities[1], [InteractableDef]);
    return player !== undefined && hat !== undefined && player.player.hat === 0;
  },
  runEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [PositionDef, ParentTransformDef])!;
    hat.parentTransform.id = player.id;
    em.removeComponent(hat.id, InteractableDef);
    vec3.set(hat.position, 0, 1, 0);
    player.player.hat = hat.id;
  },
});

registerEventHandler("hat-drop", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    return player !== undefined && player.player.hat === entities[1];
  },
  runEvent: (em, entities, location) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [PositionDef, ParentTransformDef])!;
    hat.parentTransform.id = 0;
    em.addComponent(hat.id, InteractableDef);
    vec3.copy(hat.position, location!);
    player.player.hat = 0;
  },
});
