import { EASE_INQUAD, EASE_INVERSE, EASE_LINEAR } from "../animate-to.js";
import {
  CameraFollowDef,
  setCameraFollowPosition,
  CameraDef,
} from "../camera.js";
import { ColorDef } from "../color.js";
import { DeletedDef } from "../delete.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { InputsDef } from "../inputs.js";
import { jitter, mathMap, mathMapNEase } from "../math.js";
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
  ScaleDef,
} from "../physics/transform.js";
import {
  CyRenderPipelinePtr,
  CyCompPipelinePtr,
} from "../render/gpu-registry.js";
import { cloneMesh, scaleMesh } from "../render/mesh.js";
import {
  RenderableDef,
  RenderableConstructDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import {
  normalDbg,
  positionDbg,
  stdRenderPipeline,
} from "../render/std-pipeline.js";
import { postProcess } from "../render/std-post.js";
import { shadowDbgDisplay, shadowPipeline } from "../render/std-shadow.js";
import {
  boidRender,
  boidCanvasMerge,
  boidComp0,
  boidComp1,
} from "../render/xp-boids-pipeline.js";
import {
  cmpClothPipelinePtr0,
  cmpClothPipelinePtr1,
} from "../render/xp-cloth-pipeline.js";
import {
  renderRopePipelineDesc,
  compRopePipelinePtr,
} from "../render/xp-ropestick-pipeline.js";
import { tempVec } from "../temp-pool.js";
import { assert } from "../test.js";
import { TimeDef } from "../time.js";
import { farthestPointInDir, vec3Dbg } from "../utils-3d.js";
import { drawLine } from "../utils-game.js";
import { AssetsDef, GameMesh } from "./assets.js";
import { BOAT_COLOR } from "./boat.js";
import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { ControllableDef } from "./controllable.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { ForceDef, SpringGridDef } from "./spring.js";
import { TextDef } from "./ui.js";

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
export function initGJKSandbox(em: EntityManager, hosting: boolean) {
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

export function initClothSandbox(em: EntityManager, hosting: boolean) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      let renderPipelinesPtrs: CyRenderPipelinePtr[] = [
        // TODO(@darzu):
        shadowPipeline,
        stdRenderPipeline,
        // renderRopePipelineDesc,
        boidRender,
        // boidCanvasMerge,
        // shadowDbgDisplay,
        // normalDbg,
        // positionDbg,
        postProcess,
      ];
      let computePipelinesPtrs: CyCompPipelinePtr[] = [
        cmpClothPipelinePtr0,
        cmpClothPipelinePtr1,
        compRopePipelinePtr,
        boidComp0,
        boidComp1,
      ];
      res.renderer.pipelines = [
        ...computePipelinesPtrs,
        ...renderPipelinesPtrs,
      ];

      const g = createGhost(em);
      vec3.copy(g.position, [0, 1, -1.2]);
      quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
      g.controllable.sprintMul = 3;

      // TODO(@darzu): this shouldn't be necessary
      const m2 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(g, RenderableConstructDef, m2);

      {
        // vec3.copy(e.position, [-16.85, 7.11, -4.33]);
        // quat.copy(e.rotation, [0.0, -0.76, 0.0, 0.65]);
        // vec3.copy(e.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        // e.cameraFollow.yawOffset = 0.0;
        // e.cameraFollow.pitchOffset = -0.368;

        vec3.copy(g.position, [4.46, 9.61, -10.52]);
        quat.copy(g.rotation, [0.0, -1.0, 0.0, 0.04]);
        vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        g.cameraFollow.yawOffset = 0.0;
        g.cameraFollow.pitchOffset = -0.106;
      }

      const c = res.globalCursor3d.cursor()!;
      assert(RenderableDef.isOn(c));
      c.renderable.enabled = true;
      c.cursor3d.maxDistance = 10;

      const plane = em.newEntity();
      em.ensureComponentOn(
        plane,
        RenderableConstructDef,
        res.assets.plane.proto
      );
      em.ensureComponentOn(plane, ColorDef, [0.2, 0.3, 0.2]);
      em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

      const ship = em.newEntity();
      em.ensureComponentOn(ship, RenderableConstructDef, res.assets.ship.proto);
      em.ensureComponentOn(ship, ColorDef, BOAT_COLOR);
      em.ensureComponentOn(ship, PositionDef, [20, -2, 0]);
      em.ensureComponentOn(
        ship,
        RotationDef,
        quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
      );

      const box = em.newEntity();
      em.ensureComponentOn(box, RenderableConstructDef, res.assets.cube.proto);
      em.ensureComponentOn(box, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(box, PositionDef, [0, 0, 3]);
      em.ensureComponentOn(box, RotationDef);
      em.ensureComponentOn(box, AngularVelocityDef, [0, 0.001, 0.001]);
      em.ensureComponentOn(box, WorldFrameDef);
      em.ensureComponentOn(box, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.cube.aabb,
      });

      const cloth = em.newEntity();
      em.ensureComponentOn(cloth, ClothConstructDef, {
        location: [0, 0, 0],
        color: [0.9, 0.9, 0.8],
        rows: 5,
        columns: 5,
        distance: 2,
      });
      const F = 100.0;
      em.ensureComponentOn(cloth, ForceDef, [F, F, F]);
    }
  );

  let line: ReturnType<typeof drawLine>;

  em.registerSystem(
    [ClothConstructDef, ClothLocalDef, WorldFrameDef, ForceDef],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (!cs.length) return;
      const cloth = cs[0];

      // cursor to cloth
      const cursorPos = res.globalCursor3d.cursor()!.world.position;
      const midpoint = vec3.scale(
        tempVec(),
        [cloth.clothConstruct.columns / 2, cloth.clothConstruct.rows / 2, 0],
        cloth.clothConstruct.distance
      );
      const clothPos = vec3.add(midpoint, midpoint, cloth.world.position);

      // line from cursor to cloth
      if (!line) line = drawLine(vec3.create(), vec3.create(), [0, 1, 0]);
      if (RenderableDef.isOn(line)) {
        line.renderable.enabled = true;
        const m = line.renderable.meshHandle.readonlyMesh!;
        vec3.copy(m.pos[0], cursorPos);
        vec3.copy(m.pos[1], clothPos);
        res.renderer.renderer.updateMesh(line.renderable.meshHandle, m);
      }

      // scale the force
      const delta = vec3.sub(tempVec(), clothPos, cursorPos);
      const dist = vec3.len(delta);
      vec3.normalize(cloth.force, delta);
      const strength = mathMapNEase(dist, 4, 20, 0, 500, (p) =>
        EASE_INQUAD(1.0 - p)
      );
      res.text.upperText = `${strength.toFixed(2)}`;

      // apply the force?
      if (res.inputs.keyDowns["e"]) {
        vec3.scale(cloth.force, cloth.force, strength);
      } else {
        vec3.copy(cloth.force, [0, 0, 0]);
        if (RenderableDef.isOn(line)) {
          line.renderable.enabled = false;
        }
      }
    },
    "clothSandbox"
  );
}

