import { EM } from "../entity-manager.js";
export const ColliderDef = EM.defineComponent("collider", (c) => {
    return (c !== null && c !== void 0 ? c : {
        shape: "Empty",
        solid: false,
    });
});
const __COLLIDER_ASSERT = true;
//# sourceMappingURL=collider.js.map