import { Component, EM, Entity, EntityManager } from "../ecs/entity-manager.js";
import { LocalHsPlayerDef, HsPlayerDef } from "../hyperspace/hs-player.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import {
  Position,
  PositionDef,
  Rotation,
  RotationDef,
} from "../physics/transform.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { clearTint, setTint, TintsDef } from "../color/color-ecs.js";
import { DeletedDef } from "../ecs/delete.js";

export const InteractableDef = EM.defineComponent(
  "interaction",
  (colliderId?: number) => ({
    // TODO(@darzu): components having pointers to entities should be
    //  handled better
    // TODO(@darzu): use Ref system
    colliderId: colliderId || 0,
  })
);

export const InRangeDef = EM.defineComponent("inRange", () => true);

const INTERACTION_TINT = V(0.1, 0.2, 0.1);
const INTERACTION_TINT_NAME = "interaction";

export function registerInteractionSystem(em: EntityManager) {
  em.registerSystem(
    "interactableInteract",
    [InteractableDef, WorldFrameDef],
    [LocalHsPlayerDef, MeDef, PhysicsResultsDef],
    (interactables, resources) => {
      const player = em.findEntity(resources.localHsPlayer.playerId, []);
      if (!player) return;

      const interactablesMap: Map<number, Entity> = interactables.reduce(
        (map, i) => {
          map.set(i.interaction.colliderId, i);
          return map;
        },
        new Map()
      );
      for (let interactable of interactables) {
        if (DeletedDef.isOn(interactable))
          // TODO(@darzu): HACK this shouldn't be needed
          continue;
        if (InRangeDef.isOn(interactable)) {
          em.removeComponent(interactable.id, InRangeDef);
        }
        em.ensureComponentOn(interactable, TintsDef);
        clearTint(interactable.tints, INTERACTION_TINT_NAME);
      }
      // find an interactable within range of the player
      const interactableColliderId = (
        resources.physicsResults.collidesWith.get(player.id) ?? []
      ).find((id) => interactablesMap.has(id));
      if (interactableColliderId) {
        const interactable = interactablesMap.get(interactableColliderId)!;
        if (!DeletedDef.isOn(interactable)) {
          em.ensureComponentOn(interactable, InRangeDef);
          em.ensureComponentOn(interactable, TintsDef);
          setTint(interactable.tints, INTERACTION_TINT_NAME, INTERACTION_TINT);
        }
      }
    }
  );
}
