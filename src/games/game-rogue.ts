import { CameraDef, CameraFollowDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef, DeletedDef } from "../delete.js";
import { createRef } from "../em_helpers.js";
import { EM, Entity, EntityManager, EntityW } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import { AudioDef, randChordId } from "../audio.js";
import {
  createAABB,
  copyAABB,
  AABB,
  updateAABBWithPoint,
  aabbCenter,
} from "../physics/broadphase.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
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
  getHalfsizeFromAABB,
  Mesh,
  scaleMesh3,
  transformMesh,
  validateMesh,
} from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderDataStdDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { TimeDef } from "../time.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  createWoodHealth,
  getBoardsFromMesh,
  registerDestroyPirateHandler,
  reserveSplinterSpace,
  resetWoodHealth,
  resetWoodState,
  SplinterParticleDef,
  TimberBuilder,
  unshareProvokingForWood,
  verifyUnsharedProvokingForWood,
  WoodHealthDef,
  WoodStateDef,
  _numSplinterEnds,
} from "../wood.js";
import { AssetsDef, BLACK } from "../assets.js";
import {
  breakBullet,
  BulletConstructDef,
  BulletDef,
  fireBullet,
} from "./bullet.js";
import { ControllableDef } from "./controllable.js";
import { createGhost, GhostDef } from "./ghost.js";
import { GravityDef } from "./gravity.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { LifetimeDef } from "./lifetime.js";
import { createPlayer, LocalPlayerDef, PlayerDef } from "./player.js";
import { TextDef } from "./ui.js";
import { createIdxPool } from "../idx-pool.js";
import { randNormalPosVec3, randNormalVec3 } from "../utils-3d.js";
import { createHomeShip } from "./shipyard.js";
import { gameplaySystems } from "./ghost.js";

/*
  Game mechanics:
  [ ] Planks can be repaired
  [ ] Two decks?

  Wood:
  [ ] Shipbuilding file, 
    [ ] ∞ system refinement
  [ ] Reproduce fang-ship
  [ ] Dock
  [ ] Small objs:
    [ ] shelf     [ ] crate     [ ] figure head   [ ] bunk
    [ ] table     [ ] barrel    [ ] bucket        [ ] small boat
    [ ] ladder    [ ] wheel     [ ] chest         [ ] cannon ball holder
    [ ] hoist     [ ] hatch     [ ] dingy         [ ] padel
    [ ] mallet    [ ] stairs    [ ] picture frame [ ] lattice
    [ ] drawer    [ ] cage      [ ] fiddle        [ ] club
    [ ] port hole [ ] door      [ ] counter       [ ] cabinet
    [ ] 
  [ ] paintable
  [ ] in-sprig modeling

  "Physically based modeling" (lol):
    [ ] metal (bends nicely)
      [ ] barrel bands    [ ] nails     [ ] hinge [ ] latch
    [ ] rope
      [ ] pullies         [ ] knots     [ ] coils
      [ ] anchor rope     [ ] nets
    [ ] clay (breaks nicely)
      [ ] pots
    [ ] cloth: leather, canvas,
    [ ] stone: walls, bridges, towers, castle
    [ ] brick: paths, walls, furnace/oven/..., 
    [ ] plants!: trees, grass, tomatoes, ivy
  
  [ ] PERF, huge: GPU-based culling

  [ ] change wood colors
  [ ] adjust ship size
  [ ] add dark/fog ends
*/

const DBG_PLAYER = true;

let pirateKills = 0;
let healthPercent = 100;

const MAX_GOODBALLS = 10;

const pitchSpeed = 0.000042;

const maxPirates = DBG_PLAYER ? 3 : 10;

const numStartPirates = DBG_PLAYER ? maxPirates : 2;
let nextSpawn = 0;

const tenSeconds = 1000 * (DBG_PLAYER ? 3 : 10);

let spawnTimer = tenSeconds;
const minSpawnTimer = 3000;

export const LD51CannonDef = EM.defineComponent("ld51Cannon", () => {
  return {};
});

