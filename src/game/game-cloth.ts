import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { InputsDef } from "../inputs.js";
import { mathMapNEase } from "../math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import {
  CyRenderPipelinePtr,
  CyCompPipelinePtr,
} from "../render/gpu-registry.js";
import { cloneMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  boidRender,
  boidComp0,
  boidComp1,
} from "../render/pipelines/xp-boids-pipeline.js";
import {
  cmpClothPipelinePtr0,
  cmpClothPipelinePtr1,
} from "../render/pipelines/xp-cloth-pipeline.js";
import { compRopePipelinePtr } from "../render/pipelines/xp-ropestick-pipeline.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempVec3 } from "../temp-pool.js";
import { EASE_INQUAD } from "../util-ease.js";
import { assert } from "../util.js";
import { drawLine } from "../utils-game.js";
import { AssetsDef } from "./assets.js";
import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { ENEMY_SHIP_COLOR } from "./enemy-ship.js";
import { createGhost } from "./game.js";
import { ForceDef } from "./spring.js";
import { TextDef } from "./ui.js";

// TODO(@darzu): BROKEN. cloth sandbox isn't lit right and cloth isn't there

export async function initClothSandbox(em: EntityManager, hosting: boolean) {
  const res = await em.whenResources(
    AssetsDef,
    GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );
  const camera = res.camera;
  camera.fov = Math.PI * 0.5;
  let renderPipelinesPtrs: CyRenderPipelinePtr[] = [
    // TODO(@darzu):
    ...shadowPipelines,
    stdRenderPipeline,
    // renderRopePipelineDesc,
    boidRender,
    // boidCanvasMerge,
    // shadowDbgDisplay,
    // normalDbg,
    // positionDbg,
    outlineRender,
    postProcess,
  ];
  let computePipelinesPtrs: CyCompPipelinePtr[] = [
    cmpClothPipelinePtr0,
    cmpClothPipelinePtr1,
    compRopePipelinePtr,
    boidComp0,
    boidComp1,
  ];
  res.renderer.pipelines = [...computePipelinesPtrs, ...renderPipelinesPtrs];

  const g = createGhost();
  vec3.copy(g.position, [0, 1, -1.2]);
  quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
  g.controllable.sprintMul = 3;

  // TODO(@darzu): this shouldn't be necessary
  const m2 = cloneMesh(res.assets.cube.mesh);
  em.set(g, RenderableConstructDef, m2);

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
  em.set(plane, RenderableConstructDef, res.assets.plane.proto);
  em.set(plane, ColorDef, V(0.2, 0.3, 0.2));
  em.set(plane, PositionDef, V(0, -5, 0));

  const ship = em.newEntity();
  em.set(ship, RenderableConstructDef, res.assets.ship.proto);
  em.set(ship, ColorDef, ENEMY_SHIP_COLOR);
  em.set(ship, PositionDef, V(20, -2, 0));
  em.set(ship, RotationDef, quat.fromEuler(0, Math.PI * 0.1, 0, quat.create()));

  // const ocean = em.newEntity();
  // em.ensureComponentOn(
  //   ocean,
  //   EM.defineComponent("ocean", () => true)
  // );
  // em.ensureComponentOn(
  //   ocean,
  //   RenderableConstructDef,
  //   res.assets.ocean.proto
  // );
  // em.ensureComponentOn(ocean, ColorDef, [0.0, 0.0, 0.4]);
  // em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
  // // vec3.scale(ocean.position, ocean.position, scale);
  // const scale = 100.0;
  // em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);
  // em.ensureComponentOn(
  //   ocean,
  //   RotationDef,
  //   quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
  // );

  const box = em.newEntity();
  em.set(box, RenderableConstructDef, res.assets.cube.proto);
  em.set(box, ColorDef, V(0.1, 0.1, 0.1));
  em.set(box, PositionDef, V(0, 0, 3));
  em.set(box, RotationDef);
  em.set(box, AngularVelocityDef, V(0, 0.001, 0.001));
  em.set(box, WorldFrameDef);
  em.set(box, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.cube.aabb,
  });

  const cloth = em.newEntity();
  em.set(cloth, ClothConstructDef, {
    location: V(0, 0, 0),
    color: V(0.9, 0.9, 0.8),
    rows: 5,
    columns: 5,
    distance: 2,
  });
  const F = 100.0;
  em.set(cloth, ForceDef, V(F, F, F));

  const line = await drawLine(vec3.create(), vec3.create(), V(0, 1, 0));

  em.registerSystem(
    [ClothConstructDef, ClothLocalDef, WorldFrameDef, ForceDef],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (!cs.length) return;
      const cloth = cs[0];

      // cursor to cloth
      const cursorPos = res.globalCursor3d.cursor()!.world.position;
      const midpoint = vec3.scale(
        [cloth.clothConstruct.columns / 2, cloth.clothConstruct.rows / 2, 0],
        cloth.clothConstruct.distance
      );
      const clothPos = vec3.add(midpoint, cloth.world.position, midpoint);

      // line from cursor to cloth
      line.renderable.enabled = true;
      const m = line.renderable.meshHandle.mesh!;
      vec3.copy(m.pos[0], cursorPos);
      vec3.copy(m.pos[1], clothPos);
      res.renderer.renderer.stdPool.updateMeshVertices(
        line.renderable.meshHandle,
        m
      );

      // scale the force
      const delta = vec3.sub(clothPos, cursorPos);
      const dist = vec3.length(delta);
      vec3.normalize(delta, cloth.force);
      const strength = mathMapNEase(dist, 4, 20, 0, 500, (p) =>
        EASE_INQUAD(1.0 - p)
      );
      res.text.upperText = `${strength.toFixed(2)}`;

      // apply the force?
      if (res.inputs.keyDowns["e"]) {
        vec3.scale(cloth.force, strength, cloth.force);
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
