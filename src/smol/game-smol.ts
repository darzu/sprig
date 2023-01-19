import {
  CameraDef,
  CameraFollowDef,
  setCameraFollowPosition,
} from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { AssetsDef, createFlatQuadMesh, gameMeshFromMesh } from "../assets.js";
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
import { LinearVelocityDef } from "../physics/motion.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mat3, mat4, quat, V, vec3 } from "../sprig-matrix.js";
import { createMast, createSail, MastDef, SAIL_FURL_RATE } from "./sail.js";
import { quatFromUpForward, randNormalPosVec3 } from "../utils-3d.js";
import { randColor } from "../utils-game.js";
import { GrassCutTexPtr, grassPoolPtr, renderGrassPipe } from "./std-grass.js";
import { WindDef } from "./wind.js";
import { DevConsoleDef } from "../console.js";
import { clamp, sum } from "../math.js";
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

/*
TODO:
[ ] PERF. Disable backface culling ONLY on grass

NOTES:
- Cut grass by updating a texture that has cut/not cut or maybe cut-height
*/

const DBG_PLAYER = false;

const WORLD_WIDTH = 1024;
const WORLD_HEIGHT = 512;

const RED_DAMAGE_CUTTING = 10;
const RED_DAMAGE_PER_FRAME = 40;
const GREEN_HEALING = 1;

const SHIP_START_POS: vec3 = V(0, 2, -WORLD_WIDTH * 0.5 * 0.6);

// const WORLD_HEIGHT = 1024;

export const mapJfa = createJfaPipelines(GrassMapTexPtr, "exterior");

export async function initSmol(em: EntityManager, hosting: boolean) {
  const dbgGrid = [
    //
    [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
    //
    [mapJfa.voronoiTex, mapJfa.sdfTex],
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

  // res.renderer.renderer.submitPipelines(
  //   [],
  //   // [unwrapPipeline, unwrapPipeline2]
  //   [...mapJfa.allPipes()]
  // );

  console.dir(mapJfa);
  console.dir(dbgGridCompose);

  // height map
  // const heightMapRes = 0.25;
  // const heightmapMesh = createFlatQuadMesh(WORLD_WIDTH, WORLD_HEIGHT);
  // const hm = em.new();
  // em.ensureComponentOn(hm, RenderableConstructDef, heightmapMesh);
  // em.ensureComponentOn(hm, PositionDef);
  // // TODO(@darzu): update heightmap from SDF

  em.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        stdRenderPipeline,
        renderGrassPipe,
        outlineRender,
        postProcess,
        ...(res.dev.showConsole
          ? [...mapJfa.allPipes(), ...dbgGridCompose]
          : []),
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
  vec3.copy(sunlight.pointLight.ambient, [0.4, 0.4, 0.4]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.ensureComponentOn(sunlight, PositionDef, V(50, 100, 10));
  em.ensureComponentOn(sunlight, RenderableConstructDef, res.assets.ball.proto);

  // score
  const score = em.addResource(ScoreDef);
  em.requireSystem("updateScoreDisplay");
  em.requireSystem("detectGameEnd");
  // start map
  setMap(em, "obstacles1");

  // ground
  const ground = em.new();
  const groundMesh = cloneMesh(res.assets.unitCube.mesh);
  transformMesh(
    groundMesh,
    mat4.fromScaling(V(WORLD_HEIGHT, 1.0, WORLD_WIDTH))
  );
  em.ensureComponentOn(ground, RenderableConstructDef, groundMesh);
  em.ensureComponentOn(ground, ColorDef, V(0.1, 0.5, 0.1));
  // em.set(ground, ColorDef, ENDESGA16.darkGreen);
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(
    ground,
    PositionDef,
    V(-WORLD_HEIGHT * 0.5, -1.1, -WORLD_WIDTH * 0.5)
  );
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // grass
  const lod1: GrassTilesetOpts = {
    bladeW: 0.2,
    // bladeH: 3,
    // bladeH: 1.6,
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
    undefined,
    undefined,
    grassPoolPtr
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
    g.controllable.speed *= 0.5;
    g.controllable.sprintMul = 10;
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

    vec3.copy(g.position, [-28.11, 26.0, -28.39]);
    quat.copy(g.rotation, [0.0, -0.94, 0.0, 0.34]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.593;

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
  const texYToWorldX = (x: number) => x - WORLD_HEIGHT / 2 + 0.5;

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
      const winWi = Math.ceil(worldAABB.max[0] - worldAABB.min[0]);
      const winHi = Math.ceil(worldAABB.max[2] - worldAABB.min[2]);

      if (
        winXi < 0 ||
        grassCutTex.size[0] <= winXi + winWi ||
        winYi < 0 ||
        grassCutTex.size[1] <= winYi + winHi
      ) {
        res.score.shipHealth -= 320;
        return;
      }

      const windowData = getArrayForBox(winWi, winHi);

      const shipW = selfAABB.max[0] - selfAABB.min[0];
      const shipH = selfAABB.max[2] - selfAABB.min[2];
      let healthChanges = 0;
      let cutPurple = 0;

      let redHurt = false;

      // update world texture data
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

          if (Math.abs(xDist) < shipW * 0.5 && Math.abs(zDist) < shipH * 0.5) {
            const idx = xi + yi * WORLD_WIDTH;

            const color = res.grassMap.map[idx];

            if (ship.ld52ship.cuttingEnabled) {
              if (worldCutData[idx] != 1) {
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
              }
              worldCutData[idx] = 1;
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
      for (let xi = winXi; xi < winXi + winWi; xi++) {
        for (let yi = winYi; yi < winYi + winHi; yi++) {
          const worldIdx = xi + yi * WORLD_WIDTH;
          const val = worldCutData[worldIdx];
          const winIdx = xi - winXi + (yi - winYi) * winWi;
          windowData[winIdx] = val;
        }
      }

      // console.dir(data);

      grassCutTex.queueUpdate(windowData, winXi, winYi, winWi, winHi);

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
