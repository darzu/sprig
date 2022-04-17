import {
  CameraFollowDef,
  setCameraFollowPosition,
  CameraDef,
} from "../camera.js";
import { ColorDef } from "../color.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import {
  boxLocalPoints,
  farthestPointInDir,
  gjk,
} from "../physics/narrowphase.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { cloneMesh } from "../render/mesh-pool.js";
import { RenderableDef, RenderableConstructDef } from "../render/renderer.js";
import { RendererDef } from "../render/render_init.js";
import { assert } from "../test.js";
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
      const g = createGhost(em);
      // em.ensureComponentOn(g, RenderableConstructDef, res.assets.cube.proto);
      // createPlayer(em);

      // vec3.copy(e.position, [-16.6, 5, -5.1]);
      // quat.copy(e.rotation, [0, -0.77, 0, 0.636]);
      // vec3.copy(e.cameraFollow.positionOffset, [0, 0, 0]);
      // quat.copy(e.cameraFollow.rotationOffset, [-0.225, 0, 0, 0.974]);
      // vec3.copy(g.position, [-4.28, 0.97, 0.11]);
      // quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
      // quat.copy(g.cameraFollow.rotationOffset, [-0.18, 0.0, 0.0, 0.98]);
      vec3.copy(g.position, [0, 0, -1.2]);
      quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
      setCameraFollowPosition(g, "thirdPerson");
      g.controllable.modes.canYaw = false;
      g.controllable.modes.canCameraYaw = true;

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
      em.ensureComponentOn(b1, WorldFrameDef);
      // em.ensureComponentOn(b1, ColliderDef, {
      //   shape: "Box",
      //   solid: false,
      //   center: res.assets.cube.center,
      //   halfsize: res.assets.cube.halfsize,
      // });

      const b2 = em.newEntity();
      const m2 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(b2, RenderableConstructDef, m2);
      em.ensureComponentOn(b2, ColorDef, [0.1, 0.1, 0.2]);
      em.ensureComponentOn(b2, PositionDef, [0, 0, 0]);
      // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
      em.ensureComponentOn(b2, WorldFrameDef);
      em.ensureComponentOn(b2, PhysicsParentDef, g.id);
      // em.ensureComponentOn(b2, ColliderDef, {
      //   shape: "Box",
      //   solid: false,
      //   center: res.assets.cube.center,
      //   halfsize: res.assets.cube.halfsize,
      // });

      const center = res.assets.cube.center;
      const halfsize = res.assets.cube.halfsize;

      em.registerSystem(
        null,
        [InputsDef],
        (_, res) => {
          if (!res.inputs.keyClicks["g"]) return;

          // TODO(@darzu):
          const localA = boxLocalPoints(center, halfsize);
          const worldA = localA.map((p) =>
            vec3.transformMat4(p, p, b1.world.transform)
          );
          const supportA = (d: vec3) => farthestPointInDir(worldA, d);
          const centerA = vec3.transformMat4(
            vec3.create(),
            center,
            b1.world.transform
          );
          const shapeA = {
            center: centerA,
            support: supportA,
          };

          const localB = boxLocalPoints(center, halfsize);
          const worldB = localB.map((p) =>
            vec3.transformMat4(p, p, b2.world.transform)
          );
          const supportB = (d: vec3) => farthestPointInDir(worldB, d);
          const centerB = vec3.transformMat4(
            vec3.create(),
            center,
            b2.world.transform
          );
          const shapeB = {
            center: centerB,
            support: supportB,
          };

          const overlaps = gjk(shapeA, shapeB);
          // const overlaps = false;

          if (overlaps) {
            b1.color[0] = 0.3;
            b2.color[0] = 0.3;
          } else {
            b1.color[0] = 0.1;
            b2.color[0] = 0.1;
          }
        },
        "checkGJK"
      );
    }
  );
}
