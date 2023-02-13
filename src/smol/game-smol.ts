import {
  CameraDef,
  CameraFollowDef,
  setCameraFollowPosition,
} from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { AssetsDef, gameMeshFromMesh } from "../assets.js";
import { ControllableDef } from "../games/controllable.js";
import { createGhost, GhostDef } from "../games/ghost.js";
import { LocalPlayerDef, PlayerDef } from "../games/player.js";
import {
  createGrassTile,
  createGrassTileset,
  GrassTileOpts,
  GrassTilesetOpts,
} from "../grass.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, mapMeshPositions, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mat3, mat4, quat, V, vec3, vec4 } from "../sprig-matrix.js";
import { createMast, createSail, MastDef, SAIL_FURL_RATE } from "./sail.js";
import {
  quatFromUpForward,
  randNormalPosVec3,
  randNormalVec3,
  vec3Dbg,
} from "../utils-3d.js";
import { randColor } from "../utils-game.js";
import { GrassCutTexPtr, grassPoolPtr, renderGrassPipe } from "./std-grass.js";
import { WindDef } from "./wind.js";
import { DevConsoleDef } from "../console.js";
import { clamp, jitter, max, sum } from "../math.js";
import { createShip, ShipDef } from "./ship.js";
import { CY } from "../render/gpu-registry.js";
import { assert } from "../util.js";
import { texTypeToBytes } from "../render/gpu-struct.js";
import { PartyDef } from "../games/party.js";
import { GrassMapDef, GrassMapTexPtr, setMap } from "./grass-map.js";
import { getAABBCornersTemp } from "../physics/broadphase.js";
import { rasterizeTri } from "../raster.js";
import { InputsDef } from "../inputs.js";
import { ScoreDef } from "./score.js";
import { raiseManTurret } from "../games/turret.js";
import { TextDef } from "../games/ui.js";
import { VERBOSE_LOG } from "../flags.js";
import { CanvasDef } from "../canvas.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { initOcean, OceanDef } from "../games/hyperspace/ocean.js";
import { renderOceanPipe } from "../render/pipelines/std-ocean.js";
import { SKY_MASK } from "../render/pipeline-masks.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import { createFlatQuadMesh, makeDome } from "../primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";

/*
NOTES:
- Cut grass by updating a texture that has cut/not cut or maybe cut-height

TODO:
Shading and appearance
[ ] fix shadow mapping
[ ] shading from skybox
[ ] cooler and warmer shading from "sun" and skybox
[ ] bring back some gradient on terrain
PERF:
[ ] reduce triangles on terrain
[ ] reduce triangles on ocean
*/

const DBG_PLAYER = true;

// world map is centered around 0,0
const WORLD_WIDTH = 1024; // width runs +z
const WORLD_HEIGHT = 512; // height runs +x

const RED_DAMAGE_CUTTING = 10;
const RED_DAMAGE_PER_FRAME = 40;
const GREEN_HEALING = 1;

const SHIP_START_POS: vec3 = V(0, 2, -WORLD_WIDTH * 0.5 * 0.8);

// const WORLD_HEIGHT = 1024;

export const mapJfa = createJfaPipelines(GrassMapTexPtr, "exterior");

