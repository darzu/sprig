import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { ColliderDef } from "./collider.js";

// TODO(@darzu): is this a good component? There's probably a more preformant way to do this
// directly with physicsStepContact
// TODO(@darzu): Another "flag" component. We maybe should special case these
export const TeleportDef = EM.defineComponent(
  "teleport",
  () => true,
  (_) => true
);
EM.addEagerInit([TeleportDef, ColliderDef], [], [], () => {
  EM.addSystem(
    "teleportSet",
    Phase.PRE_PHYSICS,
    [TeleportDef, ColliderDef],
    [],
    (cs) => {
      for (let c of cs) {
        if (!c.collider.solid) {
          // Teleport doesn't make sense for non-solid
          console.warn(`trying to teleport non-solid entity: ${c.id}`);
          EM.removeComponent(c.id, TeleportDef);
        } else {
          c.collider.solid = false;
        }
      }
    }
  );
  EM.addSystem(
    "teleportUnset",
    Phase.POST_PHYSICS,
    [TeleportDef, ColliderDef],
    [],
    (cs) => {
      for (let c of cs) {
        c.collider.solid = true;
        EM.removeComponent(c.id, TeleportDef);
      }
    }
  );
});
