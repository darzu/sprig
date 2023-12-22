import { CameraDef } from "../camera/camera.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { EM } from "../ecs/entity-manager.js";
import { vec3, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { AudioDef } from "../audio/audio.js";
import { ColliderDef, MultiCollider } from "../physics/collider.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import {
  cloneMesh,
  getAABBFromMesh,
  Mesh,
  transformMesh,
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
import { TimeDef } from "../time/time.js";
import {
  createWoodHealth,
  resetWoodHealth,
  resetWoodState,
  WoodHealthDef,
  WoodStateDef,
  _dbgNumSplinterEnds,
} from "./wood.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { breakBullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { createGhost, GhostDef } from "../debug/ghost.js";
import { TextDef } from "../gui/ui.js";
import { createLD53Ship, ld53ShipAABBs } from "./shipyard.js";
import { gameplaySystems } from "../debug/ghost.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import {
  pirateKills,
  pirateNextSpawn,
  pirateSpawnTimer,
  startPirates,
} from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { addColliderDbgVis, addGizmoChild } from "../utils/utils-game.js";
import { Phase } from "../ecs/sys-phase.js";
import { AuthorityDef, MeDef } from "../net/components.js";

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
const DBG_COLLIDERS = false;

const DISABLE_PRIATES = true;

let healthPercent = 100;

const MAX_GOODBALLS = 10;

export const LD51CannonDef = EM.defineComponent("ld51Cannon", () => {
  return {};
});