export async function initSmol(em: EntityManager, hosting: boolean) {
  const dbgGrid = [
    //
    [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
    //
    // [mapJfa.voronoiTex, mapJfa.sdfTex],
    [shadowDepthTextures[0], shadowDepthTextures[0]],
  ];
  let dbgGridCompose = createGridComposePipelines(dbgGrid);

  const res = await em.whenResources(
    AssetsDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;

  // console.dir(mapJfa);
  // console.dir(dbgGridCompose);

  em.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        // skyPipeline,
        stdRenderPipeline,
        // renderGrassPipe,
        renderOceanPipe,
        outlineRender,
        deferredPipeline,
        skyPipeline,
        postProcess,
        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    },
    "smolGameRenderPipelines"
  );
  em.requireSystem("smolGameRenderPipelines");

  // Sun
  const sunlight = em.new();
  em.ensureComponentOn(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.linear = 0.0;
  sunlight.pointLight.quadratic = 0.0;
  vec3.copy(sunlight.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.ensureComponentOn(sunlight, PositionDef, V(50, 300, 10));
  em.ensureComponentOn(sunlight, RenderableConstructDef, res.assets.ball.proto);

  // score
  const score = em.addResource(ScoreDef);
  em.requireSystem("updateScoreDisplay");
  em.requireSystem("detectGameEnd");

  // start map
  await setMap(em, "obstacles1");

  // once the map is loaded, we can run JFA
  res.renderer.renderer.submitPipelines([], [...mapJfa.allPipes()]);

  // TODO(@darzu): simplify this pattern
  const terraTex = await res.renderer.renderer.readTexture(mapJfa.sdfTex);
  const terraReader = createTextureReader(
    terraTex,
    mapJfa.sdfTex.size,
    1,
    mapJfa.sdfTex.format
  );
  function sampleTerra(worldX: number, worldZ: number) {
    let xi = ((worldZ + WORLD_WIDTH * 0.5) / WORLD_WIDTH) * terraReader.size[0];
    let yi =
      ((worldX + WORLD_HEIGHT * 0.5) / WORLD_HEIGHT) * terraReader.size[1];
    // xi = clamp(xi, 0, terraReader.size[0]);
    // yi = clamp(yi, 0, terraReader.size[1]);
    const height = terraReader.sample(xi, yi) / 256;
    // console.log(`xi: ${xi}, yi: ${yi} => ${height}`);
    return height;
  }

  // height map
  const terraVertsPerWorldUnit = 0.25;
  const worldUnitPerTerraVerts = 1 / terraVertsPerWorldUnit;
  const terraZCount = Math.floor(WORLD_WIDTH * terraVertsPerWorldUnit);
  const terraXCount = Math.floor(WORLD_HEIGHT * terraVertsPerWorldUnit);
  const terraMesh = createFlatQuadMesh(terraZCount, terraXCount);
  // let minY = Infinity;
  terraMesh.pos.forEach((p, i) => {
    // console.log("i: " + vec3Dbg(p));
    const x = p[0] * worldUnitPerTerraVerts - WORLD_HEIGHT * 0.5;
    const z = p[2] * worldUnitPerTerraVerts - WORLD_WIDTH * 0.5;
    let y = sampleTerra(x, z) * 100.0;
    // minY = Math.min(minY, y);

    // TODO(@darzu): wierd hack for shorline:
    if (y <= 1.0) y = -30;

    y += Math.random() * 2.0; // TODO(@darzu): jitter for less uniform look?

    p[0] = x;
    p[1] = y;
    p[2] = z;
    // console.log("o: " + vec3Dbg(p));
    // if (i > 10) throw "stop";
  });
  // console.log(`heightmap minY: ${minY}`);
  const hm = em.new();
  em.ensureComponentOn(hm, RenderableConstructDef, terraMesh);
  em.ensureComponentOn(hm, PositionDef);
  // TODO(@darzu): maybe do a sable-like gradient accross the terrain, based on view dist or just uv?
  // em.ensureComponentOn(hm, ColorDef, V(0.4, 0.2, 0.2));
  em.ensureComponentOn(hm, ColorDef, ENDESGA16.lightGray);
  // TODO(@darzu): update terra from SDF

  // // reference columns
  // for (let i = 0; i < 50; i++) {
  //   const refCol = em.new();
  //   em.ensureComponentOn(
  //     refCol,
  //     RenderableConstructDef,
  //     res.assets.unitCube.proto
  //   );
  //   em.ensureComponentOn(refCol, ScaleDef, V(1, 100, 1));
  //   em.ensureComponentOn(refCol, PositionDef);
  //   vec3.copy(refCol.position, SHIP_START_POS);
  //   refCol.position[1] = -50;
  //   refCol.position[2] += i * 2 + 30;
  //   em.ensureComponentOn(refCol, ColorDef, V(0.1, 1, 0.1));
  // }
  // if (!"true")
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 8; i++) {
      const color = Object.values(ENDESGA16)[i + r * 8];
      const bigCube = em.new();
      const i2 = Math.floor(i / 2) * 2.0;
      const even = i % 2 === 0 ? 1 : 0;
      em.ensureComponentOn(
        bigCube,
        RenderableConstructDef,
        even ? res.assets.ball.proto : res.assets.cube.proto
      );
      em.ensureComponentOn(bigCube, ScaleDef, V(50, 50, 50));
      em.ensureComponentOn(
        bigCube,
        RotationDef,
        quat.fromEuler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          quat.create()
        )
      );
      em.ensureComponentOn(
        bigCube,
        AngularVelocityDef,
        vec3.scale(randNormalVec3(vec3.tmp()), 0.0005, vec3.create())
      );
      em.ensureComponentOn(
        bigCube,
        PositionDef,
        V(
          // i2 * 30 + even * 100 - 100 - r * 50,
          jitter(WORLD_HEIGHT * 0.5),
          r * 100,
          // i2 * 30 - even * 100 - 100 + r * 50
          jitter(WORLD_WIDTH * 0.5)
        )
      );
      // em.ensureComponentOn(bigCube, ColorDef, randColor());
      em.ensureComponentOn(bigCube, ColorDef, color);
    }

  // skybox?

  // sky dome?
  const SKY_HALFSIZE = 1000;
  const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
  const sky = EM.new();
  em.ensureComponentOn(sky, PositionDef, V(0, -100, 0));
  // const skyMesh = cloneMesh(res.assets.cube.mesh);
  // skyMesh.pos.forEach((p) => vec3.scale(p, SKY_HALFSIZE, p));
  // skyMesh.quad.forEach((f) => vec4.reverse(f, f));
  // skyMesh.tri.forEach((f) => vec3.reverse(f, f));
  const skyMesh = domeMesh;
  em.ensureComponentOn(
    sky,
    RenderableConstructDef,
    skyMesh,
    undefined,
    undefined,
    SKY_MASK
  );
  // em.ensureComponentOn(sky, ColorDef, V(0.9, 0.9, 0.9));

  // ocean
  const oceanVertsPerWorldUnit = 0.25;
  const worldUnitPerOceanVerts = 1 / oceanVertsPerWorldUnit;
  const oceanZCount = Math.floor(WORLD_WIDTH * oceanVertsPerWorldUnit);
  const oceanXCount = Math.floor(WORLD_HEIGHT * oceanVertsPerWorldUnit);
  const oceanMesh = createFlatQuadMesh(oceanZCount, oceanXCount);
  const maxSurfId = max(oceanMesh.surfaceIds);
  console.log("maxSurfId");
  console.log(maxSurfId);
  oceanMesh.pos.forEach((p, i) => {
    const x = p[0] * worldUnitPerOceanVerts - WORLD_HEIGHT * 0.5;
    const z = p[2] * worldUnitPerOceanVerts - WORLD_WIDTH * 0.5;
    const y = 0.0;
    p[0] = x;
    p[1] = y;
    p[2] = z;
  });
  // TODO(@darzu): I don't think the PBR-ness of this color is right
  // initOcean(oceanMesh, V(0.1, 0.3, 0.8));
  initOcean(oceanMesh, ENDESGA16.blue);
  const { ocean } = await em.whenResources(OceanDef);

  // ground
  // const ground = em.new();
  // const groundMesh = cloneMesh(res.assets.unitCube.mesh);
  // transformMesh(
  //   groundMesh,
  //   mat4.fromScaling(V(WORLD_HEIGHT, 1.0, WORLD_WIDTH))
  // );
  // em.ensureComponentOn(ground, RenderableConstructDef, groundMesh);
  // em.ensureComponentOn(ground, ColorDef, V(0.1, 0.5, 0.1));
  // // em.set(ground, ColorDef, ENDESGA16.darkGreen);
  // // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  // em.ensureComponentOn(
  //   ground,
  //   PositionDef,
  //   V(-WORLD_HEIGHT * 0.5, -1.1, -WORLD_WIDTH * 0.5)
  // );
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // grass
  const lod1: GrassTilesetOpts = {
    bladeW: 0.2,
    // bladeH: 3,
    // bladeH: 1.6,
    // bladeH: 2.6,
    // bladeH: 3.2,
    // bladeH: 1.5,
    // bladeH: 1.8,
    bladeH: 4.2,
    // bladeH: 1.8,
    // TODO(@darzu): debugging
    // spacing: 1,
    // tileSize: 4,
    // spacing: 0.5,
    spacing: 0.5,
    // spacing: 0.3,
    tileSize: 16,
    // tileSize: 10,
    tilesPerSide: 5,
  };
  const lod2: GrassTilesetOpts = {
    ...lod1,
    bladeH: lod1.bladeH * 1.4,
    spacing: lod1.spacing * 2,
    tileSize: lod1.tileSize * 2,
  };
  const lod3: GrassTilesetOpts = {
    ...lod1,
    bladeH: lod1.bladeH * 1.6,
    spacing: lod1.spacing * 4,
    tileSize: lod1.tileSize * 4,
  };
  const lod4: GrassTilesetOpts = {
    ...lod1,
    tilesPerSide: 8,
    bladeH: lod1.bladeH * 1.8,
    spacing: lod1.spacing * 8,
    tileSize: lod1.tileSize * 8,
  };
  const lod5: GrassTilesetOpts = {
    ...lod1,
    tilesPerSide: 8,
    bladeW: lod1.bladeW * 2,
    bladeH: lod1.bladeH * 2,
    spacing: lod1.spacing * 32,
    tileSize: lod1.tileSize * 32,
  };
  const maxBladeDraw = ((lod1.tilesPerSide - 1) / 2) * lod1.tileSize;
  const tileOpts: GrassTileOpts = {
    ...lod1,
    maxBladeDraw,
  };
  const grMesh = createGrassTile(tileOpts);
  const gr = em.new();
  em.ensureComponentOn(
    gr,
    RenderableConstructDef,
    grMesh,
    undefined,
    // false,
    undefined,
    undefined,
    grassPoolPtr
    // true
  );
  em.ensureComponentOn(gr, ColorDef, randColor());
  em.ensureComponentOn(gr, PositionDef);

  // set
  const ts = await Promise.all([
    createGrassTileset(lod1),
    createGrassTileset(lod2),
    createGrassTileset(lod3),
    createGrassTileset(lod4),
    createGrassTileset(lod5),
  ]);

  console.log(`num grass tris: ${sum(ts.map((t) => t.numTris))}`);

  em.addResource(WindDef);
  em.requireSystem("changeWind");
  em.requireSystem("smoothWind");

  const ship = await createShip(em);
  // move down
  // ship.position[2] = -WORLD_SIZE * 0.5 * 0.6;
  vec3.copy(ship.position, SHIP_START_POS);
  em.requireSystem("sailShip");
  em.requireSystem("shipParty");

  // dbg ghost

  // player
  if (!DBG_PLAYER) {
    const player = await createPlayer();
    player.physicsParent.id = ship.id;
    // vec3.set(0, 3, -1, player.position);
    const rudder = ship.ld52ship.rudder()!;
    vec3.copy(player.position, rudder.position);
    player.position[1] = 1.45;
    assert(CameraFollowDef.isOn(rudder));
    raiseManTurret(player, rudder);
  }

  if (DBG_PLAYER) {
    const g = createGhost();
    // vec3.copy(g.position, [0, 1, -1.2]);
    // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
    // g.cameraFollow.positionOffset = V(0, 0, 5);
    g.controllable.speed *= 2.0;
    g.controllable.sprintMul = 15;
    const sphereMesh = cloneMesh(res.assets.ball.mesh);
    const visible = false;
    em.ensureComponentOn(g, RenderableConstructDef, sphereMesh, visible);
    em.ensureComponentOn(g, ColorDef, V(0.1, 0.1, 0.1));
    // em.ensureComponentOn(g, PositionDef, V(0, 0, 0));
    // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
    em.ensureComponentOn(g, WorldFrameDef);
    // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
    em.ensureComponentOn(g, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: res.assets.ball.aabb,
    });

    // vec3.copy(g.position, [-28.11, 26.0, -28.39]);
    // quat.copy(g.rotation, [0.0, -0.94, 0.0, 0.34]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.593;

    // vec3.copy(g.position, [-34.72, 50.31, -437.72]);
    // quat.copy(g.rotation, [0.0, -0.99, 0.0, 0.16]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.452;

    // vec3.copy(g.position, [-310.03, 26.0, -389.47]);
    // quat.copy(g.rotation, [0.0, -0.71, 0.0, 0.71]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.287;

    // vec3.copy(g.position, [129.81, 192.0, -183.24]);
    // quat.copy(g.rotation, [0.0, -1.0, 0.0, -0.06]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.624;

    // vec3.copy(g.position, [1.12, 54.25, -42.04]);
    // quat.copy(g.rotation, [0.0, -1.0, 0.0, 0.03]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = 0.656;

    vec3.copy(g.position, [-12.87, 22.0, -442.46]);
    quat.copy(g.rotation, [0.0, -1.0, 0.0, -0.1]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.391;

    em.registerSystem(
      [GhostDef, WorldFrameDef, ColliderDef],
      [InputsDef, CanvasDef],
      async (ps, { inputs, htmlCanvas }) => {
        if (!ps.length) return;

        const ghost = ps[0];

        if (!htmlCanvas.hasFirstInteraction) return;
      },
      "smolGhost"
    );
    EM.requireGameplaySystem("smolGhost");
  }

  // update grass
  EM.registerSystem(
    [CameraFollowDef, WorldFrameDef],
    [],
    (es, res) => {
      const player = es[0];
      // console.log(player.world.position);
      // const player = EM.findEntity(res.localPlayer.playerId, [WorldFrameDef]);
      if (player) for (let t of ts) t.update(player.world.position);
    },
    "updateGrass"
  );
  EM.requireSystem("updateGrass");

  const { renderer } = await EM.whenResources(RendererDef);
  const grassCutTex = renderer.renderer.getCyResource(GrassCutTexPtr)!;
  assert(grassCutTex);
  const bytesPerVal = texTypeToBytes[GrassCutTexPtr.format]!;
  // grass cutting
  // cutGrassAt(100, 100, 100, 100);
  let f32BySize = new Map<number, Float32Array>();
  function getArrayForBox(w: number, h: number): Float32Array {
    let size = w * h * bytesPerVal;
    // TODO(@darzu): PERF. Cache these!
    let data = f32BySize.get(size);
    if (!data) {
      data = new Float32Array(size);
      f32BySize.set(size, data);
      if (VERBOSE_LOG)
        console.log(
          `tmp f32s using: ${(
            sum(
              [...f32BySize.values()].map(
                (v) => v.length * Float32Array.BYTES_PER_ELEMENT
              )
            ) / 1024
          ).toFixed(0)} kb`
        );
    }
    data.fill(0);
    return data;
  }

  // debug stuff
  const { dev } = await EM.whenResources(DevConsoleDef);
  // dev.showConsole = true;
  // player.controllable.modes.canFly = true;

  EM.registerSystem(
    [],
    [InputsDef],
    (_, res) => {
      // TODO(@darzu):
      if (res.inputs.keyClicks[" "]) {
        ship.ld52ship.cuttingEnabled = !ship.ld52ship.cuttingEnabled;
      }
    },
    "cuttingOnOff"
  );
  EM.requireSystem("cuttingOnOff");

  // TODO(@darzu): PERF. bad mem usage everywhere..
  let worldCutData = new Float32Array(
    grassCutTex.size[0] * grassCutTex.size[1]
  );
  assert(
    WORLD_WIDTH === grassCutTex.size[0] && WORLD_HEIGHT === grassCutTex.size[1]
  );

  const worldXToTexY = (x: number) => Math.floor(x + WORLD_HEIGHT / 2);
  const worldZToTexX = (z: number) => Math.floor(z + WORLD_WIDTH / 2);
  const texXToWorldZ = (x: number) => x - WORLD_WIDTH / 2 + 0.5;
  const texYToWorldX = (y: number) => y - WORLD_HEIGHT / 2 + 0.5;

  score.onLevelEnd.push(() => {
    worldCutData.fill(0.0);
    grassCutTex.queueUpdate(worldCutData);
    // vec3.set(0, 0, 0, ship.position);
    vec3.copy(ship.position, SHIP_START_POS);
    quat.identity(ship.rotation);
    vec3.set(0, 0, 0, ship.linearVelocity);
    const sail = ship.ld52ship.mast()!.mast.sail()!.sail;
    sail.unfurledAmount = sail.minFurl;
    ship.ld52ship.cuttingEnabled = true;
    ship.ld52ship.rudder()!.yawpitch.yaw = 0;
  });

  EM.registerSystem(
    [ShipDef, PositionDef, WorldFrameDef, PhysicsStateDef],
    [PartyDef, GrassMapDef, ScoreDef],
    (es, res) => {
      if (!es.length) return;
      const ship = es[0];

      // if (!ship.ld52ship.cuttingEnabled) return;

      assert(ship._phys.colliders.length >= 1);
      const worldAABB = ship._phys.colliders[0].aabb;
      const selfAABB = ship._phys.colliders[0].selfAABB;

      // window texture
      const winYi = worldXToTexY(worldAABB.min[0]);
      const winXi = worldZToTexX(worldAABB.min[2]);
      // NOTE: width is based on world Z and tex X
      //       height is based on world X and tex Y
      const winWi = Math.ceil(worldAABB.max[2] - worldAABB.min[2]);
      const winHi = Math.ceil(worldAABB.max[0] - worldAABB.min[0]);

      if (
        winXi < 0 ||
        grassCutTex.size[0] <= winXi + winWi ||
        winYi < 0 ||
        grassCutTex.size[1] <= winYi + winHi
      ) {
        res.score.shipHealth -= 320;
        return;
      }

      const shipW = selfAABB.max[2] - selfAABB.min[2];
      const shipH = selfAABB.max[0] - selfAABB.min[0];
      let healthChanges = 0;
      let cutPurple = 0;

      let redHurt = false;

      // update world texture data
      // TODO(@darzu): PERF! track min/max window that is actually updated and send
      //    smaller than window updates to GPU!
      let minWinXi = Infinity;
      let maxWinXi = -Infinity;
      let minWinYi = Infinity;
      let maxWinYi = -Infinity;
      for (let xi = winXi; xi < winXi + winWi; xi++) {
        for (let yi = winYi; yi < winYi + winHi; yi++) {
          const z = texXToWorldZ(xi);
          const x = texYToWorldX(yi);

          // NOTE: PERF! we inlined all the dot products and cross products here for a
          //  perf win.
          // TODO(@darzu): make it easier to do this inlining automatically?
          // let toParty = vec3.sub(V(x, 0, z), res.party.pos);
          // let zDist = vec3.dot(toParty, res.party.dir);
          // let partyX = vec3.cross(res.party.dir, V(0, 1, 0));
          // let xDist = vec3.dot(toParty, partyX);
          const toPartyX = x - res.party.pos[0];
          const toPartyZ = z - res.party.pos[2];
          const dirX = res.party.dir[0];
          const dirZ = res.party.dir[2];
          const zDist = toPartyX * dirX + toPartyZ * dirZ;
          const xDist = toPartyX * -dirZ + toPartyZ * dirX;

          if (Math.abs(zDist) < shipW * 0.5 && Math.abs(xDist) < shipH * 0.5) {
            const idx = xi + yi * WORLD_WIDTH;

            const color = res.grassMap.map[idx];

            if (ship.ld52ship.cuttingEnabled) {
              if (worldCutData[idx] < 1) {
                // we are cutting this grass for the first time
                if (color < 0.1) {
                  // green
                  // console.log("GREEN_HEALING");
                  healthChanges += GREEN_HEALING;
                } else if (color < 0.6) {
                  // red
                  // console.log("RED_DAMAGE_CUTTING");
                  healthChanges -= RED_DAMAGE_CUTTING;
                  redHurt = true;
                } else {
                  // purple
                  cutPurple += 1;
                }
                minWinXi = Math.min(minWinXi, xi);
                maxWinXi = Math.max(maxWinXi, xi);
                minWinYi = Math.min(minWinYi, yi);
                maxWinYi = Math.max(maxWinYi, yi);
                worldCutData[idx] = 1;
              }
            } else {
              if (0.1 < color && color < 0.6) {
                // red
                // console.log("RED_DAMAGE_NOT_CUTTING");
                redHurt = true;
              }
            }
          }
        }
      }

      if (redHurt) {
        healthChanges -= RED_DAMAGE_PER_FRAME;
      }

      // console.log(healthChanges);

      res.score.shipHealth = Math.min(
        res.score.shipHealth + healthChanges,
        10000
      );
      res.score.cutPurple += cutPurple;

      // copy from world texture data to update window
      // NOTE: we shrink the window to only include what has changed
      const hasUpdate = minWinXi <= maxWinXi && minWinYi <= maxWinYi;
      // console.log(`hasUpdate: ${hasUpdate}`);
      if (hasUpdate) {
        const innerWinW = maxWinXi - minWinXi + 1;
        const innerWinH = maxWinYi - minWinYi + 1;
        const windowData = getArrayForBox(innerWinW, innerWinH);
        for (let xi = minWinXi; xi <= maxWinXi; xi++) {
          for (let yi = minWinYi; yi <= maxWinYi; yi++) {
            const worldIdx = xi + yi * WORLD_WIDTH;
            const val = worldCutData[worldIdx];
            const winIdx = xi - minWinXi + (yi - minWinYi) * innerWinW;
            windowData[winIdx] = val;
          }
        }
        grassCutTex.queueUpdate(
          windowData,
          minWinXi,
          minWinYi,
          innerWinW,
          innerWinH
        );
      }
      // console.dir(data);

      // rasterizeTri
    },
    "cutGrassUnderShip"
  );
  EM.requireSystem("cutGrassUnderShip");
  EM.addConstraint(["detectGameEnd", "after", "cutGrassUnderShip"]);

  EM.registerSystem(
    [],
    [InputsDef],
    (_, res) => {
      const mast = ship.ld52ship.mast()!;
      const rudder = ship.ld52ship.rudder()!;

      // furl/unfurl
      if (rudder.turret.mannedId) {
        const sail = mast.mast.sail()!.sail;
        if (res.inputs.keyDowns["w"]) sail.unfurledAmount += SAIL_FURL_RATE;
        if (res.inputs.keyDowns["s"]) sail.unfurledAmount -= SAIL_FURL_RATE;
        sail.unfurledAmount = clamp(sail.unfurledAmount, sail.minFurl, 1.0);
      }
    },
    "furlUnfurl"
  );
  EM.requireSystem("furlUnfurl");

  const shipWorld = await EM.whenEntityHas(ship, WorldFrameDef);

  EM.registerSystem(
    [],
    [InputsDef, WindDef],
    (_, res) => {
      const mast = ship.ld52ship.mast()!;
      // const rudder = ship.ld52ship.rudder()!;

      // const shipDir = vec3.transformQuat(V(0, 0, 1), shipWorld.world.rotation);

      const invShip = mat3.invert(mat3.fromMat4(shipWorld.world.transform));
      const windLocalDir = vec3.transformMat3(res.wind.dir, invShip);
      const shipLocalDir = V(0, 0, 1);

      const optimalSailLocalDir = vec3.normalize(
        vec3.add(windLocalDir, shipLocalDir)
      );

      // console.log(`ship to wind: ${vec3.dot(windLocalDir, shipLocalDir)}`);

      // const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
      // e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
      // sail.force * vec3.dot(AHEAD_DIR, normal);

      // const currSailForce =

      // need to maximize: dot(wind, sail) * dot(sail, ship)

      // TODO(@darzu): ANIMATE SAIL TOWARD WIND
      if (vec3.dot(optimalSailLocalDir, shipLocalDir) > 0.01)
        quatFromUpForward(mast.rotation, V(0, 1, 0), optimalSailLocalDir);
    },
    "turnMast"
  );
  EM.requireSystem("turnMast");

  const { text } = await EM.whenResources(TextDef);
  text.lowerText =
    "W/S: unfurl/furl, A/D: turn, SPACE: harvest on/off, E: use/unuse rudder";
}

