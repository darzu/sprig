import {
  CameraFollowDef,
  setCameraFollowPosition,
  CameraDef,
} from "../camera.js";
import { ColorDef } from "../color.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat } from "../gl-matrix.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { cloneMesh } from "../render/mesh-pool.js";
import { RenderableDef, RenderableConstructDef } from "../render/renderer.js";
import { RendererDef } from "../render/render_init.js";
import { AssetsDef } from "./assets.js";
import { ControllableDef } from "./controllable.js";
import { GlobalCursor3dDef } from "./cursor.js";

export const GhostDef = EM.defineComponent("ghost", () => ({}));

export function createGhost(em: EntityManager) {
  const g = em.newEntity();
  em.ensureComponentOn(g, GhostDef);
  em.ensureComponentOn(g, ControllableDef);
  g.controllable.modes.canFall = false;
  g.controllable.modes.canJump = false;
  em.ensureComponentOn(g, CameraFollowDef, 1);
  setCameraFollowPosition(g, "firstPerson");
  em.ensureComponentOn(g, PositionDef);
  em.ensureComponentOn(g, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  em.ensureComponentOn(g, LinearVelocityDef);

  return g;
}
export function initDbgGame(em: EntityManager, hosting: boolean) {
  em.addSingletonComponent(CameraDef);

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      const e = createGhost(em);
      // em.ensureComponentOn(g, RenderableConstructDef, res.assets.cube.proto);
      // createPlayer(em);

      // vec3.copy(e.position, [-16.6, 5, -5.1]);
      // quat.copy(e.rotation, [0, -0.77, 0, 0.636]);
      // vec3.copy(e.cameraFollow.positionOffset, [0, 0, 0]);
      // quat.copy(e.cameraFollow.rotationOffset, [-0.225, 0, 0, 0.974]);
      vec3.copy(e.position, [-4.28, 0.97, 0.11]);
      quat.setAxisAngle(e.rotation, [0.0, -1.0, 0.0], 1.62);
      vec3.copy(e.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
      quat.copy(e.cameraFollow.rotationOffset, [-0.18, 0.0, 0.0, 0.98]);

      const c = res.globalCursor3d.cursor()!;
      if (RenderableDef.isOn(c)) c.renderable.enabled = false;

      vec3.copy(res.renderer.renderer.backgroundColor, [0.7, 0.8, 1.0]);

      const p = em.newEntity();
      em.ensureComponentOn(p, RenderableConstructDef, res.assets.plane.proto);
      em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
      em.ensureComponentOn(p, PositionDef, [0, -5, 0]);

      const b1 = em.newEntity();
      const m1 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(b1, RenderableConstructDef, m1);
      em.ensureComponentOn(b1, ColorDef, [0.1, 0.2, 0.1]);
      em.ensureComponentOn(b1, PositionDef, [0, 0, 1.2]);
      em.ensureComponentOn(b1, RotationDef);
      em.ensureComponentOn(b1, AngularVelocityDef, [0, 0.001, 0.001]);

      const b2 = em.newEntity();
      const m2 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(b2, RenderableConstructDef, m2);
      em.ensureComponentOn(b2, ColorDef, [0.1, 0.1, 0.2]);
      em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
    }
  );
}
