import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EntityManager } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { createGhost } from "../game/game.js";
import { createGrassTile, GrassTileOpts, GrassTilesetOpts } from "../grass.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mat4, quat, V, vec3 } from "../sprig-matrix.js";

const DBG_PLAYER = true;

export async function initLD52(em: EntityManager, hosting: boolean) {
  const res = await em.whenResources(
    AssetsDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;

  // renderer
  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];

  // Ship
  const ship = em.new();
  em.set(ship, RenderableConstructDef, res.assets.cube.proto);
  em.set(ship, PositionDef, V(0, 0, 0));
  em.set(ship, ColorDef, ENDESGA16.darkGreen);

  // Sun
  const sunlight = em.new();
  em.set(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.4, 0.4, 0.4]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.set(sunlight, PositionDef, V(50, 100, 10));
  em.set(sunlight, RenderableConstructDef, res.assets.ball.proto);

  // ground
  const ground = em.new();
  const groundMesh = cloneMesh(res.assets.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -2, 0], [20, 2, 20])
  );
  em.set(ground, RenderableConstructDef, groundMesh);
  em.set(ground, ColorDef, ENDESGA16.midBrown);
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.set(ground, PositionDef, V(0, 0, 0));
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // grass
  {
    const setOpts: GrassTilesetOpts = {
      bladeW: 0.2,
      // bladeH: 3,
      // bladeH: 1.6,
      // bladeH: 1.5,
      bladeH: 1.8,
      // TODO(@darzu): debugging
      // spacing: 1,
      // tileSize: 4,
      spacing: 0.25,
      tileSize: 16,
      // tileSize: 10,
      tilesPerSide: 5,
    };
    const maxBladeDraw = ((setOpts.tilesPerSide - 1) / 2) * setOpts.tileSize;
    const tileOpts: GrassTileOpts = {
      ...setOpts,
      maxBladeDraw,
    };
    const grMesh = createGrassTile(tileOpts);
    const gr = em.new();
    em.set(gr, RenderableConstructDef, grMesh);
    em.set(gr, PositionDef);
  }

  if (DBG_PLAYER) {
    const g = createGhost();
    vec3.copy(g.position, [0, 1, -1.2]);
    quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
    g.cameraFollow.positionOffset = V(0, 0, 5);
    g.controllable.speed *= 0.5;
    g.controllable.sprintMul = 10;
    const sphereMesh = cloneMesh(res.assets.ball.mesh);
    const visible = false;
    em.set(g, RenderableConstructDef, sphereMesh, visible);
    em.set(g, ColorDef, V(0.1, 0.1, 0.1));
    em.set(g, PositionDef, V(0, 0, 0));
    // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
    em.set(g, WorldFrameDef);
    // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
    em.set(g, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: res.assets.ball.aabb,
    });

    vec3.copy(g.position, [-28.11, 26.0, -28.39]);
    quat.copy(g.rotation, [0.0, -0.94, 0.0, 0.34]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.593;
  }
}