async function createPlayer() {
  const { assets, me } = await EM.whenResources(AssetsDef, MeDef);
  const p = EM.new();
  EM.ensureComponentOn(p, ControllableDef);
  p.controllable.modes.canFall = false;
  p.controllable.modes.canJump = false;
  // g.controllable.modes.canYaw = true;
  // g.controllable.modes.canPitch = true;
  EM.ensureComponentOn(p, CameraFollowDef, 1);
  // setCameraFollowPosition(p, "firstPerson");
  // setCameraFollowPosition(p, "thirdPerson");
  EM.ensureComponentOn(p, PositionDef);
  EM.ensureComponentOn(p, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  EM.ensureComponentOn(p, LinearVelocityDef);

  vec3.copy(p.position, [0, 1, -1.2]);
  quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, p.rotation);
  p.cameraFollow.positionOffset = V(0, 0, 5);
  p.controllable.speed *= 0.5;
  p.controllable.sprintMul = 10;
  const sphereMesh = cloneMesh(assets.ball.mesh);
  const visible = true;
  EM.ensureComponentOn(p, RenderableConstructDef, sphereMesh, visible);
  EM.ensureComponentOn(p, ColorDef, V(0.1, 0.1, 0.1));
  EM.ensureComponentOn(p, PositionDef, V(0, 0, 0));
  // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
  EM.ensureComponentOn(p, WorldFrameDef);
  // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
  EM.ensureComponentOn(p, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: assets.ball.aabb,
  });

  vec3.copy(p.position, [-28.11, 26.0, -28.39]);
  quat.copy(p.rotation, [0.0, -0.94, 0.0, 0.34]);
  vec3.copy(p.cameraFollow.positionOffset, [0.0, 2.0, 5.0]);
  p.cameraFollow.yawOffset = 0.0;
  p.cameraFollow.pitchOffset = -0.593;

  EM.ensureResource(LocalPlayerDef, p.id);
  EM.ensureComponentOn(p, PlayerDef);
  EM.ensureComponentOn(p, AuthorityDef, me.pid);
  EM.ensureComponentOn(p, PhysicsParentDef);
  return p;
}

