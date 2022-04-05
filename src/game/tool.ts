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
import { RenderableConstructDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { InteractingDef } from "./interact.js";
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { PlayerEntDef } from "./player.js";
import { InteractableDef } from "./interact.js";

export const ToolDef = EM.defineComponent("tool", (type?: string) => ({
  type,
}));

export function registerToolPickupSystem(em: EntityManager) {
  em.registerSystem(
    [ToolDef, InteractingDef],
    [DetectedEventsDef],
    (hats, resources) => {
      for (let { interacting, id } of hats) {
        let player = EM.findEntity(interacting.id, [PlayerEntDef])!;
        if (player.player.tool === 0) {
          resources.detectedEvents.push({
            type: "tool-pickup",
            entities: [player.id, id],
            location: null,
          });
        }
        em.removeComponent(id, InteractingDef);
      }
    },
    "toolPickup"
  );
}

export function registerToolDropSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, PositionDef, RotationDef],
    [DetectedEventsDef],
    (players, { detectedEvents }) => {
      for (let { player, id, position, rotation } of players) {
        if (player.dropping && player.tool > 0) {
          let dropLocation = vec3.fromValues(0, 0, -5);
          vec3.transformQuat(dropLocation, dropLocation, rotation);
          vec3.add(dropLocation, dropLocation, position);
          detectedEvents.push({
            type: "tool-drop",
            entities: [id, player.tool],
            location: dropLocation,
          });
        }
      }
    },
    "toolDrop"
  );
}

registerEventHandler("tool-pickup", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    let tool = em.findEntity(entities[1], [InteractableDef]);
    return (
      player !== undefined && tool !== undefined && player.player.tool === 0
    );
  },
  runEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let tool = em.findEntity(entities[1], [PositionDef, PhysicsParentDef])!;
    tool.physicsParent.id = player.id;
    em.removeComponent(tool.id, InteractableDef);
    vec3.set(tool.position, 0, 0, -1.5);
    em.ensureComponent(tool.id, ScaleDef);
    if (ScaleDef.isOn(tool)) vec3.copy(tool.scale, [0.5, 0.5, 0.5]);
    player.player.tool = tool.id;
    if (ColliderDef.isOn(tool)) tool.collider.solid = false;
  },
});

registerEventHandler("tool-drop", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    return player !== undefined && player.player.tool === entities[1];
  },
  runEvent: (em, entities, location) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let tool = em.findEntity(entities[1], [PositionDef, PhysicsParentDef])!;
    tool.physicsParent.id = 0;
    em.addComponent(tool.id, InteractableDef);
    vec3.copy(tool.position, location!);
    em.ensureComponent(tool.id, ScaleDef);
    if (ScaleDef.isOn(tool)) vec3.copy(tool.scale, [1, 1, 1]);
    player.player.tool = 0;
    if (ColliderDef.isOn(tool)) tool.collider.solid = true;
  },
});
