import { FinishedDef } from "../build.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
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
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { LocalPlayerDef, PlayerEntDef } from "./player.js";
import { InteractableDef, InRangeDef } from "./interact.js";
import { Deserializer, Serializer } from "../serialize.js";

export const ToolDef = EM.defineComponent("tool", (type?: string) => ({
  type,
}));

export function registerToolSystems(em: EntityManager) {
  em.registerSystem(
    [ToolDef, InRangeDef],
    [DetectedEventsDef, LocalPlayerDef],
    (hats, resources) => {
      for (let { id } of hats) {
        let player = EM.findEntity(resources.localPlayer.playerId, [
          PlayerEntDef,
        ])!;
        if (player.player.tool === 0 && player.player.interacting) {
          resources.detectedEvents.push({
            type: "tool-pickup",
            entities: [player.id, id],
            extra: null,
          });
        }
      }
    },
    "toolPickup"
  );

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
            extra: dropLocation,
          });
        }
      }
    },
    "toolDrop"
  );

  registerEventHandler("tool-pickup", {
    entities: [
      [PlayerEntDef],
      [InteractableDef, PositionDef, PhysicsParentDef],
    ] as const,
    eventAuthorityEntity: ([playerId, toolId]) => playerId,
    legalEvent: (em, [player, tool]) => {
      return player.player.tool === 0;
    },
    runEvent: (em: EntityManager, [player, tool]) => {
      tool.physicsParent.id = player.id;
      // TODO(@darzu): add interact box
      // em.removeComponent(tool.id, InteractableDef);
      vec3.set(tool.position, 0, 0, -1.5);
      em.ensureComponentOn(tool, ScaleDef);
      vec3.copy(tool.scale, [0.5, 0.5, 0.5]);
      player.player.tool = tool.id;
      if (ColliderDef.isOn(tool)) tool.collider.solid = false;
    },
  });

  registerEventHandler("tool-drop", {
    entities: [[PlayerEntDef], [PositionDef, PhysicsParentDef]] as const,
    eventAuthorityEntity: ([playerId, toolId]) => playerId,
    legalEvent: (em, [player, tool]) => {
      return player.player.tool === tool.id;
    },
    runEvent: (em: EntityManager, [player, tool], location: vec3) => {
      tool.physicsParent.id = 0;
      // TODO(@darzu): add interact box
      // em.addComponent(tool.id, InteractableDef);
      vec3.copy(tool.position, location!);
      em.ensureComponentOn(tool, ScaleDef);
      vec3.copy(tool.scale, [1, 1, 1]);
      player.player.tool = 0;
      if (ColliderDef.isOn(tool)) tool.collider.solid = true;
    },
    serializeExtra: (buf, location) => {
      buf.writeVec3(location);
    },
    deserializeExtra: (buf) => {
      return buf.readVec3()!;
    },
  });
}
