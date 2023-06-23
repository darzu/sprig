import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { BallMesh, GizmoMesh, UnitCubeMesh } from "../meshes/mesh-list.js";
import { XY } from "../meshes/mesh-loader.js";
import { ControllableDef } from "../input/controllable.js";
import { createGhost, GhostDef } from "../debug/ghost.js";
import { LocalHsPlayerDef, HsPlayerDef } from "../hyperspace/hs-player.js";
import {
  createGrassTile,
  createGrassTileset,
  GrassTileOpts,
  GrassTilesetOpts,
} from "./grass.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, transformMesh } from "../meshes/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mat3, mat4, quat, V, vec2, vec3 } from "../matrix/sprig-matrix.js";
import { SAIL_FURL_RATE } from "../wind/sail.js";
import { quatFromUpForward, randNormalVec3 } from "../utils/utils-3d.js";
import { randColor } from "../utils/utils-game.js";
import {
  GrassCutTexPtr,
  grassPoolPtr,
  registerUploadGrassData,
  renderGrassPipe,
} from "./std-grass.js";
import { WindDef, registerChangeWindSystems } from "../wind/wind.js";
import { DevConsoleDef } from "../debug/console.js";
import { clamp, jitter, max, sum } from "../utils/math.js";
import { createShip, ShipDef } from "../ld53/ship.js";
import { assert } from "../utils/util.js";
import { texTypeToBytes } from "../render/gpu-struct.js";
import { PartyDef } from "../camera/party.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { InputsDef } from "../input/inputs.js";
import { ScoreDef } from "../ld53/score.js";
import { raiseManTurret } from "../turret/turret.js";
import { TextDef } from "../gui/ui.js";
import { VERBOSE_LOG } from "../flags.js";
import { CanvasDef, HasFirstInteractionDef } from "../render/canvas.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { SKY_MASK } from "../render/pipeline-masks.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import { createFlatQuadMesh, makeDome } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { createGraph3D } from "../debug/utils-gizmos.js";
import { Phase } from "../ecs/sys-phase.js";

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

const DBG_PLAYER = false;

const grassGameMeshesDef = XY.defineMeshSetResource(
  "gg_meshes",
  UnitCubeMesh,
  GizmoMesh,
  BallMesh
);

// world map is centered around 0,0
const WORLD_WIDTH = 1024; // width runs +z
const WORLD_HEIGHT = 512; // height runs +x

const RED_DAMAGE_CUTTING = 10;
const RED_DAMAGE_PER_FRAME = 40;
const GREEN_HEALING = 1;

// const SHIP_START_POS: vec3 = V(0, 2, -WORLD_WIDTH * 0.5 * 0.8);

// const WORLD_HEIGHT = 1024;

const worldXToTexY = (x: number) => Math.floor(x + WORLD_HEIGHT / 2);
const worldZToTexX = (z: number) => Math.floor(z + WORLD_WIDTH / 2);
const texXToWorldZ = (x: number) => x - WORLD_WIDTH / 2 + 0.5;
const texYToWorldX = (y: number) => y - WORLD_HEIGHT / 2 + 0.5;

const level2DtoWorld3D = (levelPos: vec2, y: number, out: vec3) =>
  vec3.set(
    texYToWorldX(WORLD_HEIGHT - 1 - levelPos[1]),
    y,
    texXToWorldZ(levelPos[0]),
    out
  );