export async function initRogueGame(em: EntityManager, hosting: boolean) {
  const res = await em.whenResources(
    AssetsDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const sunlight = em.new();
  em.ensureComponentOn(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.4, 0.4, 0.4]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.ensureComponentOn(sunlight, PositionDef, V(50, 100, 10));
  em.ensureComponentOn(sunlight, RenderableConstructDef, res.assets.ball.proto);

  // const c = res.globalCursor3d.cursor()!;
  // if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const ground = em.new();
  const groundMesh = cloneMesh(res.assets.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -2, 0], [20, 2, 20])
  );
  em.ensureComponentOn(ground, RenderableConstructDef, groundMesh);
  em.ensureComponentOn(ground, ColorDef, ENDESGA16.blue);
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(ground, PositionDef, V(0, 0, 0));
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // const cube = em.newEntity();
  // const cubeMesh = cloneMesh(res.assets.cube.mesh);
  // em.ensureComponentOn(cube, RenderableConstructDef, cubeMesh);
  // em.ensureComponentOn(cube, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(cube, PositionDef, [0, 0, 3]);
  // em.ensureComponentOn(cube, RotationDef);
  // em.ensureComponentOn(cube, AngularVelocityDef, [0, 0.001, 0.001]);
  // em.ensureComponentOn(cube, WorldFrameDef);
  // em.ensureComponentOn(cube, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.cube.aabb,
  // });

  // em.ensureComponentOn(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  // TODO(@darzu): timber system here!
  // const sphereMesh = cloneMesh(res.assets.ball.mesh);
  // const visible = false;
  // em.ensureComponentOn(_player, RenderableConstructDef, sphereMesh, visible);
  // em.ensureComponentOn(_player, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(_player, PositionDef, [0, 0, 0]);
  // // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
  // em.ensureComponentOn(_player, WorldFrameDef);
  // // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
  // em.ensureComponentOn(_player, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.ball.aabb,
  // });
  // randomizeMeshColors(b2);

  // em.ensureComponentOn(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  // TIMBER
  const timber = em.new();

  const {
    timberState,
    timberMesh,
    ribCount,
    ribSpace,
    ribWidth,
    ceilHeight,
    floorHeight,
    floorLength,
    floorWidth,
  } = createHomeShip();

  em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
  em.ensureComponentOn(timber, WoodStateDef, timberState);
  em.ensureComponentOn(timber, ColorDef, ENDESGA16.darkBrown);
  // em.ensureComponentOn(timber, ColorDef, [0.1, 0.1, 0.1]);
  // const scale = 1 * Math.pow(0.8, ti);
  const scale = 1;
  const timberAABB = getAABBFromMesh(timberMesh);
  // const timberPos = getCenterFromAABB(timberAABB);
  const timberPos = vec3.create();
  // const timberPos = vec3.clone(res.assets.timber_rib.center);
  // vec3.negate(timberPos, timberPos);
  // vec3.scale(timberPos, timberPos, scale);
  timberPos[1] += 1;
  timberPos[0] -= ribCount * 0.5 * ribSpace;
  // timberPos[2] -= floorPlankCount * 0.5 * floorSpace;
  em.ensureComponentOn(timber, PositionDef, timberPos);
  // em.ensureComponentOn(timber, PositionDef, [0, 0, -4]);
  em.ensureComponentOn(timber, RotationDef);
  em.ensureComponentOn(timber, ScaleDef, V(scale, scale, scale));
  em.ensureComponentOn(timber, WorldFrameDef);
  em.ensureComponentOn(timber, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: timberAABB,
  });
  const timberHealth = createWoodHealth(timberState);
  em.ensureComponentOn(timber, WoodHealthDef, timberHealth);

  // CANNONS
  const realCeilHeight = ceilHeight + timberPos[1];
  const realFloorHeight = timberPos[1] + floorHeight;
  for (let i = 0; i < 2; i++) {
    const isLeft = i === 0 ? 1 : -1;
    const cannon = em.new();
    em.ensureComponentOn(
      cannon,
      RenderableConstructDef,
      res.assets.ld51_cannon.proto
    );
    em.ensureComponentOn(
      cannon,
      PositionDef,
      V(-7.5, realFloorHeight + 2, -4 * isLeft)
    );
    em.ensureComponentOn(cannon, RotationDef);
    quat.rotateX(cannon.rotation, Math.PI * 0.01 * isLeft, cannon.rotation);
    if (isLeft !== 1) {
      quat.rotateY(cannon.rotation, Math.PI, cannon.rotation);
    }
    em.ensureComponentOn(cannon, ColorDef, ENDESGA16.darkGreen);
    // TODO(@darzu): USE PALETTE PROPERLY
    // TODO(@darzu): USE PALETTE PROPERLY
    vec3.scale(cannon.color, 0.5, cannon.color);
    {
      const interactBox = EM.new();
      const interactAABB = copyAABB(createAABB(), res.assets.ld51_cannon.aabb);
      vec3.scale(interactAABB.min, 2, interactAABB.min);
      vec3.scale(interactAABB.max, 2, interactAABB.max);
      EM.ensureComponentOn(interactBox, PhysicsParentDef, cannon.id);
      EM.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
      EM.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(cannon, InteractableDef, interactBox.id);
    }
    em.ensureComponentOn(cannon, LD51CannonDef);
  }

  // TODO(@darzu): use a pool for goodballs
  const GoodBallDef = EM.defineComponent(
    "goodBall",
    (idx: number, interactBoxId: number) => ({
      idx,
      interactBoxId,
    })
  );
  const _goodBalls: EntityW<
    [
      typeof PositionDef,
      typeof GravityDef,
      typeof LinearVelocityDef,
      typeof GoodBallDef
    ]
  >[] = [];
  const _goodBallPool = createIdxPool(MAX_GOODBALLS);
  function despawnGoodBall(e: EntityW<[typeof GoodBallDef]>) {
    em.ensureComponentOn(e, DeadDef);
    if (RenderableDef.isOn(e)) e.renderable.hidden = true;
    _goodBallPool.free(e.goodBall.idx);
    e.dead.processed = true;
  }
  function spawnGoodBall(pos: vec3) {
    const idx = _goodBallPool.next();
    if (idx === undefined) return;

    let ball = _goodBalls[idx];

    if (!ball) {
      const newBall = em.new();
      em.ensureComponentOn(
        newBall,
        RenderableConstructDef,
        res.assets.ball.proto
      );
      em.ensureComponentOn(newBall, ColorDef, ENDESGA16.orange);
      em.ensureComponentOn(newBall, PositionDef);
      em.ensureComponentOn(newBall, LinearVelocityDef);
      em.ensureComponentOn(newBall, GravityDef);
      const interactBox = EM.new();
      const interactAABB = copyAABB(createAABB(), res.assets.ball.aabb);
      vec3.scale(interactAABB.min, 2, interactAABB.min);
      vec3.scale(interactAABB.max, 2, interactAABB.max);
      EM.ensureComponentOn(interactBox, PhysicsParentDef, newBall.id);
      EM.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
      EM.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(newBall, InteractableDef, interactBox.id);
      // em.ensureComponentOn(ball, WorldFrameDef);
      em.ensureComponentOn(newBall, GoodBallDef, idx, interactBox.id);

      ball = newBall;
      _goodBalls[idx] = newBall;
    } else {
      if (RenderableDef.isOn(ball)) ball.renderable.hidden = false;
      em.tryRemoveComponent(ball.id, DeadDef);
      em.tryRemoveComponent(ball.id, PhysicsParentDef);
      em.ensureComponentOn(ball, InteractableDef, ball.goodBall.interactBoxId);
    }

    vec3.copy(ball.position, pos);
    vec3.copy(ball.gravity, [0, -3, 0]);
    vec3.zero(ball.linearVelocity);
    if (ScaleDef.isOn(ball)) vec3.copy(ball.scale, vec3.ONES);
  }

  em.registerSystem(
    [LD51CannonDef, WorldFrameDef, InRangeDef],
    [InputsDef, LocalPlayerDef, AudioDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (
          player.player.holdingBall &&
          c.inRange &&
          res.inputs.lclick /* && c.cannonLocal.fireMs <= 0*/
        ) {
          const ballHealth = 2.0;

          let bulletAxis = V(0, 0, -1);
          vec3.transformQuat(bulletAxis, c.world.rotation, bulletAxis);
          vec3.normalize(bulletAxis, bulletAxis);
          const bulletPos = vec3.clone(c.world.position);
          vec3.scale(bulletAxis, 2, bulletAxis);
          vec3.add(bulletPos, bulletAxis, bulletPos);

          fireBullet(
            em,
            1,
            bulletPos,
            c.world.rotation,
            0.05,
            0.02,
            3,
            ballHealth
          );

          // remove player ball
          const heldBall = EM.findEntity(player.player.holdingBall, [
            GoodBallDef,
          ]);
          if (heldBall) {
            despawnGoodBall(heldBall);
          }

          player.player.holdingBall = 0;

          // c.cannonLocal.fireMs = c.cannonLocal.fireDelayMs;

          const chord = randChordId();
          res.music.playChords([chord], "major", 2.0, 3.0, -2);
        }
      }
    },
    "ld51PlayerFireCannon"
  );
  EM.requireGameplaySystem("ld51PlayerFireCannon");

  const splinterObjId = 7654;
  em.registerSystem(
    [
      SplinterParticleDef,
      LinearVelocityDef,
      AngularVelocityDef,
      GravityDef,
      PositionDef,
      RotationDef,
      RenderDataStdDef,
    ],
    [],
    (splinters, res) => {
      for (let s of splinters) {
        if (s.position[1] <= 0) {
          // TODO(@darzu): zero these instead of remove?
          em.removeComponent(s.id, LinearVelocityDef);
          em.removeComponent(s.id, GravityDef);
          em.removeComponent(s.id, AngularVelocityDef);

          s.position[1] = 0;
          quat.identity(s.rotation);
          quat.rotateX(s.rotation, Math.PI * 0.5, s.rotation);
          quat.rotateZ(s.rotation, Math.PI * Math.random(), s.rotation);
          s.renderDataStd.id = splinterObjId; // stops z-fighting
          // console.log("freeze!");
        }
      }
    },
    "splintersOnFloor"
  );
  EM.requireGameplaySystem("splintersOnFloor");

  // const quadIdsNeedReset = new Set<number>();

  // assert(_player?.collider.shape === "AABB");
  // console.dir(ghost.collider.aabb);

  const BUSY_WAIT = 20.0;

  em.registerSystem(
    [GhostDef, WorldFrameDef, ColliderDef],
    [InputsDef, CanvasDef],
    async (ps, { inputs, htmlCanvas }) => {
      if (!ps.length) return;

      const ghost = ps[0];

      if (!htmlCanvas.hasFirstInteraction) return;

      // if (BUSY_WAIT) {
      //   let before = performance.now();
      //   const mat = mat4.create();
      //   while (performance.now() - before < BUSY_WAIT) {
      //     mat4.mul(mat, mat, mat);
      //   }
      //   // console.log(before);
      // }

      if (inputs.keyDowns["t"] && BUSY_WAIT) {
        let before = performance.now();
        const mat = mat4.create();
        while (performance.now() - before < BUSY_WAIT) {
          mat4.mul(mat, mat, mat);
        }
      }

      if (inputs.lclick) {
        // console.log(`fire!`);
        const firePos = ghost.world.position;
        const fireDir = quat.create();
        quat.copy(fireDir, ghost.world.rotation);
        const ballHealth = 2.0;
        fireBullet(em, 1, firePos, fireDir, 0.05, 0.02, 3, ballHealth);
      }

      if (inputs.keyClicks["r"]) {
        const timber2 = await em.whenEntityHas(timber, RenderableDef);
        resetWoodHealth(timber.woodHealth);
        resetWoodState(timber.woodState);
        res.renderer.renderer.stdPool.updateMeshQuads(
          timber2.renderable.meshHandle,
          timber.woodState.mesh as Mesh,
          0,
          timber.woodState.mesh.quad.length
        );
      }
    },
    "ld51Ghost"
  );
  if (DBG_PLAYER) EM.requireGameplaySystem("ld51Ghost");

  // TODO(@darzu): breakBullet
  em.registerSystem(
    [BulletDef, ColorDef, WorldFrameDef, LinearVelocityDef],
    [],
    (es, res) => {
      for (let b of es) {
        if (b.bullet.health <= 0) {
          breakBullet(b);
        }
      }
    },
    "breakBullets"
  );
  EM.requireGameplaySystem("breakBullets");

  // Create player
  {
    const ColWallDef = em.defineComponent("ColWall", () => ({}));

    // create ship bounds
    // TODO(@darzu): move into shipyard?
    const colFloor = em.new();
    const flAABB: AABB = {
      // prettier-ignore
      min: vec3.clone([
    -floorLength * 0.5 - ribWidth * 3.0,
    0,
    -floorWidth * 0.5
]),
      max: vec3.clone([
        +floorLength * 0.5 - ribWidth * 3.0,
        realFloorHeight,
        +floorWidth * 0.5,
      ]),
    };
    em.ensureComponentOn(colFloor, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: flAABB,
    });
    em.ensureComponentOn(colFloor, PositionDef);
    em.ensureComponentOn(colFloor, ColWallDef);

    const colLeftWall = em.new();
    em.ensureComponentOn(colLeftWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: vec3.clone([
          flAABB.min[0],
          realFloorHeight + 0.5,
          flAABB.min[2] - 2,
        ]),
        max: V(flAABB.max[0], realCeilHeight, flAABB.min[2]),
      },
    });
    em.ensureComponentOn(colLeftWall, PositionDef);
    em.ensureComponentOn(colLeftWall, ColWallDef);

    const colRightWall = em.new();
    em.ensureComponentOn(colRightWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: V(flAABB.min[0], realFloorHeight + 0.5, flAABB.max[2]),
        max: V(flAABB.max[0], realCeilHeight, flAABB.max[2] + 2),
      },
    });
    em.ensureComponentOn(colRightWall, PositionDef);
    em.ensureComponentOn(colRightWall, ColWallDef);

    const colFrontWall = em.new();
    em.ensureComponentOn(colFrontWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: vec3.clone([
          flAABB.max[0],
          realFloorHeight + 0.5,
          flAABB.min[2] + 0.5,
        ]),
        max: vec3.clone([
          flAABB.max[0] + 2,
          realCeilHeight,
          flAABB.max[2] - 0.5,
        ]),
      },
    });
    em.ensureComponentOn(colFrontWall, PositionDef);
    em.ensureComponentOn(colFrontWall, ColWallDef);

    const colBackWall = em.new();
    em.ensureComponentOn(colBackWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: vec3.clone([
          flAABB.min[0] - 2,
          realFloorHeight + 0.5,
          flAABB.min[2] + 0.5,
        ]),
        max: V(flAABB.min[0], realCeilHeight, flAABB.max[2] - 0.5),
      },
    });
    em.ensureComponentOn(colBackWall, PositionDef);
    em.ensureComponentOn(colBackWall, ColWallDef);

    // debugVizAABB(colFloor);
    // debugVizAABB(colLeftWall);
    // debugVizAABB(colRightWall);
    // debugVizAABB(colFrontWall);
    // debugVizAABB(colBackWall);

    function debugVizAABB(aabbEnt: EntityW<[typeof ColliderDef]>) {
      // debug render floor
      const mesh = cloneMesh(res.assets.cube.mesh);
      assert(aabbEnt.collider.shape === "AABB");
      const size = getHalfsizeFromAABB(aabbEnt.collider.aabb);
      const center = aabbCenter(tempVec3(), aabbEnt.collider.aabb);
      scaleMesh3(mesh, size);
      transformMesh(mesh, mat4.fromTranslation(center));
      em.ensureComponentOn(aabbEnt, RenderableConstructDef, mesh);
      em.ensureComponentOn(aabbEnt, ColorDef, ENDESGA16.orange);
    }

    // BULLET VS COLLIDERS
    {
      const colLeftMid = aabbCenter(
        vec3.create(),
        (colLeftWall.collider as AABBCollider).aabb
      );
      const colRightMid = aabbCenter(
        vec3.create(),
        (colRightWall.collider as AABBCollider).aabb
      );
      const colFrontMid = aabbCenter(
        vec3.create(),
        (colFrontWall.collider as AABBCollider).aabb
      );
      const colBackMid = aabbCenter(
        vec3.create(),
        (colBackWall.collider as AABBCollider).aabb
      );

      em.registerSystem(
        [
          BulletConstructDef,
          BulletDef,
          ColorDef,
          LinearVelocityDef,
          GravityDef,
          WorldFrameDef,
        ],
        [PhysicsResultsDef],
        (es, res) => {
          for (let b of es) {
            if (b.bulletConstruct.team !== 2) continue;
            const hits = res.physicsResults.collidesWith.get(b.id);
            if (hits) {
              const walls = hits
                .map((h) => em.findEntity(h, [ColWallDef, WorldFrameDef]))
                .filter((b) => {
                  return b;
                });
              if (walls.length) {
                const targetSide =
                  vec3.sqrDist(b.bulletConstruct.location, colRightMid) >
                  vec3.sqrDist(b.bulletConstruct.location, colLeftMid)
                    ? colRightWall
                    : colLeftWall;
                const targetFrontBack =
                  vec3.sqrDist(b.bulletConstruct.location, colFrontMid) >
                  vec3.sqrDist(b.bulletConstruct.location, colBackMid)
                    ? colFrontWall
                    : colBackWall;

                for (let w of walls) {
                  assert(w);
                  if (w.id === targetSide.id || w.id === targetFrontBack.id) {
                    vec3.zero(b.linearVelocity);
                    vec3.zero(b.gravity);
                    if (_goodBallPool.numFree() > 0) {
                      // em.ensureComponentOn(b, DeletedDef);
                      em.ensureComponentOn(b, DeadDef);
                      spawnGoodBall(b.world.position);
                    } else {
                      breakBullet(b);
                    }
                  }
                }
              }
            }
          }
        },
        "bulletBounce"
      );
      EM.requireGameplaySystem("bulletBounce");
    }

    // dead bullet maintenance
    // NOTE: this must be called after any system that can create dead bullets but
    //   before the rendering systems.
    em.registerSystem(
      [BulletDef, PositionDef, DeadDef, RenderableDef],
      [],
      (es, _) => {
        for (let e of es) {
          if (e.dead.processed) continue;

          e.bullet.health = 10;
          vec3.set(0, -100, 0, e.position);
          e.renderable.hidden = true;

          e.dead.processed = true;
        }
      },
      "deadBullets"
    );
    EM.requireGameplaySystem("deadBullets");

    // starter ammo
    {
      assert(colFloor.collider.shape === "AABB");
      for (let i = 0; i < 3; i++) {
        const pos: vec3 = vec3.clone([
          colFloor.collider.aabb.max[0] - 2,
          colFloor.collider.aabb.max[1] + 2,
          colFloor.collider.aabb.max[2] - 2 * i - 3,
        ]);
        spawnGoodBall(pos);
      }
    }

    em.registerSystem(
      [GoodBallDef, PositionDef, GravityDef, LinearVelocityDef],
      [],
      (es, res) => {
        // TODO(@darzu):
        for (let ball of es) {
          if (PhysicsParentDef.isOn(ball)) continue; // being held
          if (ball.position[1] <= realFloorHeight + 1) {
            ball.position[1] = realFloorHeight + 1;
            vec3.zero(ball.linearVelocity);
            vec3.zero(ball.gravity);
          }
        }
      },
      "fallingGoodBalls"
    );
    EM.requireGameplaySystem("fallingGoodBalls");

    em.registerSystem(
      [GoodBallDef, InteractableDef, InRangeDef, PositionDef],
      [InputsDef, LocalPlayerDef],
      (es, res) => {
        const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
        if (!player) return;
        if (player.player.holdingBall) return;
        // TODO(@darzu):
        if (res.inputs.lclick) {
          for (let ball of es) {
            if (PhysicsParentDef.isOn(ball)) continue;
            // pick up this ball
            player.player.holdingBall = ball.id;
            em.ensureComponentOn(ball, PhysicsParentDef, player.id);
            vec3.set(0, 0, -1, ball.position);
            em.ensureComponentOn(ball, ScaleDef);
            vec3.copy(ball.scale, [0.8, 0.8, 0.8]);
            em.removeComponent(ball.id, InteractableDef);
          }
        }
      },
      "pickUpBalls"
    );
    EM.requireGameplaySystem("pickUpBalls");

    if (DBG_PLAYER) {
      const g = createGhost();
      vec3.copy(g.position, [0, 1, -1.2]);
      quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
      g.cameraFollow.positionOffset = V(0, 0, 5);
      g.controllable.speed *= 0.5;
      g.controllable.sprintMul = 10;
      const sphereMesh = cloneMesh(res.assets.ball.mesh);
      const visible = false;
      em.ensureComponentOn(g, RenderableConstructDef, sphereMesh, visible);
      em.ensureComponentOn(g, ColorDef, V(0.1, 0.1, 0.1));
      em.ensureComponentOn(g, PositionDef, V(0, 0, 0));
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
    }

    if (!DBG_PLAYER) {
      const _player = createPlayer(em);
      vec3.set(-10, realFloorHeight + 6, 0, _player.playerProps.location);
      em.whenEntityHas(
        _player,
        PositionDef,
        RotationDef,
        CameraFollowDef,
        ControllableDef,
        ColliderDef
      ).then((player) => {
        Object.assign(player.controllable.modes, {
          canCameraYaw: false,
          canFall: true,
          // canFly: true,
          canFly: false,
          canJump: false,
          canMove: true,
          canPitch: true,
          canSprint: true,
          canYaw: true,
        });
        quat.rotateY(player.rotation, Math.PI * 0.5, player.rotation);

        player.collider.solid = true;
        // player.cameraFollow.positionOffset = [0, 0, 5];
        // g.controllable.modes.canYaw = false;
        // g.controllable.modes.canCameraYaw = true;
        // g.controllable.modes.canPitch = true;
        // player.controllable.speed *= 0.5;
        // player.controllable.sprintMul = 10;
      });
    }
  }

  startPirates();

  const startHealth = getCurrentHealth();
  {
    em.registerSystem(
      [],
      [InputsDef, TextDef, TimeDef, AudioDef],
      (es, res) => {
        // const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
        // if (!player) return;

        const currentHealth = getCurrentHealth();
        healthPercent = (currentHealth / startHealth) * 100;
        // console.log(`healthPercent: ${healthPercent}`);

        const elapsed = nextSpawn - res.time.time;
        const elapsedPer = Math.min(Math.ceil((elapsed / spawnTimer) * 10), 10);

        res.text.upperText = `Hull %${healthPercent.toFixed(
          1
        )}, Kills ${pirateKills}, !${elapsedPer}`;

        if (DBG_PLAYER) {
          // res.text.lowerText = `splinterEnds: ${_numSplinterEnds}, goodballs: ${_numGoodBalls}`;
          res.text.lowerText = ``;
          res.text.lowerText += `Time: ${(res.time.time / 1000).toFixed(1)}s`;
          res.text.lowerText += ` `;
          res.text.lowerText += `Strings: ${res.music.state?._stringPool.numFree()}`;
        } else {
          res.text.lowerText = `WASD+Shift; left click to pick up cannon balls and fire the cannons. Survive! They attack like clockwork.`;
        }

        if (healthPercent < 20) {
          alert(
            `You've been sunk! You killed ${pirateKills} and lasted ${(
              res.time.time / 1000
            ).toFixed(1)} seconds. Thanks for playing! Refresh to try again.`
          );
          gameplaySystems.length = 0;
        }
      },
      "progressGame"
    );
    EM.requireGameplaySystem("progressGame");
  }

  function getCurrentHealth() {
    let health = 0;
    for (let b of timberHealth.boards) {
      for (let s of b) {
        health += s.health;
      }
    }
    return health;
  }
}

