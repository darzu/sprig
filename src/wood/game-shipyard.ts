import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef, DeletedDef } from "../ecs/delete.js";
import { createRef } from "../ecs/em_helpers.js";
import { EM, Entity, EntityManager, EntityW } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { jitter } from "../utils/math.js";
import { AudioDef, randChordId } from "../audio/audio.js";
import {
  createAABB,
  copyAABB,
  AABB,
  updateAABBWithPoint,
  aabbCenter,
  getHalfsizeFromAABB,
} from "../physics/aabb.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
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
  Mesh,
  scaleMesh3,
  transformMesh,
  validateMesh,
} from "../meshes/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../matrix/temp-pool.js";
import { assert } from "../utils/util.js";
import { TimeDef } from "../time/time.js";
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
} from "./wood.js";
import { AssetsDef, BLACK } from "../meshes/assets.js";
import {
  breakBullet,
  BulletConstructDef,
  BulletDef,
  fireBullet,
} from "../cannons/bullet.js";
import { ControllableDef } from "../input/controllable.js";
import { createGhost, GhostDef } from "../debug/ghost.js";
import { GravityDef } from "../motion/gravity.js";
import { InRangeDef, InteractableDef } from "../input/interact.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import {
  createHsPlayer,
  LocalHsPlayerDef,
  HsPlayerDef,
} from "../hyperspace/hs-player.js";
import { TextDef } from "../gui/ui.js";
import { createIdxPool } from "../utils/idx-pool.js";
import { randNormalPosVec3, randNormalVec3 } from "../utils/utils-3d.js";
import { createHomeShip } from "./shipyard.js";
import { gameplaySystems } from "../debug/ghost.js";
import { RenderDataStdDef } from "../render/pipelines/std-scene.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import {
  pirateKills,
  pirateNextSpawn,
  pirateSpawnTimer,
  startPirates,
} from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { addGizmoChild } from "../utils/utils-game.js";
import { createBarrelMesh } from "./barrel.js";
import { Phase } from "../ecs/sys_phase.js";

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

const DISABLE_PRIATES = true;

let healthPercent = 100;

const MAX_GOODBALLS = 10;

export const LD51CannonDef = EM.defineComponent("ld51Cannon", () => {
  return {};
});