export async function initGrassGame(hosting: boolean) {
  registerUploadGrassData();

  const dbgGrid = [
    //
    // [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
    //
    // [mapJfa.voronoiTex, mapJfa.sdfTex],
    // TODO(@darzu): FIX FOR CSM & texture arrays
    [
      { ptr: shadowDepthTextures, idx: 0 },
      { ptr: shadowDepthTextures, idx: 1 },
    ],
  ];
  let dbgGridCompose = createGridComposePipelines(dbgGrid);

  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  // outlineRender.fragOverrides!.lineWidth = 3.0;

  const res = await EM.whenResources(
    grassGameMeshesDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;
  copyAABB(
    res.camera.maxWorldAABB,
    createAABB(
      V(-WORLD_HEIGHT * 1.1, -100, -WORLD_WIDTH * 1.1),
      V(WORLD_HEIGHT * 1.1, 100, WORLD_WIDTH * 1.1)
    )
  );

  // console.dir(mapJfa);
  // console.dir(dbgGridCompose);

  EM.addSystem(
    "grassGameRenderPipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        stdRenderPipeline,
        renderGrassPipe,
        // renderOceanPipe,
        outlineRender,
        deferredPipeline,
        skyPipeline,
        postProcess,
        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    }
  );

  // Sun
  const sunlight = EM.new();
  EM.set(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.linear = 0.0;
  sunlight.pointLight.quadratic = 0.0;
  vec3.copy(sunlight.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sunlight, PositionDef, V(50, 300, 10));
  EM.set(sunlight, RenderableConstructDef, res.gg_meshes.ball.proto);

  // score
  const score = EM.addResource(ScoreDef);

  // sky dome?
  const SKY_HALFSIZE = 1000;
  const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
  const sky = EM.new();
  EM.set(sky, PositionDef, V(0, -100, 0));
  const skyMesh = domeMesh;
  EM.set(sky, RenderableConstructDef, skyMesh, undefined, undefined, SKY_MASK);

  // ground
  const ground = EM.new();
  const groundMesh = cloneMesh((await UnitCubeMesh.gameMesh()).mesh);
  transformMesh(
    groundMesh,
    mat4.fromScaling(V(WORLD_HEIGHT, 1.0, WORLD_WIDTH))
  );
  EM.set(ground, RenderableConstructDef, groundMesh);
  EM.set(ground, ColorDef, ENDESGA16.darkGreen);
  // EM.set(ground, ColorDef, ENDESGA16.darkGreen);
  // EM.set(p, ColorDef, [0.2, 0.3, 0.2]);
  EM.set(ground, PositionDef, V(-WORLD_HEIGHT * 0.5, -1.1, -WORLD_WIDTH * 0.5));
  // EM.set(plane, PositionDef, [0, -5, 0]);

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
  const gr = EM.new();
  EM.set(
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
  EM.set(gr, ColorDef, randColor());
  EM.set(gr, PositionDef);

  // set
  const ts = await Promise.all([
    createGrassTileset(lod1),
    createGrassTileset(lod2),
    createGrassTileset(lod3),
    createGrassTileset(lod4),
    createGrassTileset(lod5),
  ]);

  console.log(`num grass tris: ${sum(ts.map((t) => t.numTris))}`);

  EM.addResource(WindDef);

  registerChangeWindSystems();

  // load level

  const ship = await createShip();
  vec3.set(0, 10, 0, ship.position);
  // move down
  // vec3.copy(ship.position, SHIP_START_POS);

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

  // ghost
  if (DBG_PLAYER) {
    const g = createGhost();
    // vec3.copy(g.position, [0, 1, -1.2]);
    // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
    // g.cameraFollow.positionOffset = V(0, 0, 5);
    g.controllable.speed *= 2.0;
    g.controllable.sprintMul = 15;
    const sphereMesh = cloneMesh(res.gg_meshes.ball.mesh);
    const visible = false;
    EM.set(g, RenderableConstructDef, sphereMesh, visible);
    EM.set(g, ColorDef, V(0.1, 0.1, 0.1));
    // EM.set(g, PositionDef, V(0, 0, 0));
    // EM.set(b2, PositionDef, [0, 0, -1.2]);
    EM.set(g, WorldFrameDef);
    // EM.set(b2, PhysicsParentDef, g.id);
    EM.set(g, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: res.gg_meshes.ball.aabb,
    });

    // tower close up:
    // vec3.copy(g.position, [-103.66, 32.56, -389.96]);
    // quat.copy(g.rotation, [0.0, -1.0, 0.0, -0.09]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.423;

    // high up:
    // vec3.copy(g.position, [-140.25, 226.5, -366.78]);
    // quat.copy(g.rotation, [0.0, -0.99, 0.0, 0.15]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -1.009;

    // top down landscape:
    // vec3.copy(g.position, [-357.47, 342.5, -35.34]);
    // quat.copy(g.rotation, [0.0, -0.71, 0.0, 0.71]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -1.098;

    // tower 1 close up
    vec3.copy(g.position, [-157.32, 54.5, -328.04]);
    quat.copy(g.rotation, [0.0, -0.7, 0.0, 0.72]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.576;

    // world origin
    // vec3.copy(g.position, [-223.25, 40.5, -432.01]);
    // quat.copy(g.rotation, [0.0, -0.58, 0.0, 0.81]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.378;

    EM.addSystem(
      "smolGhost",
      Phase.GAME_WORLD,
      [GhostDef, WorldFrameDef, ColliderDef],
      [InputsDef, HasFirstInteractionDef],
      async (ps, { inputs }) => {
        if (!ps.length) return;

        const ghost = ps[0];
      }
    );

    // EM.registerSystem(
    //   [GhostDef, WorldFrameDef],
    //   [PartyDef],
    //   async (ps, res) => {
    //     if (!ps.length) return;
    //     const ghost = ps[0];
    //     vec3.copy(res.party.pos, ghost.world.position);
    //   },
    //   "smolGhostParty"
    // );
  }

  // update grass
  EM.addSystem(
    "updateGrass",
    Phase.GAME_WORLD,
    [HsPlayerDef, CameraFollowDef, WorldFrameDef],
    [],
    (es, res) => {
      const player = es[0];
      // console.log(player.world.position);
      // const player = EM.findEntity(res.localHsPlayer.playerId, [WorldFrameDef]);
      if (player) for (let t of ts) t.update(player.world.position);
    }
  );

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

  EM.addSystem(
    "cuttingOnOff",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef],
    (_, res) => {
      // TODO(@darzu):
      if (res.inputs.keyClicks[" "]) {
        ship.ld52ship.cuttingEnabled = !ship.ld52ship.cuttingEnabled;
      }
    }
  );

  // TODO(@darzu): PERF. bad mem usage everywhere..
  let worldCutData = new Float32Array(
    grassCutTex.size[0] * grassCutTex.size[1]
  );
  assert(
    WORLD_WIDTH === grassCutTex.size[0] && WORLD_HEIGHT === grassCutTex.size[1]
  );

  score.onLevelEnd.push(async () => {
    worldCutData.fill(0.0);
    grassCutTex.queueUpdate(worldCutData);
    // vec3.set(0, 0, 0, ship.position);
    // vec3.copy(ship.position, SHIP_START_POS);
    // level2DtoWorld3D(level.levelMap.startPos, 2, ship.position);
    quat.identity(ship.rotation);
    vec3.set(0, 0, 0, ship.linearVelocity);
    const sail = ship.ld52ship.mast()!.mast.sail()!.sail;
    sail.unfurledAmount = sail.minFurl;
    ship.ld52ship.cuttingEnabled = true;
    ship.ld52ship.rudder()!.yawpitch.yaw = 0;
  });

  EM.addSystem(
    "cutGrassUnderShip",
    Phase.GAME_WORLD,
    [ShipDef, PositionDef, WorldFrameDef, PhysicsStateDef],
    [PartyDef, ScoreDef],
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
        //res.score.shipHealth -= 320;
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

            // const color = res.levelMap.land[idx];
            const color = 0.05; // TODO(@darzu): add back in multi-color grass?

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

      // res.score.shipHealth = Math.min(
      //   res.score.shipHealth + healthChanges,
      //   10000
      // );
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
    }
  );

  // EM.addConstraint(["detectGameEnd", "after", "cutGrassUnderShip"]);

  EM.addSystem(
    "furlUnfurl",
    Phase.GAME_PLAYERS,
    null,
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
    }
  );

  const shipWorld = await EM.whenEntityHas(ship, WorldFrameDef);

  EM.addSystem(
    "turnMast",
    Phase.GAME_PLAYERS,
    null,
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
    }
  );

  const { text } = await EM.whenResources(TextDef);
  text.lowerText =
    "W/S: unfurl/furl, A/D: turn, SPACE: harvest on/off, E: use/unuse rudder";
  if (DBG_PLAYER) text.lowerText = "";

  // world gizmo
  const gizmoMesh = await GizmoMesh.gameMesh();
  const worldGizmo = EM.new();
  EM.set(worldGizmo, PositionDef, V(-WORLD_HEIGHT / 2, 0, -WORLD_WIDTH / 2));
  EM.set(worldGizmo, ScaleDef, V(100, 100, 100));
  EM.set(worldGizmo, RenderableConstructDef, gizmoMesh.proto);

  // debugging createGraph3D
  let data: vec3[][] = [];
  for (let x = 0; x < 12; x++) {
    data[x] = [];
    for (let z = 0; z < 7; z++) {
      data[x][z] = V(x, x + z, z);
    }
  }
  createGraph3D(vec3.add(worldGizmo.position, [50, 10, 50], V(0, 0, 0)), data);
}

