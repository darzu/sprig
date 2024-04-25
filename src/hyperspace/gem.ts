import { AllMeshesDef } from "../meshes/mesh-list.js";
import { ColorDef } from "../color/color-ecs.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, PhysicsParentDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { InteractableDef } from "../input/interact.js";

export const { GemPropsDef, GemLocalDef, createGem } = defineNetEntityHelper({
  name: "gem",
  defaultProps: () => ({
    shipId: 0,
  }),
  updateProps: (p, shipId?: number) =>
    Object.assign(p, {
      shipId: shipId ?? 0,
    }),
  serializeProps: (o, buf) => {
    buf.writeUint32(o.shipId);
  },
  deserializeProps: (o, buf) => {
    o.shipId = buf.readUint32();
  },
  defaultLocal: () => true,
  dynamicComponents: [],
  buildResources: [AllMeshesDef, MeDef],
  build: (gem, res) => {
    EM.set(gem, PositionDef, V(0, 0, 10));

    EM.set(gem, RenderableConstructDef, res.allMeshes.spacerock.proto);
    EM.set(gem, PhysicsParentDef, gem.gemProps.shipId);
    EM.set(gem, ColorDef);

    // create seperate hitbox for interacting with the gem
    const interactBox = EM.mk();
    const interactAABB = copyAABB(createAABB(), res.allMeshes.spacerock.aabb);
    EM.set(interactBox, PhysicsParentDef, gem.id);
    EM.set(interactBox, PositionDef, V(0, 0, 0));
    EM.set(interactBox, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: interactAABB,
    });
    EM.set(gem, InteractableDef, interactBox.id);
  },
});