export async function initShipyardGame(em: EntityManager, hosting: boolean) {
  EM.addSystem("runWooden", Phase.GAME_WORLD);
  EM.addSystem("woodHealth", Phase.GAME_WORLD);

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
    deferredPipeline,
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
    mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -4, 0], [20, 2, 20])
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

  // const {
  //   timberState,
  //   timberMesh,
  //   ribCount,
  //   ribSpace,
  //   ribWidth,
  //   ceilHeight,
  //   floorHeight,
  //   floorLength,
  //   floorWidth,
  // } = createHomeShip();

  // TODO(@darzu): remove
  const ribCount = 10;
  const ribSpace = 3;
  const ribWidth = 1;
  const ceilHeight = 20;
  const floorHeight = 10;
  const floorLength = 20;
  const floorWidth = 10;

  const [timberMesh, timberState] = createBarrelMesh();

  em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
  em.ensureComponentOn(timber, WoodStateDef, timberState);
  em.ensureComponentOn(timber, ColorDef, ENDESGA16.darkBrown);
  // em.ensureComponentOn(timber, ColorDef, [0.1, 0.1, 0.1]);
  // const scale = 1 * Math.pow(0.8, ti);
  const scale = 1;
  const timberAABB = getAABBFromMesh(timberMesh);
  // const timberPos = getCenterFromAABB(timberAABB);
  const timberPos = vec3.create();
  // timberPos[1] += 5;
  // const timberPos = vec3.clone(res.assets.timber_rib.center);
  // vec3.negate(timberPos, timberPos);
  // vec3.scale(timberPos, timberPos, scale);
  // timberPos[1] += 1;
  // timberPos[0] -= ribCount * 0.5 * ribSpace;
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

  addGizmoChild(timber, 10);

  // CANNONS
  const realCeilHeight = ceilHeight + timberPos[1];
  const realFloorHeight = timberPos[1] + floorHeight;
  // for (let i = 0; i < 2; i++) {
  //   const isLeft = i === 0 ? 1 : -1;
  //   const cannon = em.new();
  //   em.ensureComponentOn(
  //     cannon,
  //     RenderableConstructDef,
  //     res.assets.ld51_cannon.proto
  //   );
  //   em.ensureComponentOn(
  //     cannon,
  //     PositionDef,
  //     V(-7.5, realFloorHeight + 2, -4 * isLeft)
  //   );
  //   em.ensureComponentOn(cannon, RotationDef);
  //   quat.rotateX(cannon.rotation, Math.PI * 0.01 * isLeft, cannon.rotation);
  //   if (isLeft !== 1) {
  //     quat.rotateY(cannon.rotation, Math.PI, cannon.rotation);
  //   }
  //   em.ensureComponentOn(cannon, ColorDef, ENDESGA16.darkGreen);
  //   // TODO(@darzu): USE PALETTE PROPERLY
  //   // TODO(@darzu): USE PALETTE PROPERLY
  //   vec3.scale(cannon.color, 0.5, cannon.color);
  //   {
  //     const interactBox = EM.new();
  //     const interactAABB = copyAABB(createAABB(), res.assets.ld51_cannon.aabb);
  //     vec3.scale(interactAABB.min, 2, interactAABB.min);
  //     vec3.scale(interactAABB.max, 2, interactAABB.max);
  //     EM.ensureComponentOn(interactBox, PhysicsParentDef, cannon.id);
  //     EM.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
  //     EM.ensureComponentOn(interactBox, ColliderDef, {
  //       shape: "AABB",
  //       solid: false,
  //       aabb: interactAABB,
  //     });
  //     em.ensureComponentOn(cannon, InteractableDef, interactBox.id);
  //   }
  //   em.ensureComponentOn(cannon, LD51CannonDef);
  // }

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
    vec3.copy(ball.gravity, [0, -3 * 0.00001, 0]);
    vec3.zero(ball.linearVelocity);
    if (ScaleDef.isOn(ball)) vec3.copy(ball.scale, vec3.ONES);
  }

  em.registerSystem(
    "ld51PlayerFireCannon",
    [LD51CannonDef, WorldFrameDef, InRangeDef],
    [InputsDef, LocalHsPlayerDef, AudioDef],
    (cannons, res) => {
      const player = em.findEntity(res.localHsPlayer.playerId, [HsPlayerDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (
          player.hsPlayer.holdingBall &&
          c.inRange &&
          res.inputs.lclick /* && c.cannonLocal.fireMs <= 0*/
        ) {
          const ballHealth = 2.0;

          let bulletAxis = V(0, 0, -1);
          // let bulletAxis = V(1, 0, 0);
          vec3.transformQuat(bulletAxis, c.world.rotation, bulletAxis);
          vec3.normalize(bulletAxis, bulletAxis);
          const bulletPos = vec3.clone(c.world.position);
          vec3.scale(bulletAxis, 2, bulletAxis);
          vec3.add(bulletPos, bulletAxis, bulletPos);
          // const bulletRot = quat.rotateY(
          //   c.world.rotation,
          //   Math.PI / 2,
          //   quat.tmp()
          // );

          fireBullet(
            em,
            1,
            bulletPos,
            // bulletRot,
            c.world.rotation,
            0.05,
            0.02,
            // gravity:
            // 3, (non-parametric)
            1.5 * 0.00001, // parametric
            ballHealth,
            bulletAxis
          );

          // remove player ball
          const heldBall = EM.findEntity(player.hsPlayer.holdingBall, [
            GoodBallDef,
          ]);
          if (heldBall) {
            despawnGoodBall(heldBall);
          }

          player.hsPlayer.holdingBall = 0;

          // c.cannonLocal.fireMs = c.cannonLocal.fireDelayMs;

          const chord = randChordId();
          res.music.playChords([chord], "major", 2.0, 3.0, -2);
        }
      }
    }
  );
  EM.addSystem("ld51PlayerFireCannon", Phase.GAME_WORLD);

  EM.addSystem("splintersOnFloor", Phase.GAME_WORLD);

  // const quadIdsNeedReset = new Set<number>();

  // assert(_player?.collider.shape === "AABB");
  // console.dir(ghost.collider.aabb);

  const BUSY_WAIT = 20.0;

  em.registerSystem(
    "ld51Ghost",
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
        fireBullet(
          em,
          1,
          firePos,
          fireDir,
          0.05,
          0.02,
          3 * 0.00001,
          ballHealth,
          [0, 0, -1]
        );
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
    }
  );
  if (DBG_PLAYER) EM.addSystem("ld51Ghost", Phase.GAME_WORLD);

  // TODO(@darzu): breakBullet
  em.registerSystem(
    "breakBullets",
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
  EM.addSystem("breakBullets", Phase.GAME_WORLD);

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
      const size = getHalfsizeFromAABB(aabbEnt.collider.aabb, vec3.create());
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
        "bulletBounce",
        [
          BulletConstructDef,
          BulletDef,
          ColorDef,
          // LinearVelocityDef,
          // GravityDef,
          ParametricDef,
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
                    // TODO(@darzu): these don't apply with parametric:
                    // vec3.zero(b.linearVelocity);
                    // vec3.zero(b.gravity);
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
        }
      );
      EM.addSystem("bulletBounce", Phase.GAME_WORLD);
    }

    // dead bullet maintenance
    // NOTE: this must be called after any system that can create dead bullets but
    //   before the rendering systems.
    em.registerSystem(
      "deadBullets",
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
      }
    );
    EM.addSystem("deadBullets", Phase.GAME_WORLD);

    // // starter ammo
    // {
    //   assert(colFloor.collider.shape === "AABB");
    //   for (let i = 0; i < 3; i++) {
    //     const pos: vec3 = vec3.clone([
    //       colFloor.collider.aabb.max[0] - 2,
    //       colFloor.collider.aabb.max[1] + 2,
    //       colFloor.collider.aabb.max[2] - 2 * i - 3,
    //     ]);
    //     spawnGoodBall(pos);
    //   }
    // }

    em.registerSystem(
      "fallingGoodBalls",
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
      }
    );
    EM.addSystem("fallingGoodBalls", Phase.GAME_WORLD);

    em.registerSystem(
      "pickUpBalls",
      [GoodBallDef, InteractableDef, InRangeDef, PositionDef],
      [InputsDef, LocalHsPlayerDef],
      (es, res) => {
        const player = em.findEntity(res.localHsPlayer.playerId, [
          HsPlayerDef,
        ])!;
        if (!player) return;
        if (player.hsPlayer.holdingBall) return;
        // TODO(@darzu):
        if (res.inputs.lclick) {
          for (let ball of es) {
            if (PhysicsParentDef.isOn(ball)) continue;
            // pick up this ball
            player.hsPlayer.holdingBall = ball.id;
            em.ensureComponentOn(ball, PhysicsParentDef, player.id);
            vec3.set(0, 0, -1, ball.position);
            em.ensureComponentOn(ball, ScaleDef);
            vec3.copy(ball.scale, [0.8, 0.8, 0.8]);
            em.removeComponent(ball.id, InteractableDef);
          }
        }
      }
    );
    EM.addSystem("pickUpBalls", Phase.GAME_WORLD);

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

      // vec3.copy(g.position, [-28.11, 26.0, -28.39]);
      // quat.copy(g.rotation, [0.0, -0.94, 0.0, 0.34]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = -0.593;

      // vec3.copy(g.position, [-3.61, 23.22, 36.56]);
      // quat.copy(g.rotation, [0.0, -0.11, 0.0, 0.99]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = -0.378;

      // vec3.copy(g.position, [-4.19, 39.19, 4.41]);
      // quat.copy(g.rotation, [0.0, -0.01, 0.0, 1.0]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = -1.439;

      // vec3.copy(g.position, [21.62, 11.55, 15.21]);
      // quat.copy(g.rotation, [0.0, 0.21, 0.0, 0.98]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = -0.079;

      // vec3.copy(g.position, [-33.52, 15.72, 11.85]);
      // quat.copy(g.rotation, [0.0, -0.43, 0.0, 0.91]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = -0.336;

      vec3.copy(g.position, [-11.36, 27.53, -3.66]);
      quat.copy(g.rotation, [0.0, -0.93, 0.0, 0.39]);
      vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 5.0]);
      g.cameraFollow.yawOffset = 0.0;
      g.cameraFollow.pitchOffset = -1.233;
    }

    if (!DBG_PLAYER) {
      const _player = createHsPlayer(em);
      vec3.set(-10, realFloorHeight + 6, 0, _player.hsPlayerProps.location);
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

  if (!DISABLE_PRIATES) startPirates();

  const startHealth = getCurrentHealth();
  {
    em.registerSystem(
      "progressGame",
      [],
      [InputsDef, TextDef, TimeDef, AudioDef],
      (es, res) => {
        // const player = em.findEntity(res.localHsPlayer.playerId, [PlayerDef])!;
        // if (!player) return;

        const currentHealth = getCurrentHealth();
        healthPercent = (currentHealth / startHealth) * 100;
        // console.log(`healthPercent: ${healthPercent}`);

        const elapsed = pirateNextSpawn - res.time.time;
        const elapsedPer = Math.min(
          Math.ceil((elapsed / pirateSpawnTimer) * 10),
          10
        );

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
          // alert(
          //   `You've been sunk! You killed ${pirateKills} and lasted ${(
          //     res.time.time / 1000
          //   ).toFixed(1)} seconds. Thanks for playing! Refresh to try again.`
          // );
          gameplaySystems.length = 0;
        }
      }
    );
    EM.addSystem("progressGame", Phase.GAME_WORLD);
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
