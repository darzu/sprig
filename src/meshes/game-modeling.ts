import { BallMesh, CubeMesh, HexMesh } from "./mesh-list.js";
import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM } from "../ecs/ecs.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { quat, V, V3 } from "../matrix/sprig-matrix.js";
import { createGhost } from "../debug/ghost.js";
import { createLD53Ship } from "../wood/shipyard.js";
import { TextDef } from "../gui/ui.js";
import { Phase } from "../ecs/sys-phase.js";
import { init3DModeler } from "./modeler.js";
import { addWorldGizmo } from "../utils/utils-game.js";

export async function initModelingGame() {
  init3DModeler();

  EM.addSystem(
    "gameRenderPipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        // skyPipeline,
        stdMeshPipe,
        // renderGrassPipe,
        // renderOceanPipe,
        outlineRender,
        deferredPipeline,
        // skyPipeline,
        postProcess,
      ];
    }
  );

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  V3.set(-20, -20, -20, camera.maxWorldAABB.min);
  V3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  // light
  const sun = EM.mk();
  EM.set(sun, PointLightDef);
  // EM.set(sun, ColorDef, V(1, 1, 1));
  // EM.set(sun, PositionDef, V(100, 100, 0));
  // EM.set(sun, PositionDef, V(-10, 10, 10));
  EM.set(sun, PositionDef, V(100, 100, 100));
  // EM.set(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.set(sun, RenderableConstructDef, CubeMesh, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  V3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  V3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 10, 300));

  // ground
  const ground = EM.mk();
  EM.set(ground, RenderableConstructDef, HexMesh);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -10));
  EM.set(ground, ScaleDef, V(10, 10, 10));

  // avatar
  const g = createGhost(BallMesh);

  V3.copy(g.position, [30.8, -17.91, 19.92]);
  quat.copy(g.rotation, [-0.06, -0.07, 0.61, 0.78]);
  V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.176;

  // gizmo
  addWorldGizmo(V(0, 0, 0), 10);

  // objects
  const obj = EM.mk();
  const ship = createLD53Ship();
  // EM.set(obj, RenderableConstructDef, allMeshes.ship_small.proto);
  EM.set(obj, RenderableConstructDef, ship.mesh);
  EM.set(obj, PositionDef, V(0, 0, 0));
  // EM.set(obj, ColorDef, ENDESGA16.midBrown);
  // EM.set(obj, AngularVelocityDef, V(0.001, 0.00013, 0.00017));

  const txt = await EM.whenResources(TextDef);
  txt.text.lowerText = `m: toggle modeler, b: new box, shift-b: export, x/y/z: move, shift-x/y/z: scale`;
}
