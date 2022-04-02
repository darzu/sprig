import { FinishedDef } from "../build.js";
import { EM } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { AssetsDef, SHIP_AABBS } from "./assets.js";
import { ColliderDef, } from "../physics/collider.js";
export const ShipConstructDef = EM.defineComponent("shipConstruct", (loc, rot) => {
    return {
        loc: loc !== null && loc !== void 0 ? loc : vec3.create(),
        rot: rot !== null && rot !== void 0 ? rot : quat.create(),
    };
});
function serializeShipConstruct(c, buf) {
    buf.writeVec3(c.loc);
    buf.writeQuat(c.rot);
}
function deserializeShipConstruct(c, buf) {
    buf.readVec3(c.loc);
    buf.readQuat(c.rot);
}
EM.registerSerializerPair(ShipConstructDef, serializeShipConstruct, deserializeShipConstruct);
export function registerBuildShipSystem(em) {
    em.registerSystem([ShipConstructDef], [MeDef, AssetsDef], (ships, res) => {
        for (let e of ships) {
            // createShip(em, s, res.me.pid, res.assets);
            const pid = res.me.pid;
            const assets = res.assets;
            if (FinishedDef.isOn(e))
                return;
            const props = e.shipConstruct;
            if (!PositionDef.isOn(e))
                em.addComponent(e.id, PositionDef, props.loc);
            if (!RotationDef.isOn(e))
                em.addComponent(e.id, RotationDef, props.rot);
            if (!RenderableConstructDef.isOn(e))
                em.addComponent(e.id, RenderableConstructDef, assets.ship.mesh);
            if (!AuthorityDef.isOn(e))
                em.addComponent(e.id, AuthorityDef, pid);
            if (!SyncDef.isOn(e)) {
                const sync = em.addComponent(e.id, SyncDef);
                sync.fullComponents.push(ShipConstructDef.id);
                sync.dynamicComponents.push(PositionDef.id);
                sync.dynamicComponents.push(RotationDef.id);
            }
            em.addComponent(e.id, FinishedDef);
            // TODO(@darzu): multi collider
            const mc = {
                shape: "Multi",
                solid: true,
                // TODO(@darzu): integrate these in the assets pipeline
                children: SHIP_AABBS.map((aabb) => ({
                    shape: "AABB",
                    solid: true,
                    aabb,
                })),
            };
            em.ensureComponentOn(e, ColliderDef, mc);
        }
    }, "buildShips");
}
//# sourceMappingURL=ship.js.map