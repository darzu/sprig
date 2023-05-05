import { AssetsDef } from "../meshes/assets.js";
import { ColorDef } from "../color/color-ecs.js";
import { defineNetEntityHelper } from "../ecs/em_helpers.js";
import { EM, EntityManager } from "../ecs/entity-manager.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, PhysicsParentDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V } from "../sprig-matrix.js";
import { InteractableDef } from "../games/interact.js";

export const { GemPropsDef, GemLocalDef, createGem } = defineNetEntityHelper(
  EM,
  {
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
      const em: EntityManager = EM;

      em.ensureComponentOn(gem, PositionDef, V(0, 0, 10));

      em.ensureComponentOn(
        gem,
        RenderableConstructDef,
        res.assets.spacerock.proto
      );
      em.ensureComponentOn(gem, PhysicsParentDef, gem.gemProps.shipId);
      em.ensureComponentOn(gem, ColorDef);

      // create seperate hitbox for interacting with the gem
      const interactBox = em.new();
      const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
      em.ensureComponentOn(interactBox, PhysicsParentDef, gem.id);
      em.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
      em.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(gem, InteractableDef, interactBox.id);
    },
  }
);
