import { ColliderDef } from "../physics/collider.js";
import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef } from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, MeDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { AssetsDef } from "./assets.js";
export const PlaneConstructDef = EM.defineComponent("planeConstruct", (location, color) => ({
    location: location !== null && location !== void 0 ? location : vec3.fromValues(0, 0, 0),
    color: color !== null && color !== void 0 ? color : vec3.fromValues(0, 0, 0),
}));
EM.registerSerializerPair(PlaneConstructDef, (planeConstruct, buf) => {
    buf.writeVec3(planeConstruct.location);
    buf.writeVec3(planeConstruct.color);
}, (planeConstruct, buf) => {
    buf.readVec3(planeConstruct.location);
    buf.readVec3(planeConstruct.color);
});
export function registerBuildPlanesSystem(em) {
    function buildPlanes(planes, { me: { pid }, assets }) {
        for (let plane of planes) {
            if (FinishedDef.isOn(plane))
                continue;
            em.ensureComponent(plane.id, PositionDef, plane.planeConstruct.location);
            // TODO(@darzu): rotation for debugging
            // if (!RotationDef.isOn(plane)) {
            //   // const r =
            //   //   Math.random() > 0.5
            //   //     ? quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5)
            //   //     : quat.create();
            //   const r = quat.fromEuler(quat.create(), 0, 0, Math.PI * Math.random());
            //   em.ensureComponent(plane.id, RotationDef, r);
            // }
            em.ensureComponent(plane.id, ColorDef, plane.planeConstruct.color);
            em.ensureComponent(plane.id, RenderableConstructDef, assets.plane.proto);
            em.ensureComponent(plane.id, ColliderDef, {
                shape: "AABB",
                solid: true,
                aabb: assets.plane.aabb,
            });
            em.ensureComponent(plane.id, AuthorityDef, pid);
            em.ensureComponent(plane.id, SyncDef, [PlaneConstructDef.id], [PositionDef.id]);
            em.ensureComponent(plane.id, FinishedDef);
        }
    }
    em.registerSystem([PlaneConstructDef], [MeDef, AssetsDef], buildPlanes);
}
//# sourceMappingURL=plane.js.map