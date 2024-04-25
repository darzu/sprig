import { FinishedDef } from "../ecs/em-helpers.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { Entity } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { AABB } from "../physics/aabb.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { registerEventHandler, DetectedEventsDef } from "../net/events.js";
import { LocalPlayerEntityDef, HsPlayerDef } from "../hyperspace/hs-player.js";
import { InteractableDef, InRangeDef } from "./interact.js";
import { Deserializer, Serializer } from "../utils/serialize.js";
import { Phase } from "../ecs/sys-phase.js";

export const ToolDef = EM.defineNonupdatableComponent(
  "tool",
  (type?: string) => ({
    type,
  })
);

export function registerToolSystems() {
  EM.addSystem(
    "toolPickup",
    Phase.POST_GAME_PLAYERS,
    [ToolDef, InRangeDef],
    [DetectedEventsDef, LocalPlayerEntityDef, MeDef],
    (hats, resources) => {
      for (let { id } of hats) {
        let player = EM.findEntity(resources.localPlayerEnt.playerId, [
          HsPlayerDef,
        ])!;
        if (player.hsPlayer.tool === 0 && player.hsPlayer.interacting) {
          resources.detectedEvents.raise({
            type: "tool-pickup",
            origPid: resources.me.pid,
            entities: [player.id, id],
            extra: null,
          });
        }
      }
    }
  );

  EM.addSystem(
    "toolDrop",
    Phase.POST_GAME_PLAYERS,
    [HsPlayerDef, PositionDef, RotationDef],
    [DetectedEventsDef, MeDef],
    (players, { detectedEvents, me }) => {
      for (let { hsPlayer, id, position, rotation } of players) {
        if (hsPlayer.dropping && hsPlayer.tool > 0) {
          let dropLocation = V(0, 0, -5);
          V3.tQuat(dropLocation, rotation, dropLocation);
          V3.add(dropLocation, position, dropLocation);
          detectedEvents.raise({
            type: "tool-drop",
            origPid: me.pid,
            entities: [id, hsPlayer.tool],
            extra: dropLocation,
          });
        }
      }
    }
  );

  registerEventHandler("tool-pickup", {
    entities: [
      [HsPlayerDef],
      [InteractableDef, PositionDef, PhysicsParentDef],
    ] as const,
    eventAuthorityEntity: ([playerId, toolId]) => playerId,
    legalEvent: ([player, tool]) => {
      return player.hsPlayer.tool === 0;
    },
    runEvent: ([player, tool]) => {
      tool.physicsParent.id = player.id;
      // TODO(@darzu): add interact box
      // EM.removeComponent(tool.id, InteractableDef);
      // TODO(@darzu): add interact box
      // EM.removeComponent(tool.id, InteractableDef);
      V3.set(0, 0, -1.5, tool.position);
      EM.set(tool, ScaleDef);
      V3.copy(tool.scale, [0.5, 0.5, 0.5]);
      player.hsPlayer.tool = tool.id;
      if (ColliderDef.isOn(tool)) tool.collider.solid = false;
    },
  });

  registerEventHandler("tool-drop", {
    entities: [[HsPlayerDef], [PositionDef, PhysicsParentDef]] as const,
    eventAuthorityEntity: ([playerId, toolId]) => playerId,
    legalEvent: ([player, tool]) => {
      return player.hsPlayer.tool === tool.id;
    },
    runEvent: ([player, tool], location: V3) => {
      tool.physicsParent.id = 0;
      // TODO(@darzu): add interact box
      // EM.addComponent(tool.id, InteractableDef);
      V3.copy(tool.position, location);
      EM.set(tool, ScaleDef);
      V3.copy(tool.scale, [1, 1, 1]);
      player.hsPlayer.tool = 0;
      if (ColliderDef.isOn(tool)) tool.collider.solid = true;
    },
    serializeExtra: (buf, location) => {
      buf.writeVec3(location);
    },
    deserializeExtra: (buf) => {
      return buf.readVec3(V3.mk());
    },
  });
}
