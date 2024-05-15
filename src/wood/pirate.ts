import {
  BLACK,
  AllMeshesDef,
  HexMesh,
  CannonLD51Mesh,
} from "../meshes/mesh-list.js";
import { AudioDef } from "../audio/audio.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { createRef } from "../ecs/em-helpers.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { EntityPool, createEntityPool } from "../ecs/entity-pool.js";
import { mat4, V3, quat } from "../matrix/sprig-matrix.js";
import { jitter } from "../utils/math.js";
import {
  AABB,
  createAABB,
  updateAABBWithPoint,
  aabbCenter,
} from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PositionDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import {
  cloneMesh,
  transformMesh,
  Mesh,
  getAABBFromMesh,
  RawMesh,
  normalizeMesh,
} from "../meshes/mesh.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import {
  TimberBuilder,
  WoodHealthDef,
  WoodStateDef,
  createEmptyMesh,
  createTimberBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
  createWoodHealth,
  resetWoodHealth,
  resetWoodState,
} from "./wood.js";
import { fireBullet } from "../cannons/bullet.js";
import { Phase } from "../ecs/sys-phase.js";
import { HEX_MESH } from "../meshes/primatives.js";
import { registerDestroyPirateHandler } from "./wood-damage.js";

const DBG_PIRATES = false;

const maxPirates = DBG_PIRATES ? 3 : 10;
const numStartPirates = DBG_PIRATES ? maxPirates : 2;

export let pirateNextSpawn = 0;

const tenSeconds = 1000 * (DBG_PIRATES ? 3 : 10);

export let pirateSpawnTimer = tenSeconds;
const minSpawnTimer = 3000;

const pitchSpeed = 0.000042;

export let pirateKills = 0;

export function appendPirateShip(b: TimberBuilder): RawMesh {
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
    const mid = aabbCenter(V3.tmp(), aabb);
    mid[1] = 0;
    for (let vi = firstVi; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      V3.sub(p, mid, p);
    }

    mat4.translate(cursor2, [-(b.width * 2.0 + 0.05), 0, 0], cursor2);
  }

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(V3.clone(BLACK));
  // b.mesh.colors.push(randNormalPosVec3(vec3.create()));

  return b.mesh;
}

const startDelay = 0;
// const startDelay = 1000;

export const PiratePlatformDef = EM.defineNonupdatableComponent(
  "piratePlatform",
  (
    cannon: EntityW<[typeof PositionDef, typeof RotationDef]>,
    timber: EntityW<[typeof WoodHealthDef, typeof WoodStateDef]>
  ) => {
    return {
      // cannon: EntityW<[typeof PositionDef, typeof RotationDef]>;
      // timber: EntityW<[typeof WoodHealthDef, typeof WoodStateDef]>;
      cannon: createRef<[typeof PositionDef, typeof RotationDef]>(cannon),
      timber: createRef<[typeof WoodHealthDef, typeof WoodStateDef]>(timber),
      tiltPeriod: 0,
      tiltTimer: 0,
      lastFire: 0,
      poolIdx: -1, // TODO(@darzu): HACK. this is for object pooling
    };
  },
  { multiArg: true }
);

function rotatePiratePlatform(
  p: EntityW<[typeof PositionDef, typeof RotationDef]>,
  rad: number
) {
  // TODO(@darzu): use yaw/pitch/roll
  V3.rotY(p.position, V3.ZEROS, rad, p.position);
  quat.rotY(p.rotation, rad, p.rotation);
}

