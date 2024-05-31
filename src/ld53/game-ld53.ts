import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import {
  BallMesh,
  CubeMesh,
  GizmoMesh,
  PirateMesh,
} from "../meshes/mesh-list.js";
import { ControllableDef } from "../input/controllable.js";
import { createGhost, GhostDef } from "../debug/ghost.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import {
  cloneMesh,
  getAABBFromMesh,
  Mesh,
  RiggedMesh,
} from "../meshes/mesh.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "../render/pipelines/std-shadow.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
  RiggedRenderableConstructDef,
} from "../render/renderer-ecs.js";
import { mat3, quat, tV, V, V2, V3 } from "../matrix/sprig-matrix.js";
import { DevConsoleDef } from "../debug/console.js";
import { clamp, jitter, max } from "../utils/math.js";
import { assert, dbgLogMilestone, dbgOnce } from "../utils/util.js";
import { PartyDef } from "../camera/party.js";
import {
  copyAABB,
  createAABB,
  getSizeFromAABB,
  updateAABBWithPoint,
} from "../physics/aabb.js";
import { InputsDef } from "../input/inputs.js";
import { CanManDef, TurretDef, raiseManTurret } from "../turret/turret.js";
import { TextDef } from "../gui/ui.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { initOcean, OceanDef, UVPosDef } from "../ocean/ocean.js";
import { renderOceanPipe } from "../render/pipelines/std-ocean.js";
import { SKY_MASK } from "../render/pipeline-masks.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import {
  createFlatQuadMesh,
  makeDome,
  resetFlatQuadMesh,
} from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { ScoreDef } from "./score.js";
import { LandMapTexPtr, LevelMapDef, setMap } from "../levels/level-map.js";
import { setWindAngle, WindDef } from "../wind/wind.js";
import {
  LD52ShipDef,
  cannonDefaultPitch,
  createLd53ShipAsync,
} from "./ship.js";
import { SAIL_FURL_RATE } from "../wind/sail.js";
import { StoneTowerDef, TowerPoolDef } from "../stone/stone.js";
import { LandDef } from "./land-collision.js";
import { DeadDef } from "../ecs/delete.js";
import { BulletDef, breakBullet } from "../cannons/bullet.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { DockDef, createDock } from "./dock.js";
import { ShipHealthDef } from "./ship-health.js";
import {
  FinishedDef,
  createRef,
  defineNetEntityHelper,
} from "../ecs/em-helpers.js";
import { resetWoodState, WoodStateDef } from "../wood/wood-builder.js";
import { WoodHealthDef } from "../wood/wood-health.js";
import { resetWoodHealth } from "../wood/wood-health.js";
import { MapPaths } from "../levels/map-loader.js";
import { stdRiggedRenderPipeline } from "../render/pipelines/std-rigged.js";
import { PoseDef } from "../animation/skeletal.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import { TeleportDef } from "../physics/teleport.js";
import { eventWizard } from "../net/events.js";
import { drawUpdatingVector } from "../utils/util-vec-dbg.js";
import { vec2Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { HasMastDef } from "../wind/mast.js";
import { HasRudderDef } from "./rudder.js";
import { obbTests } from "../physics/obb.js";
import { linePipe, pointPipe } from "../render/pipelines/std-line.js";
import { renderDots } from "../render/pipelines/std-dots.js";
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
const DBG_HIDE_LAND = false;
const DBG_HIDE_WATER = false;

const START_LEVEL_IDX = 0;

// const SHIP_START_POS = V(100, 0, -100);

// world map is centered around 0,0
const WORLD_WIDTH = 1024; // width runs +x
const WORLD_HEIGHT = 512; // height runs +y

const MOTORBOAT_MODE = false;

// const RED_DAMAGE_CUTTING = 10;
// const RED_DAMAGE_PER_FRAME = 40;
// const GREEN_HEALING = 1;

// const SHIP_START_POS: V3 = V(0, 2, -WORLD_WIDTH * 0.5 * 0.8);

// const WORLD_HEIGHT = 1024;

const worldXToTexX = (x: number) => Math.floor(x + WORLD_WIDTH / 2);
const worldYToTexY = (y: number) => Math.floor(y + WORLD_HEIGHT / 2);
const texXToWorldX = (x: number) => x + 0.5 - WORLD_WIDTH / 2;
const texYToWorldY = (y: number) => y + 0.5 - WORLD_HEIGHT / 2;

const level2DtoWorld3D = (levelPos: V2, z: number, out: V3) =>
  V3.set(texXToWorldX(levelPos[0]), texYToWorldY(levelPos[1]), z, out);

export const mapJfa = createJfaPipelines({
  name: "ld53MapJfa",
  maskTex: LandMapTexPtr,
  maskMode: "exterior",
});

const STONE_TOWER_HEIGHT = 10;

export const LD53MeshesDef = XY.defineMeshSetResource(
  "ld53Meshes",
  BallMesh,
  PirateMesh,
  CubeMesh
);

const dbgGrid = [
  //
  [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
  //
  // [mapJfa.voronoiTex, mapJfa.sdfTex],
  // TODO(@darzu): FIX FOR CSM & texture arrays
  [
    { ptr: shadowDepthTextures, idx: 0 },
    { ptr: shadowDepthTextures, idx: 1 },
  ],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

// TODO(@darzu): MULTIPLAYER. Fully test this..
const raiseSetLevel = eventWizard(
  "ld53-set-level",
  [] as const,
  async (_, levelIdx: number) => setLevelLocal(levelIdx),
  {
    legalEvent: (_, levelIdx: number) => {
      assert(0 <= levelIdx && levelIdx <= 3, `invalid level: ${levelIdx}`);
      return true;
    },
    serializeExtra: (buf, levelIdx: number) => {
      buf.writeUint8(levelIdx);
    },
    deserializeExtra: (buf) => {
      const levelIdx = buf.readUint8();
      return levelIdx;
    },
  }
);

// TODO(@darzu): MULTIPLAYER. Fully test this..
async function hostResetLevel(levelIdx: number) {
  raiseSetLevel(levelIdx);

  // TODO(@darzu): this is erroring out
  const ship = await EM.whenSingleEntity(
    PositionDef,
    RotationDef,
    LD52ShipDef,
    HasMastDef,
    HasRudderDef,
    LinearVelocityDef,
    ShipHealthDef,
    WoodHealthDef,
    WoodStateDef
  );

  // TODO(@darzu): MULTIPLAYER: which are needed on client?
  // worldCutData.fill(0.0);
  // grassCutTex.queueUpdate(worldCutData);
  // vec3.set(0, 0, 0, ship.position);
  // vec3.copy(ship.position, SHIP_START_POS);
  const { levelMap, wind, renderer } = await EM.whenResources(
    LevelMapDef,
    WindDef,
    RendererDef
  );

  // move ship to map start pos
  level2DtoWorld3D(levelMap.startPos, 8, ship.position);
  V3.set(0, 0, 0, ship.linearVelocity);
  quat.identity(ship.rotation);
  quat.yaw(ship.rotation, Math.PI / 2, ship.rotation);

  // reset ship sails and rudder
  const sail = ship.hasMast.mast.mast.sail.sail;
  sail.unfurledAmount = sail.minFurl;
  ship.hasRudder.rudder.yawpitch.yaw = 0;

  // set map wind angle
  const wingAngle = Math.atan2(levelMap.windDir[1], levelMap.windDir[0]);
  setWindAngle(wind, wingAngle);

  // reset cannon orientations
  ship.ld52ship.cannonR.yawpitch.pitch = cannonDefaultPitch;
  ship.ld52ship.cannonR.yawpitch.yaw = Math.PI * 0.5;
  ship.ld52ship.cannonL.yawpitch.pitch = cannonDefaultPitch;
  ship.ld52ship.cannonL.yawpitch.yaw = Math.PI * 1.5;

  // reset ship health
  resetWoodHealth(ship.woodHealth);
  ship.shipHealth.health = 1;
  resetWoodState(ship.woodState);
  EM.whenEntityHas(ship, RenderableDef, WoodStateDef).then((ship) =>
    renderer.renderer.stdPool.updateMeshQuadInds(
      ship.renderable.meshHandle,
      ship.woodState.mesh as Mesh,
      0,
      ship.woodState.mesh.quad.length
    )
  );

  // reset dock
  // console.log("resetting dock position");
  // TODO(@darzu): MULTIPLAYER: dock health
  const dock = await EM.whenSingleEntity(
    DockDef,
    PositionDef,
    WoodHealthDef,
    WoodStateDef
  );
  const endZonePos = level2DtoWorld3D(levelMap.endZonePos, 5, V3.tmp());
  V3.copy(dock.position, endZonePos);
  resetWoodHealth(dock.woodHealth);
  resetWoodState(dock.woodState);
  EM.whenEntityHas(dock, RenderableDef, WoodStateDef).then((dock) =>
    renderer.renderer.stdPool.updateMeshQuadInds(
      dock.renderable.meshHandle,
      dock.woodState.mesh as Mesh,
      0,
      dock.woodState.mesh.quad.length
    )
  );
}

async function setLevelLocal(levelIdx: number) {
  // TODO(@darzu): MULTIPLAYER: dock
  // if (dock) {
  //   // TODO(@darzu): this isn't right.. where do we repair the dock?
  //   // splinter the dock
  //   for (let b of dock.woodHealth.boards) {
  //     for (let s of b) {
  //       s.health = 0;
  //     }
  //   }
  // }

  // console.log(`SET LEVEL: ${levelIdx}`);
  await setMap(MapPaths[levelIdx]);
  await resetLand();

  const { levelMap, towerPool } = await EM.whenResources(
    LevelMapDef,
    TowerPoolDef
  );

  // TODO(@darzu): MULTIPLAYER towers!
  const towers = EM.filterEntities_uncached([StoneTowerDef]);
  for (let tower of towers) {
    towerPool.despawn(tower);
  }

  // spawn towers
  const towerPosAndYaw: [V3, number][] = levelMap.towers.map(([tPos, tDir]) => [
    level2DtoWorld3D(tPos, STONE_TOWER_HEIGHT, V3.mk()),
    V2.getYaw(tDir),
  ]);

  for (let [pos, yaw] of towerPosAndYaw) {
    const stoneTower = towerPool.spawn();
    V3.copy(stoneTower.position, pos);
    // quat.setAxisAngle([0, 0, 1], angle, stoneTower.rotation);
    quat.fromYawPitchRoll(yaw, 0, 0, stoneTower.rotation);
  }

  dbgLogMilestone("Game playable");

  // const { me } = await EM.whenResources(MeDef);
}

export async function initLD53() {
  // obbTests();

  const res = await EM.whenResources(
    LD53MeshesDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef,
    DevConsoleDef,
    MeDef
  );

  if (DBG_PLAYER) {
    const sphereMesh = cloneMesh(res.ld53Meshes.ball.mesh);
    const g = createGhost(sphereMesh, false);
    // vec3.copy(g.position, [0, 1, -1.2]);
    // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
    // g.cameraFollow.positionOffset = V(0, 0, 5);
    g.controllable.speed *= 2.0;
    g.controllable.sprintMul = 15;
    EM.set(g, ColorDef, V(0.1, 0.1, 0.1));
    // EM.set(g, PositionDef, V(0, 0, 0));
    // EM.set(b2, PositionDef, [0, 0, -1.2]);
    EM.set(g, WorldFrameDef);
    // EM.set(b2, PhysicsParentDef, g.id);
    EM.set(g, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: res.ld53Meshes.ball.aabb,
    });

    // vec3.copy(g.position, [-399.61, -333.9, 113.58]);
    // quat.copy(g.rotation, [0.0, 0.0, 0.01, 1.0]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = 2.937;

    // hover above ship:
    // vec3.copy(g.position, [-369.29, -22.97, 28.91]);
    // quat.copy(g.rotation, [0.0, 0.0, -0.47, 0.88]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // // g.cameraFollow.pitchOffset = 2.631;
    // g.cameraFollow.pitchOffset = 0.0;

    // stone tower:
    // vec3.copy(g.position, [-25.81, 115.83, 72.91]);
    // quat.copy(g.rotation, [0.0, 0.0, -0.49, 0.87]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.522;

    V3.copy(g.position, [-387.88, -118.78, 128.91]);
    quat.copy(g.rotation, [0.0, 0.0, -0.2, 0.98]);
    V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.858;

    EM.addSystem(
      "smolGhost",
      Phase.GAME_WORLD,
      [GhostDef, WorldFrameDef, ColliderDef],
      [InputsDef, HasFirstInteractionDef],
      (ps, { inputs }) => {
        if (!ps.length) return;

        const ghost = ps[0];
      }
    );
  }

  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  outlineRender.fragOverrides!.lineWidth = 1.0;

  res.camera.fov = Math.PI * 0.5;
  copyAABB(
    res.camera.maxWorldAABB,
    createAABB(
      V(-WORLD_WIDTH * 1.1, -WORLD_HEIGHT * 1.1, -100),
      V(WORLD_WIDTH * 1.1, WORLD_HEIGHT * 1.1, 100)
    )
  );

  // console.dir(mapJfa);
  // console.dir(dbgGridCompose);

  // renderer
  // EM.addEagerInit([], [RendererDef, DevConsoleDef], [], (res) => {
  EM.addSystem(
    "ld53GamePipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        ...shadowPipelines,
        stdMeshPipe, // SLOW
        renderDots,
        stdRiggedRenderPipeline,
        // renderGrassPipe,
        ...(DBG_HIDE_WATER ? [] : [renderOceanPipe]),
        outlineRender, // 2ms
        deferredPipeline, // 10ms
        linePipe,
        pointPipe,
        skyPipeline,
        postProcess,
        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    }
  );

  // Sun
  const sunlight = EM.mk();
  EM.set(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.linear = 0.0;
  sunlight.pointLight.quadratic = 0.0;
  V3.copy(sunlight.pointLight.ambient, [0.2, 0.2, 0.2]);
  V3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sunlight, PositionDef, V(50, 10, 300));
  EM.set(sunlight, RenderableConstructDef, res.ld53Meshes.ball.proto);

  // // pirate test
  // const PirateDef = EM.defineComponent("pirate", () => true);
  // const pirate = EM.new();
  // EM.set(
  //   pirate,
  //   RiggedRenderableConstructDef,
  //   res.ld53Meshes.pirate.mesh as RiggedMesh
  // );
  // EM.set(pirate, PositionDef, V(50, 80, 10));
  // EM.set(pirate, PirateDef);
  // EM.set(pirate, PoseDef, 0);
  // pirate.pose.repeat = [
  //   { pose: 1, t: 500 },
  //   { pose: 0, t: 500 },
  //   { pose: 3, t: 500 },
  //   { pose: 0, t: 500 },
  // ];

  // score
  const score = EM.addResource(ScoreDef);

  // start map
  // TODO(@darzu): MULTIPLAYER:
  if (res.me.host) {
    raiseSetLevel(START_LEVEL_IDX);
  }
  // const landPromise = setLevelLocal(0);
  // await setMap(MapPaths[0]);

  // const landPromise = resetLand();

  // sky dome?
  const SKY_HALFSIZE = 1000;
  const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
  const sky = EM.mk();
  EM.set(sky, PositionDef, V(0, 0, -100));
  // const skyMesh = cloneMesh(res.allMeshes.cube.mesh);
  // skyMesh.pos.forEach((p) => V3.scale(p, SKY_HALFSIZE, p));
  // skyMesh.quad.forEach((f) => V4.reverse(f, f));
  // skyMesh.tri.forEach((f) => V3.reverse(f, f));
  const skyMesh = domeMesh;
  EM.set(sky, RenderableConstructDef, skyMesh, undefined, undefined, SKY_MASK);
  // EM.set(sky, ColorDef, V(0.9, 0.9, 0.9));

  // ocean
  // const oceanVertsPerWorldUnit = 0.02;
  const oceanVertsPerWorldUnit = 0.25;
  const worldUnitPerOceanVerts = 1 / oceanVertsPerWorldUnit;
  const oceanXCount = Math.floor(WORLD_WIDTH * oceanVertsPerWorldUnit);
  const oceanYCount = Math.floor(WORLD_HEIGHT * oceanVertsPerWorldUnit);
  const oceanMesh = createFlatQuadMesh(oceanXCount, oceanYCount);
  const maxSurfId = max(oceanMesh.surfaceIds);
  // console.log("maxSurfId");
  // console.log(maxSurfId);
  const oceanAABB = createAABB();
  oceanMesh.pos.forEach((p, i) => {
    p[0] = p[0] * worldUnitPerOceanVerts - WORLD_WIDTH * 0.5;
    p[1] = p[1] * worldUnitPerOceanVerts - WORLD_HEIGHT * 0.5;
    p[2] = 0.0;
    updateAABBWithPoint(oceanAABB, p);
  });
  const oceanSize = getSizeFromAABB(oceanAABB, V3.mk());
  // TODO(@darzu): how does this uvToPos match with the ocean's gpu-uv-unwrapped thingy?
  function uvToPos([u, v]: V2, out: V3): V3 {
    // console.log(u + " " + v);
    out[0] = u * oceanSize[0] + oceanAABB.min[0];
    out[1] = v * oceanSize[1] + oceanAABB.min[1];
    out[2] = 0;
    // if (dbgOnce("uvToPos")) {
    //   console.log("uvToPos");
    //   console.dir(oceanSize);
    //   console.dir(oceanAABB);
    //   console.dir([u, v]);
    // }
    return out;
  }
  // TODO(@darzu): I don't think the PBR-ness of this color is right
  // initOcean(oceanMesh, V(0.1, 0.3, 0.8));
  initOcean(oceanMesh, ENDESGA16.blue);
  const ocean = await EM.whenResources(OceanDef); // TODO(@darzu): need to wait?

  const wind = EM.addResource(WindDef);
  // registerChangeWindSystems();

  // load level
  const level = await EM.whenResources(LevelMapDef);
  // console.log(`level.levelMap.windDir: ${vec2Dbg(level.levelMap.windDir)}`);
  // V2.set(0, 1, level.levelMap.windDir))
  const wingAngle = Math.atan2(
    level.levelMap.windDir[1],
    level.levelMap.windDir[0]
  );
  // console.log(`wingAngle: ${wingAngle}`);
  setWindAngle(wind, wingAngle);

  /*
  MULTIPLAYER LEVEL SYNCING
  state machine that is synchronized, someone has authority
    could be via events
  aside: maybe all events should describe their log strategy: play all, play last "N", play last
    Doug thinks we should view this as log compaction. I agree.
  */

  if (res.me.host) {
    const ship = await createLd53ShipAsync();

    // move down
    // ship.position[2] = -WORLD_SIZE * 0.5 * 0.6;
    level2DtoWorld3D(level.levelMap.startPos, 8, ship.position);
    //vec3.copy(ship.position, SHIP_START_POS);

    // TODO(@darzu): MULTIPLAYER: sync level
    score.onLevelEnd.push(async () => {
      // console.log("score.onLevelEnd");
      // TODO(@darzu): MULTIPLAYER: dock
      // await setLevelLocal(score.levelNumber, dock);
      await hostResetLevel(score.levelNumber);
    });

    EM.addSystem(
      "furlUnfurl",
      Phase.GAME_PLAYERS,
      null,
      [InputsDef, PartyDef],
      (_, res) => {
        const mast = ship.hasMast.mast;
        const rudder = ship.hasRudder.rudder;

        // TODO(@darzu): how do we make this code re-usable across games and keybindings?
        // furl/unfurl
        assert(TurretDef.isOn(rudder));
        if (rudder.turret.mannedId) {
          if (MOTORBOAT_MODE) {
            // console.log("here");
            if (res.inputs.keyDowns["w"]) {
              V3.add(
                ship.linearVelocity,
                V3.scale(res.party.dir, 0.1),
                ship.linearVelocity
              );
            }
          } else {
            const sail = mast.mast.sail.sail;
            if (res.inputs.keyDowns["w"]) sail.unfurledAmount += SAIL_FURL_RATE;
            if (res.inputs.keyDowns["s"]) sail.unfurledAmount -= SAIL_FURL_RATE;
          }
        }
      }
    );

    const shipWorld = await EM.whenEntityHas(ship, WorldFrameDef);

    // end zone
    const dock = createDock();
    EM.set(dock, AuthorityDef, res.me.pid);
    const endZonePos = level2DtoWorld3D(level.levelMap.endZonePos, 5, V3.tmp());
    V3.copy(dock.position, endZonePos);

    // drawBall(endZonePos, 4, ENDESGA16.deepGreen);

    EM.whenEntityHas(dock, PhysicsStateDef).then(
      (dock) => (score.endZone = createRef(dock))
    );
  }

  // bouyancy
  if (!"true") {
    // TODO(@darzu): Z_UP for bouyancy
    const bouyDef = EM.defineComponent("bouy", () => true);
    const buoys: EntityW<[typeof PositionDef]>[] = [];
    for (let u = 0.4; u <= 0.6; u += 0.02) {
      for (let v = 0.4; v <= 0.6; v += 0.02) {
        const bouy = EM.mk();
        EM.set(bouy, PositionDef, V(0, 0, 0));
        EM.set(bouy, UVPosDef, V(u + jitter(0.01), v + jitter(0.01)));
        // EM.set(bouy, ScaleDef, V(5, 5, 5));
        EM.set(bouy, bouyDef);
        EM.set(bouy, RenderableConstructDef, res.ld53Meshes.ball.proto);
        EM.set(bouy, ColorDef, ENDESGA16.lightGreen);
        buoys.push(bouy);
      }
    }
    // console.dir(buoys);
    const _t1 = V3.mk();
    const _t2 = V3.mk();
    EM.addSystem(
      "shipBouyancy",
      Phase.GAME_WORLD,
      [bouyDef, PositionDef, UVPosDef],
      [OceanDef],
      (es, res) => {
        // TODO(@darzu): unify with UV ship stuff?
        if (!es.length) return;
        // const [ship] = es;
        const { ocean } = res;

        // console.log("running bouyancy");
        let i = 0;
        for (let bouy of es) {
          // const uv = V(0.5, 0.5);
          const uv = bouy.uvPos;
          uvToPos(uv, bouy.position);
          // console.log(`uv ${vec2Dbg(uv)} -> xyz ${vec3Dbg(bouy.position)}`);
          // const p = ocean.uvToPos(bouy.position, uv);
          // p[0] = p[0] * worldUnitPerOceanVerts - WORLD_HEIGHT * 0.5;
          // p[2] = p[2] * worldUnitPerOceanVerts - WORLD_WIDTH * 0.5;
          let disp = _t1;
          ocean.uvToGerstnerDispAndNorm(disp, _t2, uv);
          V3.add(bouy.position, disp, bouy.position);
          // console.log(vec3Dbg(bouy.position));

          i++;
        }
      }
    );
  }

  // wait for the ship either locally or from the network
  EM.whenSingleEntity(LD52ShipDef, HasRudderDef, FinishedDef).then(
    async (ship) => {
      // player
      if (!DBG_PLAYER) {
        const color = res.me.host ? tV(0.1, 0.1, 0.1) : ENDESGA16.darkBrown;

        const player = await createLd53PlayerAsync(ship.id, color);

        // player.physicsParent.id = ship.id;

        // teleporting player to rudder
        const rudder = ship.hasRudder.rudder;
        V3.copy(player.position, rudder.position);
        player.position[2] = 1.45;
        if (!res.me.host) {
          player.position[1] += 4 * res.me.pid;
        }
        EM.set(player, TeleportDef);

        if (res.me.host) {
          // vec3.set(0, 3, -1, player.position);
          assert(CameraFollowDef.isOn(rudder));
          assert(TurretDef.isOn(rudder));
          assert(AuthorityDef.isOn(rudder));
          raiseManTurret(player, rudder);
        } else {
          player.position[1] += 5;
        }
      }
    }
  );

  const { text } = await EM.whenResources(TextDef);
  text.lowerText = "W/S: unfurl/furl sail, A/D: turn, E: drop rudder";
  if (DBG_PLAYER) text.lowerText = "";
  // Spawn towers
  // {
  //   const tower3DPoses = level.levelMap.towers.map((tPos) =>
  //     level2DtoWorld3D(
  //       tPos,
  //       20, // TODO(@darzu): lookup from heightmap?
  //       vec3.screate()
  //     )
  //   );
  //   await startTowers(tower3DPoses);
  // }

  // world gizmo
  if (DBG_PLAYER) addWorldGizmo(V(-WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, 0), 100);

  // // debugging createGraph3D
  // let data: V3[][] = [];
  // for (let x = 0; x < 12; x++) {
  //   data[x] = [];
  //   for (let z = 0; z < 7; z++) {
  //     data[x][z] = V(x, x + z, z);
  //   }
  // }
  // createGraph3D(vec3.add(worldGizmo.position, [50, 10, 50], V(0, 0, 0)), data);

  // BULLET STUFF
  EM.addSystem(
    "breakBullets",
    Phase.GAME_WORLD,
    [
      BulletDef,
      ColorDef,
      WorldFrameDef,
      // LinearVelocityDef
      ParametricDef,
    ],
    [],
    (es, res) => {
      for (let b of es) {
        if (b.bullet.health <= 0) {
          breakBullet(b);
        }
      }
    }
  );

  // dead bullet maintenance
  // NOTE: this must be called after any system that can create dead bullets but
  //   before the rendering systems.
  EM.addSystem(
    "deadBullets",
    Phase.POST_GAME_WORLD,
    [BulletDef, PositionDef, DeadDef, RenderableDef],
    [],
    (es, _) => {
      for (let e of es) {
        if (e.dead.processed) continue;

        e.bullet.health = 10;
        V3.set(0, 0, -100, e.position);
        e.renderable.hidden = true;

        e.dead.processed = true;
      }
    }
  );

  // await landPromise;

  // TODO(@darzu): MULTIPLAYER. add this milestone back in.
  // dbgLogMilestone("Game playable");
}

const { Ld53PlayerPropsDef, Ld53PlayerLocalDef, createLd53PlayerAsync } =
  defineNetEntityHelper({
    name: "ld53Player",
    defaultProps: () => ({ parentId: 0, color: V(0, 0, 0) }),
    updateProps: (p, parentId: number, color: V3.InputT) => {
      p.parentId = parentId;
      V3.copy(p.color, color);
      return p;
    },
    serializeProps: (o, buf) => {
      buf.writeUint32(o.parentId);
      buf.writeVec3(o.color);
    },
    deserializeProps: (o, buf) => {
      o.parentId = buf.readUint32();
      buf.readVec3(o.color);
    },
    defaultLocal: () => {},
    dynamicComponents: [PositionDef, RotationDef],
    buildResources: [LD53MeshesDef, MeDef],
    build: (p, res) => {
      if (p.authority.pid === res.me.pid) {
        EM.set(p, ControllableDef);
        p.controllable.modes.canFall = false;
        p.controllable.modes.canJump = false;

        p.controllable.speed *= 3.0;
        p.controllable.sprintMul = 0.2;

        // g.controllable.modes.canYaw = true;
        // g.controllable.modes.canPitch = true;

        EM.set(p, CameraFollowDef, 1);
        // setCameraFollowPosition(p, "firstPerson");
        // setCameraFollowPosition(p, "thirdPerson");

        // vec3.copy(p.position, [-28.11, -28.39, 26.0]);
        // quat.copy(p.rotation, [0.0, -0.94, 0.0, 0.34]);
        V3.copy(p.cameraFollow.positionOffset, [0.0, -5.0, 2.0]);
        p.cameraFollow.yawOffset = 0.0;
        p.cameraFollow.pitchOffset = 0.0; // -0.593;

        EM.ensureResource(LocalPlayerEntityDef, p.id);

        // TODO(@darzu): REFACTOR. dont use HsPlayerDef?
        // EM.set(p, HsPlayerDef);
      }

      EM.set(p, MotionSmoothingDef);

      // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
      // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
      EM.set(p, LinearVelocityDef);

      // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, p.rotation);
      const sphereMesh = cloneMesh(res.ld53Meshes.ball.mesh);
      const visible = true;
      EM.set(p, RenderableConstructDef, sphereMesh, visible);
      EM.set(p, ColorDef, p.ld53PlayerProps.color);
      // EM.set(b2, PositionDef, [0, 0, -1.2]);
      EM.set(p, WorldFrameDef);
      // EM.set(b2, PhysicsParentDef, g.id);
      EM.set(p, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.ld53Meshes.ball.aabb,
      });

      EM.set(p, PhysicsParentDef, p.ld53PlayerProps.parentId);

      EM.set(p, CanManDef);

      return p;
    },
  });

