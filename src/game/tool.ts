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
import { MotionDef } from "../phys_motion.js";
import { RenderableDef } from "../renderer.js";
import { MotionSmoothingDef, ParentDef, TransformDef } from "../transform.js";
import { ColorDef } from "./game.js";
import { InteractingDef } from "./interact.js";
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { PlayerEntDef } from "./player.js";
import { InteractableDef } from "./interact.js";
import { ScaleDef } from "../scale.js";

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
    [PlayerEntDef, MotionDef],
    [DetectedEventsDef],
    (players, { detectedEvents }) => {
      for (let { player, id, motion } of players) {
        if (player.dropping && player.tool > 0) {
          let dropLocation = vec3.fromValues(0, 0, -5);
          vec3.transformQuat(dropLocation, dropLocation, motion.rotation);
          vec3.add(dropLocation, dropLocation, motion.location);
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
    let tool = em.findEntity(entities[1], [MotionDef, ParentDef])!;
    tool.parent.id = player.id;
    em.removeComponent(tool.id, InteractableDef);
    vec3.set(tool.motion.location, 0, 0, -1.5);
    let scale = em.ensureComponent(tool.id, ScaleDef);
    vec3.set(scale.by, 0.5, 0.5, 0.5);
    player.player.tool = tool.id;
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
    let tool = em.findEntity(entities[1], [MotionDef, ParentDef])!;
    tool.parent.id = 0;
    em.addComponent(tool.id, InteractableDef);
    vec3.copy(tool.motion.location, location!);
    let scale = em.ensureComponent(tool.id, ScaleDef);
    vec3.set(scale.by, 1, 1, 1);
    player.player.tool = 0;
  },
});