export async function startPirates() {
  const { piratePool } = await EM.whenResources(PiratePoolDef);
  // TODO(@darzu): HACK!
  registerDestroyPirateHandler((id) => destroyPirateShip(piratePool, id));

  for (let i = 0; i < numStartPirates; i++) {
    const p = spawnPirate(piratePool, i * ((2 * Math.PI) / numStartPirates));
  }

  pirateNextSpawn = pirateSpawnTimer;
  EM.addSystem(
    "spawnPirates",
    Phase.GAME_WORLD,
    [PiratePlatformDef],
    [TimeDef],
    (ps, res) => {
      // TODO(@darzu): NOTE this is a good example of a system that needs to be
      //   called even if no entities match its query. In fact, it should probably
      //   be forced active even if no pirates exist.
      const pirateCount = ps.length;
      if (res.time.time > pirateNextSpawn) {
        pirateNextSpawn += pirateSpawnTimer;

        // console.log("SPAWN");

        const rad = Math.random() * 2 * Math.PI;
        if (pirateCount < maxPirates) {
          spawnPirate(piratePool, rad);

          if (pirateCount < 2) {
            spawnPirate(piratePool, rad + Math.PI);
          }
        }
        pirateSpawnTimer *= 0.95;
        pirateSpawnTimer = Math.max(pirateSpawnTimer, minSpawnTimer);
      }
    }
  );

  const fireStagger = 150;
  // const tiltPeriod = 5700;
  EM.addSystem(
    "updatePiratePlatforms",
    Phase.GAME_WORLD,
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
          quat.rotX(c.rotation, r, c.rotation);
        }

        // fire cannons
        const myTime = res.time.time + pIdx * fireStagger;
        let doFire = myTime - p.piratePlatform.lastFire > pirateSpawnTimer;
        if (doFire) {
          p.piratePlatform.lastFire = myTime;
          if (WorldFrameDef.isOn(c)) {
            // console.log(`pirate fire`);

            // TODO(@darzu): DBG!!!!!
            // const ballHealth = 20.0;
            const ballHealth = 2.0;
            fireBullet(
              2,
              c.world.position,
              c.world.rotation,
              0.05,
              0.02,
              3 * 0.00001,
              ballHealth,
              V3.FWD
            );
          }
        }
      }
    }
  );
}

type PiratePool = EntityPool<
  [typeof PiratePlatformDef, typeof PositionDef, typeof RotationDef]
>;
export const PiratePoolDef = EM.defineResource(
  "piratePool",
  (p: PiratePool) => p
);

