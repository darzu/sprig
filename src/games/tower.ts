import { BLACK, AssetsDef } from "../assets.js";
import { AudioDef } from "../audio/audio.js";
import { ColorDef } from "../color/color-ecs.js";
import {
  AllEndesga16,
  AllEndesga16Names,
  ENDESGA16,
  seqEndesga16,
  seqEndesga16NextIdx,
} from "../color/palettes.js";
import { DeadDef } from "../delete.js";
import { createRef } from "../ecs/em_helpers.js";
import { EM, EntityW, EntityManager } from "../ecs/entity-manager.js";
import { createEntityPool } from "../entity-pool.js";
import { mat4, vec3, quat, vec2, tV } from "../sprig-matrix.js";
import { clamp, jitter, parabolaFromPoints } from "../math.js";
import {
  AABB,
  createAABB,
  updateAABBWithPoint,
  aabbCenter,
  mergeAABBs,
  clampToAABB,
} from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PositionDef,
  RotationDef,
  PhysicsParentDef,
  ScaleDef,
} from "../physics/transform.js";
import {
  cloneMesh,
  transformMesh,
  Mesh,
  getAABBFromMesh,
  RawMesh,
  scaleMesh,
  mergeMeshes,
} from "../render/mesh.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { V } from "../sprig-matrix.js";
import { tempVec3 } from "../temp-pool.js";
import { TimeDef } from "../time.js";
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
} from "../shipyard/wood.js";
import { ShipDef } from "../smol/ship.js";
import { PartyDef } from "./party.js";
import {
  angleBetween,
  angleBetweenPosXZ,
  angleBetweenXZ,
  vec3Dbg,
} from "../utils-3d.js";
import { createRibSailNow, RibSailLocalDef } from "../hyperspace/ribsail.js";
import { MeDef } from "../net/components.js";
import { WindDef } from "../wind/wind.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { fireBullet, simulateBullet } from "../cannons/bullet.js";
import { dbgOnce } from "../util.js";
import { drawBall } from "../utils-game.js";
import { createGraph3DAxesMesh, createLineMesh } from "../gizmos.js";
import { createGraph3D, getDataDomain } from "../utils-gizmos.js";
import {
  mkProjectileAngleFromRangeFn,
  projectilePosition,
  projectileRange,
  projectileTimeOfFlight,
} from "./parametric-motion.js";

// TODO(@darzu): what's registerDestroyPirateHandler about?

const pitchSpeed = 0.000042;

const maxTowers = 20;

// TODO(@darzu): de-dupe with pirate.ts

export function appendTower(b: TimberBuilder): RawMesh {
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
    const isMidSeg = !(hi === 0 || hi === 4);
    const numSegs = isMidSeg ? 5 : 6;
    const midness = 2 - Math.floor(Math.abs(hi - 2));
    const segLen = length / 5 + midness * 0.2;
    const openSize = segLen * 0.3;
    mat4.copy(b.cursor, cursor2);
    const aabb: AABB = createAABB();
    const firstVi = b.mesh.pos.length;
    // const jy = () => jitter(0.05); // little bit of up-down jitter
    if (isMidSeg) {
      mat4.rotateX(b.cursor, -Math.PI * xFactor * 0.5 * 2, b.cursor);
      mat4.translate(b.cursor, [0, -openSize, 0], b.cursor);
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5, b.cursor);
      b.addLoopVerts();
      b.addEndQuad(true);
      mat4.rotateX(b.cursor, -Math.PI * xFactor * 0.5, b.cursor);
      mat4.translate(b.cursor, [0, openSize, 0], b.cursor);
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5 * 2, b.cursor);
      b.addLoopVerts();
      b.addSideQuads();
    } else {
      b.addLoopVerts();
      b.addEndQuad(true);
    }
    for (let i = 0; i < numSegs; i++) {
      mat4.translate(b.cursor, [0, segLen, 0], b.cursor);
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5, b.cursor);
      b.addLoopVerts();
      b.addSideQuads();
      mat4.rotateX(b.cursor, Math.PI * xFactor * 0.5, b.cursor);
    }
    if (isMidSeg) {
      mat4.translate(b.cursor, [0, openSize, 0], b.cursor);
      mat4.rotateX(b.cursor, -Math.PI * xFactor * 0.5, b.cursor);
      b.addLoopVerts();
      b.addSideQuads();
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

    mat4.translate(cursor2, [-((b.width * 2.0) /*+ 0.05*/), 0, 0], cursor2);
  }

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));
  // b.mesh.colors.push(randNormalPosVec3(vec3.create()));

  return b.mesh;
}

