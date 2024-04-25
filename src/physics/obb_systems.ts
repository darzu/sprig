import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { dbgLogOnce } from "../utils/util.js";
import { ColliderDef, isAABBCollider } from "./collider.js";
import { WorldFrameDef } from "./nonintersection.js";
import { OBBDef } from "./obb.js";

// TODO(@darzu): MOVE. we had to move this here for dependency reasons, but ideally we'd clean up our dependencies

EM.addSystem(
  "updateOBBFromLocalAABB",
  Phase.GAME_WORLD,
  [OBBDef, WorldFrameDef, ColliderDef],
  [],
  (es) => {
    for (let e of es) {
      if (!isAABBCollider(e.collider)) {
        dbgLogOnce(
          `ent ${e.id} has OBBDef and ColliderDef but not an AABBCollider!`,
          undefined,
          true
        );
        continue;
      }
      // console.log("updating obb");
      e.obb.updateFromMat4(e.collider.aabb, e.world.transform);
    }
  }
);

export const _OBB_SYSTEMS = true; // TODO(@darzu): HACK. having files w/ systems but no exports doesn't work b/c these don't get loaded.
