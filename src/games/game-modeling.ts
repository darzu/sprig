import { AssetsDef } from "../assets.js";
import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../console.js";
import { EM } from "../entity-manager.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { quat, V, vec3 } from "../sprig-matrix.js";
import { createGhost } from "./ghost.js";
import { createHomeShip } from "./shipyard.js";
import { TextDef } from "./ui.js";

export async function initModelingGame() {
  const { renderer } = await EM.whenResources(RendererDef);

  EM.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        // skyPipeline,
        stdRenderPipeline,
        // renderGrassPipe,
        // renderOceanPipe,
        outlineRender,
        deferredPipeline,
        // skyPipeline,
        postProcess,
      ];
    },
    "gameRenderPipelines"
  );
  EM.requireSystem("gameRenderPipelines");

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { assets } = await EM.whenResources(AssetsDef);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  // EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  // EM.ensureComponentOn(sun, PositionDef, V(-10, 10, 10));
  EM.ensureComponentOn(sun, PositionDef, V(100, 100, 100));
  EM.ensureComponentOn(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.ensureComponentOn(sun, RenderableConstructDef, assets.cube.proto);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.ensureComponentOn(sun, PositionDef, V(50, 300, 10));

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(ground, RenderableConstructDef, assets.hex.proto);
  EM.ensureComponentOn(ground, ColorDef, ENDESGA16.blue);
  EM.ensureComponentOn(ground, PositionDef, V(0, -10, 0));
  EM.ensureComponentOn(ground, ScaleDef, V(10, 10, 10));

  // avatar
  const g = createGhost();
  g.position[1] = 5;
  EM.ensureComponentOn(g, RenderableConstructDef, assets.ball.proto);
  // vec3.copy(g.position, [2.44, 6.81, 0.96]);
  // quat.copy(g.rotation, [0.0, 0.61, 0.0, 0.79]);
  // g.cameraFollow.pitchOffset = -0.553;
  vec3.copy(g.position, [-0.5, 10.7, 15.56]);
  quat.copy(g.rotation, [0.0, -0.09, 0.0, 0.99]);
  // vec3.copy(g.cameraFollow.positionOffset, [0.00,0.00,0.00]);
  // g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.32;

  // origin
  const origin = EM.new();
  EM.ensureComponentOn(origin, RenderableConstructDef, assets.ball.proto);
  EM.ensureComponentOn(origin, PositionDef, V(0, 0, 0));
  EM.ensureComponentOn(origin, ColorDef, ENDESGA16.lightGreen);

  // objects
  const obj = EM.new();
  const ship = createHomeShip();
  // EM.ensureComponentOn(obj, RenderableConstructDef, assets.ship_small.proto);
  EM.ensureComponentOn(obj, RenderableConstructDef, ship.timberMesh);
  EM.ensureComponentOn(obj, PositionDef, V(0, 0, 0));
  EM.ensureComponentOn(obj, ColorDef, ENDESGA16.midBrown);
  // EM.ensureComponentOn(obj, AngularVelocityDef, V(0.001, 0.00013, 0.00017));

  const txt = await EM.whenResources(TextDef);
  txt.text.lowerText = `m: toggle modeler, b: new box, shift-b: export, x/y/z: move, shift-x/y/z: scale`;
}