export function appendPirateShip(b: TimberBuilder) {
  const firstQuadIdx = b.mesh.quad.length;

  const length = 18;

  b.width = 0.6;
  b.depth = 0.2;

  const xFactor = 0.333;

  const cursor2 = mat4.create();

  mat4.rotateZ(cursor2, Math.PI * 1.5, cursor2);
  mat4.rotateX(cursor2, Math.PI * xFactor, cursor2);
  // mat4.rotateX(b.cursor, b.cursor, Math.PI * -0.3 * 0.5);

  for (let hi = 0; hi < 5; hi++) {
    let numSegs = hi === 0 || hi === 4 ? 6 : 5;
    const midness = 2 - Math.floor(Math.abs(hi - 2));
    const segLen = length / 5 + midness * 0.2;
    mat4.copy(b.cursor, cursor2);
    const aabb: AABB = createAABB();
    const firstVi = b.mesh.pos.length;
    b.addLoopVerts();
    b.addEndQuad(true);
    for (let i = 0; i < numSegs; i++) {
      mat4.translate(b.cursor, [0, segLen, 0], b.cursor);
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5, b.cursor);
      b.addLoopVerts();
      b.addSideQuads();
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5, b.cursor);
    }
    b.addEndQuad(false);

    // TODO(@darzu): hACK?
    // shift wood to center
    for (let vi = firstVi; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      updateAABBWithPoint(aabb, p);
    }
    const mid = aabbCenter(tempVec3(), aabb);
    mid[1] = 0;
    for (let vi = firstVi; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      vec3.sub(p, mid, p);
    }

    mat4.translate(cursor2, [-(b.width * 2.0 + 0.05), 0, 0], cursor2);
  }

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));
  // b.mesh.colors.push(randNormalPosVec3(vec3.create()));

  return b.mesh;
}