async function createPlayer() {
  const { gg_meshes, me } = await EM.whenResources(grassGameMeshesDef, MeDef);
  const p = EM.new();
  EM.set(p, ControllableDef);
  p.controllable.modes.canFall = false;
  p.controllable.modes.canJump = false;
  // g.controllable.modes.canYaw = true;
  // g.controllable.modes.canPitch = true;
  EM.set(p, CameraFollowDef, 1);
  // setCameraFollowPosition(p, "firstPerson");
  // setCameraFollowPosition(p, "thirdPerson");
  EM.set(p, PositionDef);
  EM.set(p, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  EM.set(p, LinearVelocityDef);

  vec3.copy(p.position, [0, 1, -1.2]);
  quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, p.rotation);
  p.cameraFollow.positionOffset = V(0, 0, 5);
  p.controllable.speed *= 0.5;
  p.controllable.sprintMul = 10;
  const sphereMesh = cloneMesh(gg_meshes.ball.mesh);
  const visible = true;
  EM.set(p, RenderableConstructDef, sphereMesh, visible);
  EM.set(p, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(p, PositionDef, V(0, 0, 0));
  // EM.set(b2, PositionDef, [0, 0, -1.2]);
  EM.set(p, WorldFrameDef);
  // EM.set(b2, PhysicsParentDef, g.id);
  EM.set(p, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: gg_meshes.ball.aabb,
  });

  vec3.copy(p.position, [-28.11, 26.0, -28.39]);
  quat.copy(p.rotation, [0.0, -0.94, 0.0, 0.34]);
  vec3.copy(p.cameraFollow.positionOffset, [0.0, 2.0, 5.0]);
  p.cameraFollow.yawOffset = 0.0;
  p.cameraFollow.pitchOffset = -0.593;

  EM.ensureResource(LocalHsPlayerDef, p.id);
  EM.set(p, HsPlayerDef);
  EM.set(p, AuthorityDef, me.pid);
  EM.set(p, PhysicsParentDef);
  return p;
}