EM.addEagerInit([Ld53PlayerPropsDef], [], [], () => {
  // EM.addSystem(
  //   "playerDbg",
  //   Phase.GAME_PLAYERS,
  //   [Ld53PlayerPropsDef, WorldFrameDef, PhysicsParentDef],
  //   [],
  //   (players) => {
  //     for (let p of players) {
  //       // TODO(@darzu): DEBUGGING!
  //       if (dbgOnce(`playerDbg${p.id}-parent${p.physicsParent.id}`)) {
  //         console.log(`player ${p.id} at: ${vec3Dbg(p.world.position)}`);
  //         console.log(`player ${p.id} parent: ${p.physicsParent.id}`);
  //       }
  //     }
  //   }
  // );
  EM.addSystem(
    "ld53PlayerControl",
    Phase.GAME_PLAYERS,
    [ControllableDef],
    [InputsDef],
    (players, { inputs }) => {
      const cheat = !!EM.getResource(DevConsoleDef)?.showConsole;
      for (let p of players) {
        // determine modes
        p.controllable.modes.canSprint = true;

        if (CanManDef.isOn(p) && p.canMan.manning) {
          p.controllable.modes.canMove = false;
          p.controllable.modes.canPitch = false;
          p.controllable.modes.canYaw = false;
        } else {
          p.controllable.modes.canMove = true;
          p.controllable.modes.canPitch = true;
          p.controllable.modes.canYaw = true;
        }

        if (!cheat) {
          p.controllable.modes.canFall = true;
          p.controllable.modes.canFly = false;
          p.controllable.modes.canJump = false;
        }

        if (cheat && inputs.keyClicks["f"]) {
          p.controllable.modes.canFly = !p.controllable.modes.canFly;
        }

        if (p.controllable.modes.canFly) {
          p.controllable.modes.canFall = false;
          p.controllable.modes.canJump = false;
        } else if (cheat) {
          p.controllable.modes.canFall = true;
          p.controllable.modes.canJump = true;
        }
      }
    }
  );
});