const startDelay = 0;
// const startDelay = 1000;

export const PiratePlatformDef = EM.defineComponent(
  "piratePlatform",
  (cannon: Entity) => {
    return {
      cannon: createRef(cannon),
      tiltPeriod: 0,
      tiltTimer: 0,
      lastFire: 0,
      poolIdx: -1, // TODO(@darzu): HACK. this is for object pooling
    };
  }
);

function rotatePiratePlatform(
  p: EntityW<[typeof PositionDef, typeof RotationDef]>,
  rad: number
) {
  vec3.rotateY(p.position, vec3.ZEROS, rad, p.position);
  quat.rotateY(p.rotation, rad, p.rotation);
}

async function startPirates() {
  const em: EntityManager = EM;

  // TODO(@darzu): HACK!
  registerDestroyPirateHandler(destroyPirateShip);

  for (let i = 0; i < numStartPirates; i++) {
    const p = await spawnPirate(i * ((2 * Math.PI) / numStartPirates));
  }

  nextSpawn = spawnTimer;
  em.registerSystem(
    [PiratePlatformDef],
    [TimeDef],
    (ps, res) => {
      const pirateCount = ps.length;
      if (res.time.time > nextSpawn) {
        nextSpawn += spawnTimer;

        // console.log("SPAWN");

        const rad = Math.random() * 2 * Math.PI;
        if (pirateCount < maxPirates) {
          spawnPirate(rad);

          if (pirateCount < 2) {
            spawnPirate(rad + Math.PI);
          }
        }
        spawnTimer *= 0.95;
        spawnTimer = Math.max(spawnTimer, minSpawnTimer);
      }
    },
    "spawnPirates"
  );
  EM.requireGameplaySystem("spawnPirates");

  const fireStagger = 150;
  // const tiltPeriod = 5700;
  em.registerSystem(
    [PiratePlatformDef, PositionDef, RotationDef],
    [TimeDef],
    (ps, res) => {
      // const sinceLastFire = res.time.time - lastFire;
      // let beginFire = sinceLastFire > tenSeconds;
      // if (beginFire) {
      //   console.log("broadside!");
      //   lastFire = res.time.time;
      // }

      let pIdx = 0;
      for (let p of ps) {
        pIdx++;

        // rotate platform
        const R = Math.PI * -0.001;
        rotatePiratePlatform(p, R);

        const c = p.piratePlatform.cannon()!;

        // pitch cannons
        p.piratePlatform.tiltTimer += res.time.dt;
        const upMode =
          p.piratePlatform.tiltTimer % p.piratePlatform.tiltPeriod >
          p.piratePlatform.tiltPeriod * 0.5;
        if (RotationDef.isOn(c)) {
          let r = Math.PI * pitchSpeed * res.time.dt * (upMode ? -1 : 1);
          quat.rotateX(c.rotation, r, c.rotation);
        }

        // fire cannons
        const myTime = res.time.time + pIdx * fireStagger;
        let doFire = myTime - p.piratePlatform.lastFire > spawnTimer;
        if (doFire) {
          p.piratePlatform.lastFire = myTime;
          if (WorldFrameDef.isOn(c)) {
            // console.log(`pirate fire`);

            // TODO(@darzu): DBG!!!!!
            // const ballHealth = 20.0;
            const ballHealth = 2.0;
            fireBullet(
              em,
              2,
              c.world.position,
              c.world.rotation,
              0.05,
              0.02,
              3,
              ballHealth
            );
          }
        }
      }
    },
    "updatePiratePlatforms"
  );
  EM.requireGameplaySystem("updatePiratePlatforms");
}

