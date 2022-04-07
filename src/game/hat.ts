import { FinishedDef } from "../build.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { HAT_OBJ, importObj, isParseError } from "../import_obj.js";
import {
  getAABBFromMesh,
  Mesh,
  unshareProvokingVertices,
} from "../render/mesh-pool.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { AABB } from "../physics/broadphase.js";
import { PhysicsStateDef } from "../physics/nonintersection.js";
import { RenderableConstructDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { LocalPlayerDef, PlayerEntDef } from "./player.js";
import { InteractableDef, InRangeDef } from "./interact.js";

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
    const hat = unshareProvokingVertices(hatRaw[0]);
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
  if (!PhysicsParentDef.isOn(e)) em.addComponent(e.id, PhysicsParentDef);
  if (!RenderableConstructDef.isOn(e))
    em.addComponent(e.id, RenderableConstructDef, getHatMesh());
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
  // TODO(@darzu): add interact box
  // em.ensureComponent(e.id, InteractableDef);
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
    [HatDef, InRangeDef],
    [DetectedEventsDef, LocalPlayerDef],
    (hats, resources) => {
      for (let { id } of hats) {
        let player = EM.findEntity(resources.localPlayer.playerId, [
          PlayerEntDef,
        ])!;
        if (player.player.hat === 0 && player.player.interacting) {
          console.log("detecting pickup");
          resources.detectedEvents.push({
            type: "hat-pickup",
            entities: [player.id, id],
            extra: null,
          });
        }
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
            extra: dropLocation,
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
    let hat = em.findEntity(entities[1], [PositionDef, PhysicsParentDef])!;
    hat.physicsParent.id = player.id;
    // TODO(@darzu): add interact box
    // em.removeComponent(hat.id, InteractableDef);
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
  runEvent: (em, entities, location: vec3) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [PositionDef, PhysicsParentDef])!;
    hat.physicsParent.id = 0;
    // TODO(@darzu): add interact box
    // em.addComponent(hat.id, InteractableDef);
    vec3.copy(hat.position, location!);
    player.player.hat = 0;
  },
  serializeExtra: (buf, location: vec3) => {
    buf.writeVec3(location);
  },
  deserializeExtra: (buf) => {
    return buf.readVec3();
  },
});