const terraVertsPerWorldUnit = 0.25;
const worldUnitPerTerraVerts = 1 / terraVertsPerWorldUnit;
const terraXCount = Math.floor(WORLD_WIDTH * terraVertsPerWorldUnit);
const terraYCount = Math.floor(WORLD_HEIGHT * terraVertsPerWorldUnit);
let terraMesh: Mesh | undefined = undefined;
let terraEnt: EntityW<[typeof RenderableDef]> | undefined = undefined;
async function resetLand() {
  const res = await EM.whenResources(RendererDef);

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
  function sampleTerra(worldX: number, worldY: number) {
    let xi = ((worldX + WORLD_WIDTH * 0.5) / WORLD_WIDTH) * terraReader.size[0];
    let yi =
      ((worldY + WORLD_HEIGHT * 0.5) / WORLD_HEIGHT) * terraReader.size[1];
    // xi = clamp(xi, 0, terraReader.size[0]);
    // yi = clamp(yi, 0, terraReader.size[1]);
    const height = terraReader.sample(xi, yi) / 256;
    // console.log(`xi: ${xi}, yi: ${yi} => ${height}`);
    return height;
  }

  // height map
  if (!terraMesh) {
    terraMesh = createFlatQuadMesh(terraXCount, terraYCount);

    // TODO(@darzu): seperate chunks of land

    // console.log(`heightmap minY: ${minY}`);
    const hm = EM.mk();
    EM.set(hm, RenderableConstructDef, terraMesh, !DBG_HIDE_LAND);
    EM.set(hm, PositionDef);
    // TODO(@darzu): maybe do a sable-like gradient accross the terrain, based on view dist or just uv?
    // EM.set(hm, ColorDef, V(0.4, 0.2, 0.2));
    EM.set(hm, ColorDef, ENDESGA16.lightGray);
    const hm2 = await EM.whenEntityHas(hm, RenderableDef);
    terraEnt = hm2;
  } else {
    resetFlatQuadMesh(terraXCount, terraYCount, terraMesh);
  }

  // let minY = Infinity;
  terraMesh.pos.forEach((p, i) => {
    // console.log("i: " + vec3Dbg(p));
    // vec3.zero(p);
    // TODO(@darzu): very weird to read from mesh x/z here
    const x = p[0] * worldUnitPerTerraVerts - WORLD_WIDTH * 0.5;
    const y = p[1] * worldUnitPerTerraVerts - WORLD_HEIGHT * 0.5;
    let z = sampleTerra(x, y) * 100.0;
    // minY = Math.min(minY, y);

    // TODO(@darzu): wierd hack for shorline:
    if (z <= 1.0) z = -30;

    z += Math.random() * 2.0; // TODO(@darzu): jitter for less uniform look?

    p[0] = x;
    p[1] = y;
    p[2] = z;
    // console.log("o: " + vec3Dbg(p));
    // if (i > 10) throw "stop";
  });

  // submit verts to GPU
  res.renderer.renderer.stdPool.updateMeshVertices(
    terraEnt!.renderable.meshHandle,
    terraMesh
  );

  const landRes = EM.ensureResource(LandDef);
  landRes.sample = sampleTerra; // TODO(@darzu): hacky..
}