export const TowerPlatformDef = EM.defineComponent(
  "towerPlatform",
  (
    cannon: EntityW<
      [typeof PositionDef, typeof RotationDef, typeof WorldFrameDef]
    >,
    timber: EntityW<[typeof WoodHealthDef, typeof WoodStateDef]>,
    sail: EntityW<[typeof RotationDef]>
  ) => {
    return {
      cannon:
        createRef<
          [typeof PositionDef, typeof RotationDef, typeof WorldFrameDef]
        >(cannon),
      timber: createRef<[typeof WoodHealthDef, typeof WoodStateDef]>(timber),
      sail: createRef<[typeof RotationDef]>(sail),
      lastFire: 0,
      poolIdx: -1, // TODO(@darzu): HACK. this is for object pooling
    };
  }
);

// function rotateTowerPlatform(
//   p: EntityW<[typeof PositionDef, typeof RotationDef]>,
//   rad: number
// ) {
//   vec3.rotateY(p.position, vec3.ZEROS, rad, p.position);
//   quat.rotateY(p.rotation, rad, p.rotation);
// }

// TODO(@darzu): IMPL & CALL!
export async function startTowers(towerPositions: vec3[]) {
  const em: EntityManager = EM;

  // TODO(@darzu): HACK!
  // registerDestroyTowerHandler(destroyTower);

  // TODO(@darzu): SPAWN
  // for (let i = 0; i < numStartTowers; i++) {
  //   const p = await spawnTower(i * ((2 * Math.PI) / numStartTowers));
  // }
  const towerPromises: Promise<void>[] = [];
  for (let pos of towerPositions) {
    const p = spawnTower(pos);
    towerPromises.push(p);
  }
  await Promise.all(towerPromises);

  EM.requireGameplaySystem("updateTowerPlatforms");
  EM.requireGameplaySystem("updateTowerAttack");
}

EM.registerSystem(
  [TowerPlatformDef, PositionDef, RotationDef],
  [TimeDef, PartyDef, WindDef],
  (es, res) => {
    const target = res.party.pos;
    if (!target) return; // TODO(@darzu): fold up sail!

    const fwd = tV(0, 0, -1);
    const behind = tV(0, 0, 1);
    for (let tower of es) {
      const angleToParty = angleBetweenPosXZ(
        tower.position,
        tower.rotation,
        fwd,
        res.party.pos
      );
      // turn the tower
      // TODO(@darzu): DEBUGGING:
      // const TURN_SPEED = 0.01;
      const TURN_SPEED = 0.1;
      if (Math.abs(angleToParty) > 0.01) {
        const angleDelta = clamp(angleToParty, -TURN_SPEED, TURN_SPEED);
        quat.rotateY(tower.rotation, angleDelta, tower.rotation);
      }

      // set the sail
      const sailFwd = vec3.transformQuat(behind, tower.rotation);
      const angleToWind = angleBetweenXZ(sailFwd, res.wind.dir);
      const sailAngle = angleToWind - angleToParty;
      quat.rotateY(
        quat.IDENTITY,
        sailAngle,
        tower.towerPlatform.sail()!.rotation
      );

      // console.log(`turning by: ${angleBetween}`);
    }
  },
  "updateTowerPlatforms"
);

const towerPool = createEntityPool<
  [typeof TowerPlatformDef, typeof PositionDef, typeof RotationDef]