export function initReboundSandbox(em: EntityManager, hosting: boolean) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  let tableId = -1;

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef, TextDef],
    (_, res) => {
      const g = createGhost(em);
      vec3.copy(g.position, [-6.5, 3.06, 22.51]);
      quat.copy(g.rotation, [0.0, -0.08, 0.0, 1.0]);
      vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
      g.cameraFollow.yawOffset = 0.0;
      g.cameraFollow.pitchOffset = 0.145;

      const c = res.globalCursor3d.cursor()!;
      assert(RenderableDef.isOn(c));
      c.renderable.enabled = false;

      const p = em.newEntity();
      em.ensureComponentOn(p, RenderableConstructDef, res.assets.plane.proto);
      em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
      em.ensureComponentOn(p, PositionDef, [0, -10, 0]);
      em.ensureComponentOn(p, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.plane.aabb,
      });

      const t = em.newEntity();
      em.ensureComponentOn(
        t,
        RenderableConstructDef,
        res.assets.gridPlane.proto
      );
      em.ensureComponentOn(t, ColorDef, [0.2, 0.2, 0.9]);
      em.ensureComponentOn(t, PositionDef, [0, 0, 0]);
      em.ensureComponentOn(t, AngularVelocityDef, [0, 0.0002, 0.0002]);
      em.ensureComponentOn(t, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.assets.gridPlane.aabb,
      });
      tableId = t.id;

      res.text.lowerText = `spawner (p) stack (l) clear (backspace)`;
    }
  );

  const cubeDef = em.defineComponent("cube", () => true);

  function spawn(m: GameMesh, pos: vec3) {
    const e = em.newEntity();
    em.ensureComponentOn(e, RenderableConstructDef, m.proto);
    const [r, g, b] = [jitter(0.1) + 0.2, jitter(0.1) + 0.2, jitter(0.1) + 0.2];
    em.ensureComponentOn(e, ColorDef, [r, g, b]);
    em.ensureComponentOn(e, PositionDef, pos);
    em.ensureComponentOn(e, ScaleDef, [0.5, 0.5, 0.5]);
    // em.ensureComponentOn(b, RotationDef);
    // em.ensureComponentOn(b, AngularVelocityDef, [0, 0.001, 0.001]);
    em.ensureComponentOn(e, LinearVelocityDef, [0, -0.02, 0]);
    em.ensureComponentOn(e, PhysicsParentDef, tableId);
    em.ensureComponentOn(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: m.aabb,
    });
    em.ensureComponentOn(e, cubeDef);
  }

  let nextSpawnAccu = 0;
  let paused = true;
  em.registerSystem(
    null,
    [AssetsDef, TimeDef, InputsDef],
    (_, res) => {
      // pause/unpause
      if (res.inputs.keyClicks["p"]) paused = !paused;

      // spawner
      if (!paused) {
        nextSpawnAccu += res.time.dt;
        if (nextSpawnAccu > 100) {
          nextSpawnAccu = 0;

          const x = jitter(5);
          const z = jitter(5);
          spawn(res.assets.cube, [x, 20, z]);
        }
      }

      // stack spawn
      if (res.inputs.keyClicks["l"]) {
        const NUM = 1;
        const SPC = 2;
        for (let i = 0; i < NUM; i++)
          spawn(res.assets.cube, [0, 10 + i * SPC, 0]);
      }

      if (res.inputs.keyClicks["backspace"]) {
        const es = em.filterEntities([cubeDef]);
        for (let e of es) em.ensureComponentOn(e, DeletedDef);
      }
    },
    "sandboxSpawnBoxes"
  );
}
