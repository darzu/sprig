import { FinishedDef } from "../build.js";
import { EM } from "../entity-manager.js";
import { quat } from "../gl-matrix.js";
import { PhysicsParentDef, PositionDef, RotationDef, ScaleDef, } from "../physics/transform.js";
import { scaleMesh3 } from "../render/mesh-pool.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "./game.js";
export const EnemyConstructDef = EM.defineComponent("enemyConstruct", (parent, pos) => {
    return {
        parent,
        pos,
    };
});
export const EnemyDef = EM.defineComponent("enemy", () => {
    return {
        leftLegId: 0,
        rightLegId: 0,
    };
});
export function registerCreateEnemies(em) {
    em.registerSystem([EnemyConstructDef], [AssetsDef], (cs, res) => {
        for (let e of cs) {
            if (em.hasComponents(e, [FinishedDef]))
                continue;
            em.ensureComponentOn(e, EnemyDef);
            em.ensureComponentOn(e, PositionDef, e.enemyConstruct.pos);
            em.ensureComponentOn(e, RotationDef, quat.create());
            const torso = scaleMesh3(res.assets.cube.mesh, [0.75, 0.75, 0.4]);
            em.ensureComponentOn(e, RenderableConstructDef, torso);
            em.ensureComponentOn(e, ColorDef, [0.2, 0.0, 0]);
            em.ensureComponentOn(e, PhysicsParentDef, e.enemyConstruct.parent);
            function makeLeg(x) {
                const l = em.newEntity();
                em.ensureComponentOn(l, PositionDef, [x, -1.75, 0]);
                em.ensureComponentOn(l, RenderableConstructDef, res.assets.cube.proto);
                em.ensureComponentOn(l, ScaleDef, [0.1, 1.0, 0.1]);
                em.ensureComponentOn(l, ColorDef, [0.05, 0.05, 0.05]);
                em.ensureComponentOn(l, PhysicsParentDef, e.id);
                return l;
            }
            e.enemy.leftLegId = makeLeg(-0.5).id;
            e.enemy.rightLegId = makeLeg(0.5).id;
            em.addComponent(e.id, FinishedDef);
        }
    }, "makeEnemies");
}