// TODO(@darzu): this is wierd. should probably just be component on root entity w/ pointer to others
type Pirate = {
  platform: EntityW<
    [typeof PiratePlatformDef, typeof PositionDef, typeof RotationDef]
  >;
  cannon: EntityW<[typeof PositionDef, typeof RotationDef]>;
  timber: EntityW<[typeof WoodHealthDef, typeof WoodStateDef]>;
};
const _pirateData: Pirate[] = [];
const _piratePool = createIdxPool(maxPirates);

async function spawnPirate(rad: number) {
  // console.log("spawnPirate!");
  const em: EntityManager = EM;

  const initialPitch = Math.PI * 0.06;

  const res = await em.whenResources(AssetsDef, RendererDef, TimeDef);

  const pIdx = _piratePool.next();

  if (pIdx === undefined) {
    // console.warn(`Full on pirates!`);
    return;
  }

  if (!_pirateData[pIdx]) {
    // NEW PIRATE

    // make platform
    const platform = em.new();
    em.ensureComponentOn(platform, ColorDef);
    vec3.copy(platform.color, ENDESGA16.deepBrown);
    em.ensureComponentOn(platform, PositionDef);
    em.ensureComponentOn(platform, RotationDef);
    const groundMesh = cloneMesh(res.assets.hex.mesh);
    transformMesh(
      groundMesh,
      mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -1, 0], [4, 1, 4])
    );
    em.ensureComponentOn(platform, RenderableConstructDef, groundMesh);

    // make cannon
    const cannon = em.new();
    em.ensureComponentOn(
      cannon,
      RenderableConstructDef,
      res.assets.ld51_cannon.proto
    );
    em.ensureComponentOn(cannon, PositionDef);
    em.ensureComponentOn(cannon, PhysicsParentDef, platform.id);
    em.ensureComponentOn(cannon, ColorDef, ENDESGA16.darkGray);
    em.ensureComponentOn(cannon, RotationDef);
    vec3.copy(cannon.position, [0, 2, 0]);

    // make timber
    const timber = em.new();
    const _timberMesh = createEmptyMesh("pirateShip");
    const builder = createTimberBuilder(_timberMesh);
    appendPirateShip(builder);
    _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
    const timberState = getBoardsFromMesh(_timberMesh);
    // unshareProvokingForWood(_timberMesh, timberState);
    verifyUnsharedProvokingForWood(_timberMesh, timberState);
    // TODO(@darzu): maybe there shouldn't actually be any unsharing? We should
    //   be able to get it right at construction time.
    // console.log(`before: ` + meshStats(_timberMesh));
    // const timberMesh = normalizeMesh(_timberMesh);
    // console.log(`after: ` + meshStats(timberMesh));
    const timberMesh = _timberMesh as Mesh;
    timberMesh.usesProvoking = true;
    reserveSplinterSpace(timberState, 10);
    em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
    em.ensureComponentOn(timber, WoodStateDef, timberState);
    em.ensureComponentOn(timber, ColorDef, ENDESGA16.red);
    const timberAABB = getAABBFromMesh(timberMesh);
    em.ensureComponentOn(timber, PositionDef, V(0, builder.width, 0));
    em.ensureComponentOn(timber, RotationDef);
    em.ensureComponentOn(timber, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: timberAABB,
    });
    const timberHealth = createWoodHealth(timberState);
    em.ensureComponentOn(timber, WoodHealthDef, timberHealth);
    em.ensureComponentOn(timber, PhysicsParentDef, platform.id);

    // make joint entity
    em.ensureComponentOn(platform, PiratePlatformDef, cannon);

    platform.piratePlatform.poolIdx = pIdx;

    _pirateData[pIdx] = {
      platform,
      cannon,
      timber,
    };
  }

  const p = _pirateData[pIdx];

  // set/reset platform, cannon, and wood properties
  const platform = p.platform;
  const cannon = p.cannon;
  const timber = p.timber;

  // reset timber
  resetWoodHealth(p.timber.woodHealth);
  resetWoodState(p.timber.woodState);
  const timber2 = await em.whenEntityHas(timber, RenderableDef);
  res.renderer.renderer.stdPool.updateMeshQuads(
    timber2.renderable.meshHandle,
    timber.woodState.mesh as Mesh,
    0,
    timber.woodState.mesh.quad.length
  );

  // undead
  em.tryRemoveComponent(platform.id, DeadDef);
  em.tryRemoveComponent(cannon.id, DeadDef);

  if (RenderableDef.isOn(platform)) platform.renderable.hidden = false;
  if (RenderableDef.isOn(cannon)) cannon.renderable.hidden = false;

  vec3.copy(platform.position, [0, 0, 30]);
  quat.identity(platform.rotation);

  const tiltPeriod = 5700 + jitter(3000);
  const tiltTimer = Math.random() * tiltPeriod;

  platform.piratePlatform.lastFire = res.time.time + startDelay;
  platform.piratePlatform.tiltPeriod = tiltPeriod;
  platform.piratePlatform.tiltTimer = tiltTimer;

  quat.identity(cannon.rotation);
  quat.rotateX(cannon.rotation, initialPitch, cannon.rotation);
  // TODO(@darzu): HACK!
  // so they start slightly different pitches
  let initTimer = 0;
  // TODO(@darzu):
  while (initTimer < tiltTimer) {
    initTimer += 16.6666;
    const upMode = initTimer % tiltPeriod > tiltPeriod * 0.5;
    let r = Math.PI * pitchSpeed * 16.6666 * (upMode ? -1 : 1);
    quat.rotateX(cannon.rotation, r, cannon.rotation);
  }

  rotatePiratePlatform(platform, rad);

  return platform;
}