EM.addLazyInit([RendererDef, TimeDef], [PiratePoolDef], (res) => {
  const piratePool: PiratePool = createEntityPool({
    max: maxPirates,
    maxBehavior: "crash",
    create: () => {
      // make platform
      const platform = EM.mk();
      EM.set(platform, ColorDef);
      V3.copy(platform.color, ENDESGA16.deepBrown);
      EM.set(platform, PositionDef);
      EM.set(platform, RotationDef);
      // TODO(@darzu): re-use this mesh!
      const groundMesh = normalizeMesh(HEX_MESH());
      transformMesh(
        groundMesh,
        mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -1, 0], [4, 1, 4])
      );
      EM.set(platform, RenderableConstructDef, groundMesh);

      // make cannon
      const cannon = EM.mk();
      EM.set(cannon, RenderableConstructDef, CannonLD51Mesh);
      EM.set(cannon, PositionDef);
      EM.set(cannon, PhysicsParentDef, platform.id);
      EM.set(cannon, ColorDef, ENDESGA16.darkGray);
      EM.set(cannon, RotationDef);
      V3.copy(cannon.position, [0, 2, 0]);

      // make timber
      const timber = EM.mk();
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
      EM.set(timber, RenderableConstructDef, timberMesh);
      EM.set(timber, WoodStateDef, timberState);
      EM.set(timber, ColorDef, ENDESGA16.red);
      const timberAABB = getAABBFromMesh(timberMesh);
      EM.set(timber, PositionDef, V(0, builder.width, 0));
      EM.set(timber, RotationDef);
      EM.set(timber, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: timberAABB,
      });
      const timberHealth = createWoodHealth(timberState);
      EM.set(timber, WoodHealthDef, timberHealth);
      EM.set(timber, PhysicsParentDef, platform.id);

      // make joint entity
      EM.set(platform, PiratePlatformDef, cannon, timber);

      return platform;
    },
    onSpawn: (p) => {
      const initialPitch = Math.PI * 0.06;

      // set/reset platform, cannon, and wood properties
      const platform = p;
      const cannon = p.piratePlatform.cannon()!;
      const timber = p.piratePlatform.timber()!;

      // reset timber
      resetWoodHealth(timber.woodHealth);
      resetWoodState(timber.woodState);
      EM.whenEntityHas(timber, RenderableDef).then((timber2) => {
        res.renderer.renderer.stdPool.updateMeshQuadInds(
          timber2.renderable.meshHandle,
          timber.woodState.mesh as Mesh,
          0,
          timber.woodState.mesh.quad.length
        );
      });

      // undead
      EM.tryRemoveComponent(platform.id, DeadDef);
      EM.tryRemoveComponent(cannon.id, DeadDef);

      if (RenderableDef.isOn(platform)) platform.renderable.hidden = false;
      if (RenderableDef.isOn(cannon)) cannon.renderable.hidden = false;

      V3.copy(platform.position, [0, 0, 30]);
      quat.identity(platform.rotation);

      const tiltPeriod = 5700 + jitter(3000);
      const tiltTimer = Math.random() * tiltPeriod;

      platform.piratePlatform.lastFire = res.time.time + startDelay;
      platform.piratePlatform.tiltPeriod = tiltPeriod;
      platform.piratePlatform.tiltTimer = tiltTimer;

      quat.identity(cannon.rotation);
      quat.rotX(cannon.rotation, initialPitch, cannon.rotation);
      // TODO(@darzu): HACK!
      // so they start slightly different pitches
      let initTimer = 0;
      // TODO(@darzu):
      while (initTimer < tiltTimer) {
        initTimer += 16.6666;
        const upMode = initTimer % tiltPeriod > tiltPeriod * 0.5;
        let r = Math.PI * pitchSpeed * 16.6666 * (upMode ? -1 : 1);
        quat.rotX(cannon.rotation, r, cannon.rotation);
      }
    },
    onDespawn: (e) => {
      // TODO(@darzu): impl
      // console.log(`destroy ${id}`);
      const timber = e.piratePlatform.timber()!;

      // pirateShip
      if (!DeadDef.isOn(e)) {
        // dead platform
        EM.set(e, DeadDef);
        if (RenderableDef.isOn(e)) e.renderable.hidden = true;
        e.dead.processed = true;

        // dead cannon
        if (e.piratePlatform.cannon()) {
          const c = e.piratePlatform.cannon()!;
          EM.set(c, DeadDef);
          if (RenderableDef.isOn(c)) c.renderable.hidden = true;
          c.dead.processed = true;
        }

        // kill count
        pirateKills += 1;

        // dead music
        const music = EM.getResource(AudioDef);
        if (music) music.playChords([3], "minor", 2.0, 5.0, 1);

        // wood state
        if (WoodHealthDef.isOn(timber) && PhysicsParentDef.isOn(timber)) {
          // TODO(@darzu): necessary?
          // timber.physicsParent.id = 0;
          // EM.set(timber, LifetimeDef, 1000);
          for (let b of timber.woodHealth.boards) {
            for (let s of b) {
              s.health = 0;
            }
          }
        }
      }
    },
  });
  EM.addResource(PiratePoolDef, piratePool);
});

async function spawnPirate(pirates: PiratePool, rad: number) {
  // TODO(@darzu): move custom params into spawn fn?
  const platform = pirates.spawn();
  rotatePiratePlatform(platform, rad);
}

export function destroyPirateShip(pirates: PiratePool, id: number) {
  const pirate = EM.findEntity(id, [
    PiratePlatformDef,
    PositionDef,
    RotationDef,
  ]);
  if (pirate && !DeadDef.isOn(pirate)) pirates.despawn(pirate);
}