// const wCorners = getAABBCornersTemp(selfAABB);
// wCorners.forEach((p) => vec3.transformMat4(p, ship.world.transform, p));
// wCorners.sort((a, b) => a[1] - b[1]); // sort by y, ascending
// const quad = wCorners.slice(0, 4);
// // assumes quad[0] and quad[3] are opposite corners
// const tri1 = [quad[0], quad[3], quad[1]];
// const tri2 = [quad[0], quad[3], quad[2]];

// if (
//   texX < 0 ||
//   grassCutTex.size[0] <= texX + w ||
//   texY < 0 ||
//   grassCutTex.size[1] <= texY + h
// ) {
//   console.warn("out of bounds grass cut");
//   return;
// }
// // data.fill(1);

// const write = (wx: number, wy: number) => {
//   // const xi = clamp(wx - orgX, 0, w - 1);
//   // const yi = clamp(wy - orgZ, 0, h - 1);
//   const xi = wx + WORLD_WIDTH / 2;
//   const yi = wy + WORLD_HEIGHT / 2;
//   const idx = Math.floor(xi + yi * WORLD_WIDTH);
//   // const idx = xi + yi * w;
//   // assert(
//   //   0 <= idx && idx < data.length,
//   //   `idx out of bounds: (${xi},${yi})=>${idx}`
//   // );
//   // console.log(idx);
//   worldCut[idx] = 1.0;

