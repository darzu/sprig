import {
  CameraFollowDef,
  setCameraFollowPosition,
  CameraDef,
} from "../camera.js";
import { ColorDef } from "../color.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { gjk, penetrationDepth, Shape } from "../physics/narrowphase.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import { PAD } from "../physics/phys.js";
import {
  Frame,
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { cloneMesh } from "../render/mesh-pool.js";
import { RenderableDef, RenderableConstructDef } from "../render/renderer.js";
import { RendererDef } from "../render/render_init.js";
import { tempVec } from "../temp-pool.js";
import { assert } from "../test.js";
import { farthestPointInDir } from "../utils-3d.js";
import { AssetsDef, GameMesh } from "./assets.js";
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
let __frame = 0;
export function initDbgGame(em: EntityManager, hosting: boolean) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

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
      vec3.copy(g.position, [0, 1, -1.2]);
      quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
      // setCameraFollowPosition(g, "thirdPerson");
      g.cameraFollow.positionOffset = [0, 0, 5];
      g.controllable.modes.canYaw = false;
      g.controllable.modes.canCameraYaw = true;
      g.controllable.speed *= 0.5;
      g.controllable.sprintMul = 10;

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
      em.ensureComponentOn(b1, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(b1, PositionDef, [0, 0, 3]);
      em.ensureComponentOn(b1, RotationDef);
      em.ensureComponentOn(b1, AngularVelocityDef, [0, 0.001, 0.001]);
      em.ensureComponentOn(b1, WorldFrameDef);
      em.ensureComponentOn(b1, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.cube.aabb,
      });
      // em.ensureComponentOn(b1, ColliderDef, {
      //   shape: "Box",
      //   solid: false,
      //   center: res.assets.cube.center,
      //   halfsize: res.assets.cube.halfsize,
      // });

      const b2 = g;
      const m2 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(b2, RenderableConstructDef, m2);
      em.ensureComponentOn(b2, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(b2, PositionDef, [0, 0, 0]);
      // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
      em.ensureComponentOn(b2, WorldFrameDef);
      // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
      em.ensureComponentOn(b2, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.cube.aabb,
      });
      // em.ensureComponentOn(b2, ColliderDef, {
      //   shape: "Box",
      //   solid: false,
      //   center: res.assets.cube.center,
      //   halfsize: res.assets.cube.halfsize,
      // });

      const b3 = em.newEntity();
      const m3 = cloneMesh(res.assets.ball.mesh);
      em.ensureComponentOn(b3, RenderableConstructDef, m3);
      em.ensureComponentOn(b3, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(b3, PositionDef, [0, 0, -4]);
      em.ensureComponentOn(b3, RotationDef);
      em.ensureComponentOn(b3, WorldFrameDef);
      em.ensureComponentOn(b3, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.ball.aabb,
      });

      const b4 = em.newEntity();
      const m4 = cloneMesh(res.assets.tetra.mesh);
      em.ensureComponentOn(b4, RenderableConstructDef, m4);
      em.ensureComponentOn(b4, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(b4, PositionDef, [0, -3, 0]);
      em.ensureComponentOn(b4, RotationDef);
      em.ensureComponentOn(b4, WorldFrameDef);
      em.ensureComponentOn(b4, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.tetra.aabb,
      });

      // NOTE: this uses temp vectors, it must not live long
      // TODO(@darzu): for perf, this should be done only once per obj per frame;
      //    maybe we should transform the dir instead
      function createWorldShape(
        g: GameMesh,
        pos: vec3,
        rot: quat,
        lastWorldPos: vec3
      ): Shape {
        const transform = mat4.fromRotationTranslation(mat4.create(), rot, pos);
        const worldVerts = g.uniqueVerts.map((p) =>
          vec3.transformMat4(tempVec(), p, transform)
        );
        const support = (d: vec3) => farthestPointInDir(worldVerts, d);
        const center = vec3.transformMat4(tempVec(), g.center, transform);
        const travel = vec3.sub(tempVec(), pos, lastWorldPos);
        return {
          center,
          support,
          travel,
        };
      }

      let lastPlayerPos = vec3.clone(b2.position);
      let lastPlayerRot = quat.clone(b2.rotation);
      let lastWorldPos: vec3[] = [
        vec3.clone(b1.position),
        vec3.clone(b3.position),
        vec3.clone(b4.position),
      ];
      let lastWorldRot: quat[] = [
        quat.clone(b1.rotation),
        quat.clone(b3.rotation),
        quat.clone(b4.rotation),
      ];

      em.registerSystem(
        null,
        [InputsDef],
        (_, { inputs }) => {
          // console.log(__frame);
          // __frame++;
          // if (!inputs.keyClicks["g"]) return;

          // TODO(@darzu):

          let playerShape = createWorldShape(
            res.assets.cube,
            b2.position,
            b2.rotation,
            lastPlayerPos
          );

          const gameMeshes = [
            res.assets.cube,
            res.assets.ball,
            res.assets.tetra,
          ];
          const ents = [b1, b3, b4];

          let backTravelD = 0;

          for (let i = 0; i < ents.length; i++) {
            b2.color[i] = 0.1;
            ents[i].color[i] = 0.1;

            let shapeOther = createWorldShape(
              gameMeshes[i],
              ents[i].position,
              ents[i].rotation,
              lastWorldPos[i]
            );
            let simplex = gjk(shapeOther, playerShape);
            if (simplex) {
              b2.color[i] = 0.3;
              ents[i].color[i] = 0.3;
            }
            if (
              simplex &&
              (!quat.equals(lastWorldRot[i], ents[i].rotation) ||
                !quat.equals(lastPlayerRot, g.rotation))
            ) {
              // rotation happened, undo it
              quat.copy(ents[i].rotation, lastWorldRot[i]);
              quat.copy(g.rotation, lastPlayerRot);

              shapeOther = createWorldShape(
                gameMeshes[i],
                ents[i].position,
                ents[i].rotation,
                lastWorldPos[i]
              );
              playerShape = createWorldShape(
                res.assets.cube,
                b2.position,
                b2.rotation,
                lastPlayerPos
              );
              simplex = gjk(shapeOther, playerShape);
            }

            if (simplex) {
              const penD = penetrationDepth(shapeOther, playerShape, simplex);
              const travelD = vec3.len(playerShape.travel);
              if (penD < Infinity) {
                backTravelD += penD;
              }
              if (penD > travelD + PAD) console.error(`penD > travelD`);
              console.log(
                `penD: ${penD.toFixed(3)}, travelD: ${travelD.toFixed(3)}`
              );
            }
          }

          backTravelD = Math.min(backTravelD, vec3.len(playerShape.travel));
          const travelN = vec3.normalize(tempVec(), playerShape.travel);
          const backTravel = vec3.scale(tempVec(), travelN, backTravelD);

          // console.log(backTravel);
          vec3.sub(b2.position, b2.position, backTravel);

          lastWorldPos = [
            vec3.clone(b1.position),
            vec3.clone(b3.position),
            vec3.clone(b4.position),
          ];
          lastWorldRot = [
            quat.clone(b1.rotation),
            quat.clone(b3.rotation),
            quat.clone(b4.rotation),
          ];
          lastPlayerPos = vec3.clone(b2.position);
          lastPlayerRot = quat.clone(b2.rotation);
        },
        "checkGJK"
      );
    }
  );
}