export async function initShipyardGame(hosting: boolean) {
  const res = await EM.whenResources(
    AllMeshesDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef,
    MeDef
  );

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    deferredPipeline,
    postProcess,
  ];

  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.set(sun, RenderableConstructDef, res.allMeshes.ball.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 300, 10));

  // const c = res.globalCursor3d.cursor()!;
  // if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const ground = EM.new();
  const groundMesh = cloneMesh(res.allMeshes.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(quat.IDENTITY, [0, 0, -4], [20, 20, 2])
  );
  EM.set(ground, RenderableConstructDef, groundMesh);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  // EM.set(p, ColorDef, [0.2, 0.3, 0.2]);
  EM.set(ground, PositionDef, V(0, 0, 0));
  // EM.set(plane, PositionDef, [0, -5, 0]);

  // const cube = EM.newEntity();
  // const cubeMesh = cloneMesh(res.allMeshes.cube.mesh);
  // EM.set(cube, RenderableConstructDef, cubeMesh);
  // EM.set(cube, ColorDef, [0.1, 0.1, 0.1]);
  // EM.set(cube, PositionDef, [0, 0, 3]);
  // EM.set(cube, RotationDef);
  // EM.set(cube, AngularVelocityDef, [0, 0.001, 0.001]);
  // EM.set(cube, WorldFrameDef);
  // EM.set(cube, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.allMeshes.cube.aabb,
  // });

  // EM.set(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  // TODO(@darzu): timber system here!
  // const sphereMesh = cloneMesh(res.allMeshes.ball.mesh);
  // const visible = false;
  // EM.set(_player, RenderableConstructDef, sphereMesh, visible);
  // EM.set(_player, ColorDef, [0.1, 0.1, 0.1]);
  // EM.set(_player, PositionDef, [0, 0, 0]);
  // // EM.set(b2, PositionDef, [0, 0, -1.2]);
  // EM.set(_player, WorldFrameDef);
  // // EM.set(b2, PhysicsParentDef, g.id);
  // EM.set(_player, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.allMeshes.ball.aabb,
  // });
  // randomizeMeshColors(b2);

  // EM.set(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.allMeshes.cube.center,
  //   halfsize: res.allMeshes.cube.halfsize,
  // });

  // TIMBER
  const timber = EM.new();

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
    // } = createSpaceBarge();
  } = createLD53Ship();

  // TODO(@darzu): remove
  // const ribCount = 10;
  // const ribSpace = 3;
  // const ribWidth = 1;
  // const ceilHeight = 20;
  // const floorHeight = 10;
  // const floorLength = 20;
  // const floorWidth = 10;

  // const [timberMesh, timberState] = createBarrelMesh();

  EM.set(timber, RenderableConstructDef, timberMesh);
  EM.set(timber, WoodStateDef, timberState);
  EM.set(timber, AuthorityDef, res.me.pid);
  // EM.set(timber, ColorDef, ENDESGA16.darkBrown);
  // EM.set(timber, ColorDef, [0.1, 0.1, 0.1]);
  // const scale = 1 * Math.pow(0.8, ti);
  const scale = 1;
  const timberAABB = getAABBFromMesh(timberMesh);
  // const timberPos = getCenterFromAABB(timberAABB);
  const timberPos = vec3.create();
  // timberPos[1] += 5;
  // const timberPos = vec3.clone(res.allMeshes.timber_rib.center);
  // vec3.negate(timberPos, timberPos);
  // vec3.scale(timberPos, timberPos, scale);
  // timberPos[1] += 1;
  // timberPos[0] -= ribCount * 0.5 * ribSpace;
  // timberPos[2] -= floorPlankCount * 0.5 * floorSpace;
  EM.set(timber, PositionDef, timberPos);
  // EM.set(timber, PositionDef, [0, 0, -4]);
  EM.set(timber, RotationDef);
  EM.set(timber, ScaleDef, V(scale, scale, scale));
  EM.set(timber, WorldFrameDef);
  // EM.set(timber, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: timberAABB,
  // });
  const mc: MultiCollider = {
    shape: "Multi",
    solid: true,
    // TODO(@darzu): integrate these in the assets pipeline
    children: ld53ShipAABBs.map((aabb) => ({
      shape: "AABB",
      solid: true,
      aabb,
    })),
  };
  EM.set(timber, ColliderDef, mc);
  const timberHealth = createWoodHealth(timberState);
  EM.set(timber, WoodHealthDef, timberHealth);

  if (DBG_COLLIDERS) addColliderDbgVis(timber);

  addGizmoChild(timber, 10);

  // assert(_player?.collider.shape === "AABB");
  // console.dir(ghost.collider.aabb);

  const BUSY_WAIT = 20.0;

  EM.addSystem(
    "ld51Ghost",
    Phase.GAME_WORLD,
    [GhostDef, WorldFrameDef, ColliderDef],
    [InputsDef, HasFirstInteractionDef],
    async (ps, { inputs }) => {
      if (!ps.length) return;

      const ghost = ps[0];

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
          1,
          firePos,
          fireDir,
          0.05,
          0.02,
          3 * 0.00001,
          ballHealth,
          [0, 1, 0]
        );
      }

      if (inputs.keyClicks["r"]) {
        const timber2 = await EM.whenEntityHas(timber, RenderableDef);
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
  if (DBG_PLAYER)
    // TODO(@darzu): breakBullet
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

  // Create player
  {
    // dead bullet maintenance
    // NOTE: this must be called after any system that can create dead bullets but
    //   before the rendering systems.
    EM.addSystem(
      "deadBullets",
      Phase.GAME_WORLD,
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

    if (DBG_PLAYER) {
      const sphereMesh = cloneMesh(res.allMeshes.ball.mesh);
      const g = createGhost(sphereMesh, true);
      g.controllable.speed *= 5;
      g.controllable.sprintMul = 0.2;
      EM.set(g, ColorDef, ENDESGA16.darkGreen);
      EM.set(g, PositionDef, V(0, 0, 0));
      EM.set(g, WorldFrameDef);
      // EM.set(b2, PhysicsParentDef, g.id);
      EM.set(g, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.allMeshes.ball.aabb,
      });

      addGizmoChild(g, 3);

      // vec3.copy(g.position, [-21.17, 35.39, 10.27]);
      // quat.copy(g.rotation, [0.0, 0.0, -0.94, 0.32]);
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, 30.0, 0.0]);
      // // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
      // g.cameraFollow.yawOffset = 0.0;
      // g.cameraFollow.pitchOffset = 2.974;
      // vec3.copy(g.cameraFollow.positionOffset, [0.0, -30.0, 0.0]);

      vec3.copy(g.position, [-21.98, -23.58, 11.94]);
      quat.copy(g.rotation, [0.0, 0.0, -0.36, 0.93]);
      vec3.copy(g.cameraFollow.positionOffset, [0.0, -15.0, 0.0]);
      g.cameraFollow.yawOffset = 0.0;
      g.cameraFollow.pitchOffset = -0.833;
    }
  }

  if (!DISABLE_PRIATES) startPirates();

  const startHealth = getCurrentHealth();
  {
    EM.addSystem(
      "progressGame",
      Phase.GAME_WORLD,
      null,
      [InputsDef, TextDef, TimeDef, AudioDef],
      (es, res) => {
        // const player = EM.findEntity(res.localPlayerEnt.playerId, [PlayerDef])!;
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
