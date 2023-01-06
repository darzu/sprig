import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { DeletedDef } from "../delete.js";
import { EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import {
  RenderableDef,
  RenderableConstructDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { TimeDef } from "../time.js";
import { AssetsDef, GameMesh } from "./assets.js";
// import { ENEMY_SHIP_COLOR } from "./enemy-ship.js";
// import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { GlobalCursor3dDef } from "./cursor.js";
// import { ForceDef, SpringGridDef } from "./spring.js";
import { TextDef } from "./ui.js";
import { createGhost } from "./game.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";

// TODO(@darzu): BROKEN. camera is in a wonky place?

export async function initReboundSandbox(em: EntityManager, hosting: boolean) {
  let tableId = -1;

  const res = await em.whenResources(
    AssetsDef,
    GlobalCursor3dDef,
    RendererDef,
    TextDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const g = createGhost();
  vec3.copy(g.position, [-6.5, 3.06, 22.51]);
  quat.copy(g.rotation, [0.0, -0.08, 0.0, 1.0]);
  vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = 0.145;

  const c = res.globalCursor3d.cursor()!;
  assert(RenderableDef.isOn(c));
  c.renderable.enabled = false;

  const p = em.new();
  em.set(p, RenderableConstructDef, res.assets.plane.proto);
  em.set(p, ColorDef, V(0.2, 0.3, 0.2));
  em.set(p, PositionDef, V(0, -10, 0));
  em.set(p, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.plane.aabb,
  });

  const t = em.new();
  em.set(t, RenderableConstructDef, res.assets.gridPlane.proto);
  em.set(t, ColorDef, V(0.2, 0.2, 0.9));
  em.set(t, PositionDef, V(0, 0, 0));
  em.set(t, AngularVelocityDef, V(0, 0.0002, 0.0002));
  em.set(t, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: res.assets.gridPlane.aabb,
  });
  tableId = t.id;

  res.text.lowerText = `spawner (p) stack (l) clear (backspace)`;

  const cubeDef = em.defineComponent("cube", () => true);

  function spawn(m: GameMesh, pos: vec3) {
    const e = em.new();
    em.set(e, RenderableConstructDef, m.proto);
    const [r, g, b] = [jitter(0.1) + 0.2, jitter(0.1) + 0.2, jitter(0.1) + 0.2];
    em.set(e, ColorDef, V(r, g, b));
    em.set(e, PositionDef, pos);
    em.set(e, ScaleDef, V(0.5, 0.5, 0.5));
    // em.ensureComponentOn(b, RotationDef);
    // em.ensureComponentOn(b, AngularVelocityDef, [0, 0.001, 0.001]);
    em.set(e, LinearVelocityDef, V(0, -0.02, 0));
    em.set(e, PhysicsParentDef, tableId);
    em.set(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: m.aabb,
    });
    em.set(e, cubeDef);
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
          spawn(res.assets.cube, V(x, 20, z));
        }
      }

      // stack spawn
      if (res.inputs.keyClicks["l"]) {
        const NUM = 1;
        const SPC = 2;
        for (let i = 0; i < NUM; i++)
          spawn(res.assets.cube, V(0, 10 + i * SPC, 0));
      }

      if (res.inputs.keyClicks["backspace"]) {
        const es = em.filterEntities([cubeDef]);
        for (let e of es) em.set(e, DeletedDef);
      }
    },
    "sandboxSpawnBoxes"
  );
}
