import { EM } from "../entity-manager.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef } from "../physics/transform.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "./game.js";
export const GlobalCursor3dDef = EM.defineComponent("globalCursor3d", () => {
    return {
        entityId: -1,
    };
});
export const Cursor3dDef = EM.defineComponent("cursor3d", () => true);
export function getCursor(em, cs) {
    const gb = em.findSingletonComponent(GlobalCursor3dDef);
    if (!gb)
        return undefined;
    const e = em.findEntity(gb.globalCursor3d.entityId, [Cursor3dDef, ...cs]);
    return e;
}
export function registerBuildCursor(em) {
    em.addSingletonComponent(GlobalCursor3dDef);
    em.registerSystem(null, [GlobalCursor3dDef, AssetsDef], (_, res) => {
        if (res.globalCursor3d.entityId === -1) {
            const cursor = em.newEntity();
            const id = cursor.id;
            res.globalCursor3d.entityId = id;
            em.addComponent(id, Cursor3dDef);
            em.addComponent(id, PositionDef);
            const wireframe = { ...res.assets.ball.mesh, tri: [] };
            em.addComponent(id, RenderableConstructDef, wireframe, false);
            em.addComponent(id, ColorDef, [0, 1, 1]);
        }
    }, "buildCursor");
}
