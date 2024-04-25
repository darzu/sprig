import { EntityW, EM } from "../ecs/entity-manager.js";
import { ComponentDef } from "../ecs/em-components.js";
import { Resources } from "../ecs/em-resources.js";
import { ResourceDef } from "../ecs/em-resources.js";
import { Phase } from "../ecs/sys-phase.js";
import { PhysicsResultsDef } from "./nonintersection.js";

// TODO(@darzu): make this friendly with multiplayer event system?
// TODO(@darzu): support narrowphase check? e.g. SphereBV vs OBB
export function onCollides<
  AS extends ComponentDef[],
  BS extends ComponentDef[],
  RS extends ResourceDef[]
>(
  as: [...AS],
  bs: [...BS],
  rs: [...RS],
  callback: (a: EntityW<AS>, b: EntityW<BS>, resources: Resources<RS>) => void
) {
  const aName = as.map((a) => a.name).join("_");
  const bName = bs.map((b) => b.name).join("_");
  const sysName = `Collides_${aName}_v_${bName}`;
  EM.addSystem(
    sysName,
    Phase.GAME_WORLD,
    as,
    [PhysicsResultsDef, ...rs],
    (aas, _res) => {
      // TODO(@darzu): TypeScript. Doesn't believe these:
      const res1 = _res as unknown as Resources<[typeof PhysicsResultsDef]>;
      const res2 = _res as Resources<RS>;
      for (let _a of aas) {
        const a = _a as EntityW<AS>; // TODO(@darzu): TypeScript. Doesn't believe this by default.
        let others = res1.physicsResults.collidesWith.get(a.id);
        if (!others) continue;
        for (let bId of others) {
          const b = EM.findEntity(bId, bs);
          if (!b) continue;
          callback(a, b, res2);
        }
      }
    }
  );
}