//   numCut++;
// };

// let numCut = 0;
// // TODO(@darzu): make sure we're not unsetting stuff that's been set to 1 from prev frames!
// // rasterizeTri(
// //   [tri1[0][0], tri1[0][2]],
// //   [tri1[1][0], tri1[1][2]],
// //   [tri1[2][0], tri1[2][2]],
// //   write
// // );
// rasterizeTri(
//   [tri2[0][0], tri2[0][2]],
//   [tri2[1][0], tri2[1][2]],
//   [tri2[2][0], tri2[2][2]],
//   write
// );

// // console.log(`numCut: ${numCut}`);

// // console.dir({
// //   texX,
// //   texY,
// //   w,
// //   h,
// //   orgX,
// //   orgZ,
// //   WORLD_WIDTH,
// //   tri1,
// //   tri2,
// // });
// // throw `stop`;
// // update data
// for (let wxi = texX; wxi < texX + w; wxi++) {
//   for (let wyi = texY; wyi < texY + h; wyi++) {
//     const wIdx = Math.floor(wxi + wyi * WORLD_WIDTH);
//     // console.log(wIdx);
//     const v = worldCut[wIdx];
//     const dIdx = Math.floor(wxi - texX + (wyi - texY) * w);
//     // assert(0 <= dIdx && dIdx < data.length, `idx out of bounds: ${dIdx}`);
//     // data[dIdx] = 1.0;
//     // if (v > 0.1) console.log(dIdx);
//     // console.log(dIdx);
//     data[dIdx] = v;
//   }
// }
