import { AssetsDef } from "../meshes/assets.js";
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
  defaultProps: (shipId?: number) => ({
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
  buildResources: [AssetsDef, MeDef],
  build: (gem, res) => {
    EM.ensureComponentOn(gem, PositionDef, V(0, 0, 10));

    EM.ensureComponentOn(
      gem,
      RenderableConstructDef,
      res.assets.spacerock.proto
    );
    EM.ensureComponentOn(gem, PhysicsParentDef, gem.gemProps.shipId);
    EM.ensureComponentOn(gem, ColorDef);

    // create seperate hitbox for interacting with the gem
    const interactBox = EM.new();
    const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
    EM.ensureComponentOn(interactBox, PhysicsParentDef, gem.id);
    EM.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
    EM.ensureComponentOn(interactBox, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: interactAABB,
    });
    EM.ensureComponentOn(gem, InteractableDef, interactBox.id);
  },
});