>({
  max: maxTowers,
  maxBehavior: "crash",
  create: async () => {
    const res = await EM.whenResources(AssetsDef, RendererDef, TimeDef, MeDef);
    // make platform
    const platform = EM.new();
    EM.ensureComponentOn(platform, ColorDef);
    vec3.copy(platform.color, ENDESGA16.deepBrown);
    EM.ensureComponentOn(platform, PositionDef);
    EM.ensureComponentOn(platform, RotationDef);
    const groundMesh = cloneMesh(res.assets.hex.mesh);
    transformMesh(
      groundMesh,
      mat4.fromRotationTranslationScale(quat.IDENTITY, [0, -6, 0], [8, 6, 8])
    );
    EM.ensureComponentOn(platform, RenderableConstructDef, groundMesh);

    // make cannon
    const cannon = EM.new();
    EM.ensureComponentOn(
      cannon,
      RenderableConstructDef,
      res.assets.ld51_cannon.proto
    );
    EM.ensureComponentOn(cannon, PositionDef);
    EM.ensureComponentOn(cannon, PhysicsParentDef, platform.id);
    EM.ensureComponentOn(cannon, ColorDef, ENDESGA16.darkGray);
    EM.ensureComponentOn(cannon, RotationDef);
    vec3.copy(cannon.position, [0, 6, -6]);
    EM.ensureComponentOn(cannon, WorldFrameDef);
    {
      // DBG cannon gizmo
      const gizmo = EM.new();
      EM.ensureComponentOn(gizmo, PositionDef, V(0, 0, 0));
      EM.ensureComponentOn(gizmo, ScaleDef, V(2, 2, 2));
      EM.ensureComponentOn(gizmo, PhysicsParentDef, cannon.id);
      EM.ensureComponentOn(
        gizmo,
        RenderableConstructDef,
        res.assets.gizmo.proto
      );
    }

    // make debug gizmo
    // TODO(@darzu): would be nice to have as a little helper function?
    const gizmo = EM.new();
    EM.ensureComponentOn(gizmo, PositionDef, V(0, 20, 0));
    EM.ensureComponentOn(gizmo, ScaleDef, V(10, 10, 10));
    EM.ensureComponentOn(gizmo, PhysicsParentDef, platform.id);
    EM.ensureComponentOn(gizmo, RenderableConstructDef, res.assets.gizmo.proto);

    // make timber
    const timber = EM.new();
    const _timberMesh = createEmptyMesh("tower");
    const builder = createTimberBuilder(_timberMesh);
    appendTower(builder);
    _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
    scaleMesh(_timberMesh, 2);
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
    EM.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
    EM.ensureComponentOn(timber, WoodStateDef, timberState);
    EM.ensureComponentOn(timber, ColorDef, ENDESGA16.red);
    const timberAABB = getAABBFromMesh(timberMesh);
    EM.ensureComponentOn(timber, PositionDef, V(0, builder.width, 0));
    EM.ensureComponentOn(timber, RotationDef);
    EM.ensureComponentOn(timber, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: timberAABB,
    });
    const timberHealth = createWoodHealth(timberState);
    EM.ensureComponentOn(timber, WoodHealthDef, timberHealth);
    EM.ensureComponentOn(timber, PhysicsParentDef, platform.id);

    // make sail
    const sail = createRibSailNow(res);
    EM.ensureComponentOn(sail, PhysicsParentDef, platform.id);
    sail.position[1] += 15; // deployed height ?
    // quat.rotateY(sail.rotation, Math.PI / 8, sail.rotation);

    // TODO(@darzu): two trails?
    // const sail2 = createRibSailNow(res);
    // EM.ensureComponentOn(sail2, PhysicsParentDef, platform.id);
    // sail2.position[1] += 15;
    // quat.rotateY(sail2.rotation, -Math.PI / 8, sail2.rotation);

    // make joint entity
    EM.ensureComponentOn(platform, TowerPlatformDef, cannon, timber, sail);

    return platform;
  },
  onSpawn: async (p) => {
    const initialPitch = Math.PI * 0.06;
    const res = await EM.whenResources(AssetsDef, RendererDef, TimeDef);

    // set/reset platform, cannon, and wood properties
    const platform = p;
    const cannon = p.towerPlatform.cannon()!;
    const timber = p.towerPlatform.timber()!;

    // reset timber
    resetWoodHealth(timber.woodHealth);
    resetWoodState(timber.woodState);
    const timber2 = await EM.whenEntityHas(timber, RenderableDef);
    res.renderer.renderer.stdPool.updateMeshQuads(
      timber2.renderable.meshHandle,
      timber.woodState.mesh as Mesh,
      0,
      timber.woodState.mesh.quad.length
    );

    // undead
    EM.tryRemoveComponent(platform.id, DeadDef);
    EM.tryRemoveComponent(cannon.id, DeadDef);

    if (RenderableDef.isOn(platform)) platform.renderable.hidden = false;
    if (RenderableDef.isOn(cannon)) cannon.renderable.hidden = false;

    vec3.copy(platform.position, [0, 0, 30]);
    quat.identity(platform.rotation);

    const tiltPeriod = 5700 + jitter(3000);
    const tiltTimer = Math.random() * tiltPeriod;

    platform.towerPlatform.lastFire = res.time.time; // + startDelay;
    // platform.towerPlatform.tiltPeriod = tiltPeriod;
    // platform.towerPlatform.tiltTimer = tiltTimer;

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
  },
  onDespawn: (e) => {
    // TODO(@darzu): impl
    // console.log(`destroy ${id}`);
    const timber = e.towerPlatform.timber()!;

    // tower
    if (!DeadDef.isOn(e)) {
      // dead platform
      EM.ensureComponentOn(e, DeadDef);
      if (RenderableDef.isOn(e)) e.renderable.hidden = true;
      e.dead.processed = true;

      // dead cannon
      if (e.towerPlatform.cannon()) {
        const c = e.towerPlatform.cannon()!;
        EM.ensureComponentOn(c, DeadDef);
        if (RenderableDef.isOn(c)) c.renderable.hidden = true;
        c.dead.processed = true;
      }

      // // kill count
      // towerKills += 1;

      // dead music
      const music = EM.getResource(AudioDef);
      if (music) music.playChords([3], "minor", 2.0, 5.0, 1);

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
  },
});

