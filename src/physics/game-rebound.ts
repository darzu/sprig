import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { DeletedDef } from "../ecs/delete.js";
import { EM } from "../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { jitter } from "../utils/math.js";
import { ColliderDef } from "./collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsParentDef, PositionDef, ScaleDef } from "./transform.js";
import {
  RenderableDef,
  RenderableConstructDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { TimeDef } from "../time/time.js";
import {
  AllMeshesDef,
  BallMesh,
  CubeMesh,
  GizmoMesh,
  HexMesh,
  PlaneMesh,
} from "../meshes/mesh-list.js";
import { GameMesh } from "../meshes/mesh-loader.js";
// import { ENEMY_SHIP_COLOR } from "./enemy-ship.js";
// import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
// import { ForceDef, SpringGridDef } from "./spring.js";
import { TextDef } from "../gui/ui.js";
import { createGhost } from "../debug/ghost.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { PointLightDef } from "../render/lights.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";

// TODO(@darzu): BROKEN. camera is in a wonky place?

export async function initReboundSandbox(hosting: boolean) {
  let tableId = -1;

  const res = await EM.whenResources(
    AllMeshesDef,
    // GlobalCursor3dDef,
    RendererDef,
    TextDef,
    CameraDef
  );

  const camera = res.camera;
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    deferredPipeline,
    postProcess,
  ];

  // sun
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, RenderableConstructDef, res.allMeshes.cube.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  V3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  V3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 300, 10));

  // world gizmo
  addWorldGizmo(V(0, 0, 0), 5);

  const g = createGhost(BallMesh);
  g.controllable.speed *= 0.5;
  g.controllable.sprintMul = 10;

  V3.copy(g.position, [-11.71, -22.45, 11.25]);
  quat.copy(g.rotation, [0.0, 0.0, 0.25, -0.97]);
  V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.396;

  // const c = res.globalCursor3d.cursor()!;
  // assert(RenderableDef.isOn(c));
  // c.renderable.enabled = false;

  const ground = EM.new();
  EM.set(ground, RenderableConstructDef, HexMesh);
  EM.set(ground, ColorDef, V(0.2, 0.3, 0.2));
  EM.set(ground, ScaleDef, V(10, 10, 1));
  EM.set(ground, PositionDef, V(0, 0, -1));
  EM.set(ground, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.hex.aabb,
  });

  // return;

  const table = EM.new();
  // EM.set(t, RenderableConstructDef, res.allMeshes.gridPlane.proto);
  EM.set(table, RenderableConstructDef, PlaneMesh);
  EM.set(table, ColorDef, V(0.2, 0.2, 0.9));
  EM.set(table, PositionDef, V(0, 0, 10));
  EM.set(table, AngularVelocityDef, V(0, 0.0002, 0.0002));
  EM.set(table, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: res.allMeshes.gridPlane.aabb,
  });
  tableId = table.id;
  addGizmoChild(table, 5);

  res.text.lowerText = `spawner (p) stack (l) clear (backspace)`;

  const cubeDef = EM.defineComponent("cube", () => true);

  function spawn(m: GameMesh, pos: V3) {
    const e = EM.new();
    EM.set(e, RenderableConstructDef, m.proto);
    const [r, g, b] = [jitter(0.1) + 0.2, jitter(0.1) + 0.2, jitter(0.1) + 0.2];
    EM.set(e, ColorDef, V(r, g, b));
    EM.set(e, PositionDef, pos);
    EM.set(e, ScaleDef, V(0.5, 0.5, 0.5));
    // EM.set(b, RotationDef);
    // EM.set(b, AngularVelocityDef, [0, 0.001, 0.001]);
    EM.set(e, LinearVelocityDef, V(0, 0, -0.02));
    EM.set(e, PhysicsParentDef, tableId);
    EM.set(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: m.aabb,
    });
    EM.set(e, cubeDef);
  }

  let nextSpawnAccu = 0;
  let paused = true;
  EM.addSystem(
    "sandboxSpawnBoxes",
    Phase.GAME_WORLD,
    null,
    [AllMeshesDef, TimeDef, InputsDef],
    (_, res) => {
      // pause/unpause
      if (res.inputs.keyClicks["p"]) paused = !paused;

      // spawner
      if (!paused) {
        nextSpawnAccu += res.time.dt;
        if (nextSpawnAccu > 100) {
          nextSpawnAccu = 0;

          const x = jitter(5);
          const y = jitter(5);
          spawn(res.allMeshes.cube, V(x, y, 20));
        }
      }

      // stack spawn
      if (res.inputs.keyClicks["l"]) {
        const NUM = 1;
        const SPC = 2;
        for (let i = 0; i < NUM; i++)
          spawn(res.allMeshes.cube, V(0, 0, 10 + i * SPC));
      }

      if (res.inputs.keyClicks["backspace"]) {
        const es = EM.filterEntities([cubeDef]);
        for (let e of es) EM.set(e, DeletedDef);
      }
    }
  );
}
