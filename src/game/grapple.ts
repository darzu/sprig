import { defineNetEntityHelper } from "../em_helpers.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { AssetsDef } from "./assets.js";
import { YawPitchDef } from "./cannon.js";
import { ColorDef } from "./game.js";
import { InteractableDef } from "./interact.js";

// TODO(@darzu): lots of duplicates with cannon
export const { GrapplegunPropsDef, GrapplegunLocalDef, createGrapplegun } =
  defineNetEntityHelper(EM, {
    name: "grapplegun",
    defaultProps: (
      loc?: vec3,
      yaw?: number,
      pitch?: number,
      parentId?: number
    ) => {
      return {
        location: loc ?? vec3.fromValues(0, 0, 0),
        yaw: yaw ?? 0,
        pitch: pitch ?? 0,
        parentId: parentId ?? 0,
      };
    },
    serializeProps: (c, buf) => {
      buf.writeVec3(c.location);
      buf.writeFloat32(c.yaw);
      buf.writeUint32(c.parentId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.location);
      c.yaw = buf.readFloat32();
      c.parentId = buf.readUint32();
    },
    defaultLocal: () => {
      return {
        mannedId: 0,
        minYaw: -Math.PI * 0.5,
        maxYaw: +Math.PI * 0.5,
        minPitch: -Math.PI * 0.3,
        maxPitch: Math.PI * 0.1,
        fireMs: 0,
        fireDelayMs: 1000,
      };
    },
    dynamicComponents: [YawPitchDef],
    buildResources: [AssetsDef, MeDef],
    build: (e, res) => {
      const em: EntityManager = EM;
      const props = e.grapplegunProps;
      em.ensureComponent(e.id, PositionDef, props.location);
      em.ensureComponent(e.id, RotationDef);
      em.ensureComponent(e.id, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponent(
        e.id,
        RenderableConstructDef,
        res.assets.grappleGun.mesh
      );
      e.yawpitch.yaw = props.yaw;
      e.yawpitch.pitch = props.pitch;
      e.grapplegunLocal.minYaw += props.yaw;
      e.grapplegunLocal.maxYaw += props.yaw;
      em.ensureComponent(e.id, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.assets.cannon.aabb,
      });
      em.ensureComponentOn(e, PhysicsParentDef, props.parentId);

      // create seperate hitbox for interacting with the cannon
      const interactBox = em.newEntity();
      const interactAABB = copyAABB(createAABB(), res.assets.cannon.aabb);
      vec3.scale(interactAABB.min, interactAABB.min, 2);
      vec3.scale(interactAABB.max, interactAABB.max, 2);
      em.ensureComponentOn(interactBox, PhysicsParentDef, e.id);
      em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
      em.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponent(e.id, InteractableDef, interactBox.id);
    },
  });

export function registerGrappleSystems(em: EntityManager) {
  em.registerOneShotSystem(null, [AssetsDef], (_, res) => {
    const h = em.newEntity();
    em.ensureComponentOn(h, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(h, ColorDef, [0.1, 0.1, 0.1]);
    em.ensureComponentOn(
      h,
      RenderableConstructDef,
      res.assets.grappleHook.proto
    );

    const g = em.newEntity();
    em.ensureComponentOn(g, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(g, ColorDef, [0.1, 0.1, 0.1]);
    em.ensureComponentOn(
      g,
      RenderableConstructDef,
      res.assets.grappleGun.proto
    );
  });
}