export function destroyPirateShip(id: number, timber: Entity) {
  // TODO(@darzu): impl
  // console.log(`destroy ${id}`);

  // pirateShip
  const e = EM.findEntity(id, [PiratePlatformDef]);
  if (e && !DeadDef.isOn(e)) {
    // dead platform
    EM.ensureComponentOn(e, DeadDef);
    if (RenderableDef.isOn(e)) e.renderable.hidden = true;
    e.dead.processed = true;

    // dead cannon
    if (e.piratePlatform.cannon()) {
      const c = e.piratePlatform.cannon()!;
      EM.ensureComponentOn(c, DeadDef);
      if (RenderableDef.isOn(c)) c.renderable.hidden = true;
      c.dead.processed = true;
    }

    // kill count
    pirateKills += 1;

    // dead music
    const music = EM.getResource(AudioDef);
    if (music) music.playChords([3], "minor", 2.0, 5.0, 1);

    _piratePool.free(e.piratePlatform.poolIdx);

    // wood state
    if (WoodHealthDef.isOn(timber) && PhysicsParentDef.isOn(timber)) {
      // TODO(@darzu): necessary?
      // timber.physicsParent.id = 0;
      // EM.ensureComponentOn(timber, LifetimeDef, 1000);
      for (let b of timber.woodHealth.boards) {
        for (let s of b) {
          s.health = 0;
        }
      }
    }
  }
}