async function spawnTower(pos: vec3) {
  // TODO(@darzu): move custom params into spawn fn?
  const platform = await towerPool.spawn();
  // rotateTowerPlatform(platform, rad);
  vec3.copy(platform.position, pos);
}

// TODO(@darzu): hook this up?
function destroyTower(id: number) {
  const tower = EM.findEntity(id, [TowerPlatformDef, PositionDef, RotationDef]);
  if (tower && !DeadDef.isOn(tower)) towerPool.despawn(tower);
}

const towerFireSpeed = 1000;

let __frame = 0; // TODO(@darzu): DBG

// tower attack
EM.registerSystem(
  [TowerPlatformDef, PositionDef, RotationDef],
  [TimeDef, PartyDef],
  (es, res) => {
    __frame++;

    const target = res.party.pos;
    if (!target) return;

    // TODO(@darzu): projectile prediction

    let idx = 0;
    for (let tower of es) {
      idx++;

      // fire cannons
      const nextFire =
        tower.towerPlatform.lastFire + towerFireSpeed + idx * 150;
      let doFire = res.time.time > nextFire;
      if (doFire) {
        const cannon = tower.towerPlatform.cannon()!;
        // const speed = 0.05;
        const speed = 0.1;
        const rotSpeed = 0.02;
        const oldGravity = 3 * 0.00001;
        // const gravity = 1.5;
        const gravity = 3.5 * 0.00001;

        // console.log(
        //   `fire! ${nextFire} > ${res.time.time}, last: ${tower.towerPlatform.lastFire}`
        // );
        tower.towerPlatform.lastFire = res.time.time;
        // console.log(`tower fire`);
        // TODO(@darzu): DBG!!!!!
        // const ballHealth = 20.0;
        const ballHealth = 2.0;
        fireBullet(
          EM,
          2,
          cannon.world.position,
          cannon.world.rotation,
          speed,
          rotSpeed,
          gravity,
          ballHealth,
          [0, 0, -1]
        );
      }
    }
  },
  "updateTowerAttack"
);
