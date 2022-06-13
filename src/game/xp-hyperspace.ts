import { CameraDef, CAMERA_OFFSETS } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager, EM } from "../entity-manager.js";
import { vec3, quat } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { max } from "../math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import {
  CyRenderPipelinePtr,
  CyCompPipelinePtr,
  CyPipelinePtr,
} from "../render/gpu-registry.js";
import { cloneMesh, unshareProvokingVerticesWithMap } from "../render/mesh.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/std-blur.js";
import { stdRenderPipeline } from "../render/std-pipeline.js";
import { postProcess } from "../render/std-post.js";
import { outlineRender } from "../render/std-outline.js";
import { shadowDbgDisplay, shadowPipeline } from "../render/std-shadow.js";
import { initStars, renderStars } from "../render/xp-stars.js";
import { assert } from "../test.js";
import { uintToVec3unorm } from "../utils-3d.js";
import { AssetsDef } from "./assets.js";
import { BOAT_COLOR } from "./boat.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { createGhost } from "./sandbox.js";
import { TextDef } from "./ui.js";

const OceanDef = EM.defineComponent("ocean", () => true);

export function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      let pipelines: CyPipelinePtr[] = [
        // TODO(@darzu):
        initStars,
        shadowPipeline,
        stdRenderPipeline,
        outlineRender,
        renderStars,
        // TODO(@darzu): doesn't quite work yet
        ...blurPipelines,
        // renderRopePipelineDesc,
        // boidRender,
        // boidCanvasMerge,
        // shadowDbgDisplay,
        // normalDbg,
        // positionDbg,
        postProcess,
      ];
      res.renderer.pipelines = pipelines;

      // TODO(@darzu): call one-shot initStars

      const g = createGhost(em);
      vec3.copy(g.position, [0, 1, -1.2]);
      quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
      g.controllable.sprintMul = 3;
      em.ensureComponentOn(g, ColorDef, [0.2, 0.6, 0.2]);
      vec3.copy(g.cameraFollow.positionOffset, [0, 0, 0]);
      // vec3.copy(g.cameraFollow.positionOffset, [0, 2, 8]);

      // TODO(@darzu): this shouldn't be necessary
      const m2 = cloneMesh(res.assets.cube.mesh);
      em.ensureComponentOn(g, RenderableConstructDef, m2, true);

      {
        // vec3.copy(g.position, [4.46, 9.61, -10.52]);
        // quat.copy(g.rotation, [0.0, -1.0, 0.0, 0.04]);
        // // vec3.copy(g.cameraFollow.positionOffset, [0, 0, 0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.106;
        // vec3.copy(g.position, [97.81, 0.58, -3.91]);
        // quat.copy(g.rotation, [0.0, -0.96, 0.0, 0.29]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.522;
        // vec3.copy(g.position, [-6.6, 0.86, 17.55]);
        // quat.copy(g.rotation, [0.0, -0.27, 0.0, 0.96]);
        // vec3.copy(g.cameraFollow.positionOffset, [0.0, 2.0, 8.0]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = -0.536;
        // vec3.copy(g.position, [-7.56, 0.86, 18.55]);
        // quat.copy(g.rotation, [0.0, 0.34, 0.0, 0.93]);
        // g.cameraFollow.yawOffset = 0.0;
        // g.cameraFollow.pitchOffset = 0.345;
        vec3.copy(g.position, [-3.32, 6.69, 15.4]);
        quat.copy(g.rotation, [0.0, -0.27, 0.0, 0.95]);
        g.cameraFollow.yawOffset = 0.0;
        g.cameraFollow.pitchOffset = 0.142;
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

      const fence = em.newEntity();
      em.ensureComponentOn(
        fence,
        RenderableConstructDef,
        res.assets.triFence.proto
      );
      // em.ensureComponentOn(fence, ColorDef, [0.2, 0.3, 0.2]);
      em.ensureComponentOn(fence, ScaleDef, [2, 2, 2]);
      em.ensureComponentOn(fence, PositionDef, [0, 0, 10]);

      const ship = em.newEntity();
      em.ensureComponentOn(ship, RenderableConstructDef, res.assets.ship.proto);
      em.ensureComponentOn(ship, ColorDef, BOAT_COLOR);
      em.ensureComponentOn(ship, PositionDef, [20, -2, 0]);
      em.ensureComponentOn(
        ship,
        RotationDef,
        quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
      );

      const ship2 = em.newEntity();
      em.ensureComponentOn(
        ship2,
        RenderableConstructDef,
        res.assets.ship.proto
      );
      em.ensureComponentOn(ship2, ColorDef, BOAT_COLOR);
      em.ensureComponentOn(ship2, PositionDef, [60, -2, 0]);
      em.ensureComponentOn(
        ship2,
        RotationDef,
        quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
      );
      em.ensureComponentOn(ship2, AngularVelocityDef, [0, 0.001, 0.001]);

      const ship3 = em.newEntity();
      em.ensureComponentOn(
        ship3,
        RenderableConstructDef,
        res.assets.grappleGun.proto
      );
      em.ensureComponentOn(ship3, ColorDef, BOAT_COLOR);
      em.ensureComponentOn(ship3, PositionDef, [100, -2, 0]);
      em.ensureComponentOn(
        ship3,
        RotationDef,
        quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
      );
      em.ensureComponentOn(ship3, AngularVelocityDef, [0, 0.001, 0.001]);

      const ocean = em.newEntity();
      em.ensureComponentOn(ocean, OceanDef);
      em.ensureComponentOn(
        ocean,
        RenderableConstructDef,
        res.assets.ocean.proto
      );
      em.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
      em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
      // vec3.scale(ocean.position, ocean.position, scale);
      const scale = 100.0;
      em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);
      // em.ensureComponentOn(
      //   ocean,
      //   RotationDef,
      //   quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
      // );

      const box = em.newEntity();
      const boxM = cloneMesh(res.assets.cube.mesh);
      const sIdMax = max(boxM.surfaceIds);
      // boxM.colors = boxM.surfaceIds.map((i) => uintToVec3unorm(i, sIdMax));
      em.ensureComponentOn(box, RenderableConstructDef, boxM);
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
    }
  );

  // let line: ReturnType<typeof drawLine>;

  em.registerSystem(
    [OceanDef],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (!cs.length) return;
    },
    "hyperspaceGame"
  );
}
