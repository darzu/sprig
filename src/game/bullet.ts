import {
  EM,
  EntityManager,
  Component,
  Entity,
  EntityW,
} from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "../color-ecs.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { Position, PositionDef, RotationDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef, PredictDef } from "../net/components.js";
import { Assets, AssetsDef } from "./assets.js";
import {
  AngularVelocity,
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "../physics/motion.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { LifetimeDef } from "./lifetime.js";
import { TimeDef } from "../time.js";
import { GravityDef } from "./gravity.js";
import { ENDESGA16 } from "../color/palettes.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { DeadDef } from "../delete.js";
import { AudioDef } from "../audio.js";
import { randNormalVec3 } from "../utils-3d.js";
import { SplinterParticleDef } from "../wood.js";
import { tempVec3 } from "../temp-pool.js";
import { assert, assertDbg } from "../util.js";

// TODO(@darzu): MULTIPLAYER BULLETS might have been broken during LD51

const _maxBullets = 15;

export const BulletDef = EM.defineComponent(
  "bullet",
  (team: number = 0, health: number = 10) => {
    return {
      team,
      health,
    };
  }
);
export type Bullet = Component<typeof BulletDef>;

export const BulletConstructDef = EM.defineComponent(
  "bulletConstruct",
  (
    loc?: vec3,
    vel?: vec3,
    angVel?: vec3,
    team?: number,
    gravity?: number,
    health?: number
  ) => {
    return {
      location: loc ?? V(0, 0, 0),
      linearVelocity: vel ?? V(0, 1, 0),
      angularVelocity: angVel ?? V(0, 0, 0),
      team: team ?? 0,
      gravity: gravity ?? 0,
      health: health ?? 0,
    };
  }
);
export type BulletConstruct = Component<typeof BulletConstructDef>;

EM.registerSerializerPair(
  BulletConstructDef,
  (c, writer) => {
    writer.writeVec3(c.location);
    writer.writeVec3(c.linearVelocity);
    writer.writeVec3(c.angularVelocity);
    writer.writeFloat32(c.gravity);
  },
  (c, reader) => {
    reader.readVec3(c.location);
    reader.readVec3(c.linearVelocity);
    reader.readVec3(c.angularVelocity);
    c.gravity = reader.readFloat32();
  }
);

export function createOrResetBullet(
  em: EntityManager,
  e: Entity & { bulletConstruct: BulletConstruct },
  pid: number,
  assets: Assets
) {
  const props = e.bulletConstruct;
  assertDbg(props);
  em.set(e, PositionDef);
  vec3.copy(e.position, props.location);
  em.set(e, RotationDef);
  em.set(e, LinearVelocityDef);
  vec3.copy(e.linearVelocity, props.linearVelocity);
  em.set(e, AngularVelocityDef);
  vec3.copy(e.angularVelocity, props.angularVelocity);
  em.set(e, ColorDef);
  if (props.team === 1) {
    vec3.copy(e.color, ENDESGA16.deepGreen);
  } else if (props.team === 2) {
    vec3.copy(e.color, ENDESGA16.deepBrown);
  } else {
    vec3.copy(e.color, ENDESGA16.orange);
  }
  em.set(e, MotionSmoothingDef);
  em.set(e, RenderableConstructDef, assets.ball.proto);
  em.set(e, AuthorityDef, pid);
  em.set(e, BulletDef);
  e.bullet.team = props.team;
  e.bullet.health = props.health;
  em.set(e, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: assets.ball.aabb,
  });
  em.set(e, LifetimeDef);
  e.lifetime.ms = 4000;
  em.set(e, SyncDef);
  e.sync.dynamicComponents = [PositionDef.id];
  e.sync.fullComponents = [BulletConstructDef.id];
  em.set(e, PredictDef);
  em.set(e, GravityDef);
  e.gravity[1] = -props.gravity;
}

export function registerBuildBulletsSystem(em: EntityManager) {
  em.registerSystem(
    [BulletConstructDef],
    [MeDef, AssetsDef],
    (bullets, res) => {
      for (let b of bullets) {
        // if (FinishedDef.isOn(b)) continue;
        // createOrUpdateBullet(em, b, res.me.pid, res.assets);
        // em.ensureComponentOn(b, FinishedDef);
      }
    },
    "buildBullets"
  );
}

export function registerBulletUpdate(em: EntityManager) {
  // TODO(@darzu): remove?
  em.registerSystem(
    [BulletConstructDef, BulletDef, PositionDef, LinearVelocityDef],
    [TimeDef],
    (bullets, res) => {
      // for (let b of bullets) {
      //   b.linearVelocity[1] -=
      //     0.00001 * b.bulletConstruct.gravity * res.time.dt;
      // }
    },
    "updateBullets"
  );
}

type BulletEnt = EntityW<[typeof BulletConstructDef]>;
const _bulletPool: BulletEnt[] = [];
let _nextBulletIdx = 0;

export async function fireBullet(
  em: EntityManager,
  team: number,
  location: vec3,
  rotation: quat,
  speed: number, // = 0.02,
  rotationSpeed: number, // = 0.02,
  gravity: number, // = 6
  health: number
) {
  {
    const music = EM.getResource(AudioDef);
    if (music) {
      // for (let i = 0; i < 10; i++) music.playChords([3], "minor", 2.0, 5.0, 1);
      music.playChords([3], "minor", 2.0, 1.0, 1);
    }
  }

  let e: BulletEnt;
  if (_bulletPool.length < _maxBullets) {
    let e_ = em.new();
    em.set(e_, BulletConstructDef);
    e = e_;
    _bulletPool.push(e);
  } else {
    e = _bulletPool[_nextBulletIdx];

    // reconstitute
    em.tryRemoveComponent(e.id, DeadDef);
    if (RenderableDef.isOn(e)) e.renderable.hidden = false;

    _nextBulletIdx += 1;
    if (_nextBulletIdx >= _bulletPool.length) _nextBulletIdx = 0;
  }

  let bulletAxis = V(0, 0, -1);
  vec3.transformQuat(bulletAxis, rotation, bulletAxis);
  vec3.normalize(bulletAxis, bulletAxis);
  const linearVelocity = vec3.scale(bulletAxis, speed, vec3.create());
  const angularVelocity = vec3.scale(bulletAxis, rotationSpeed, vec3.create());

  assertDbg(e.bulletConstruct, `bulletConstruct missing on: ${e.id}`);
  vec3.copy(e.bulletConstruct.location, location);
  vec3.copy(e.bulletConstruct.linearVelocity, linearVelocity);
  vec3.copy(e.bulletConstruct.angularVelocity, angularVelocity);
  e.bulletConstruct.team = team;
  e.bulletConstruct.gravity = gravity;
  e.bulletConstruct.health = health;

  // TODO(@darzu): This breaks multiplayer maybe!
  // TODO(@darzu): need to think how multiplayer and entity pools interact.
  const { me, assets } = await em.whenResources(MeDef, AssetsDef);
  createOrResetBullet(em, e, me.pid, assets);
}

type BulletPart = EntityW<[typeof PositionDef, typeof ColorDef]>;
const bulletPartPool: BulletPart[][] = [];
let _bulletPartPoolIsInit = false;
let _bulletPartPoolNext = 0;

function getNextBulletPartSet(): BulletPart[] {
  if (bulletPartPool.length === 0) return []; // not inited
  assert(_bulletPartPoolNext < bulletPartPool.length, "bullet pool problem");
  const res = bulletPartPool[_bulletPartPoolNext];

  _bulletPartPoolNext += 1;
  if (_bulletPartPoolNext >= bulletPartPool.length) _bulletPartPoolNext = 0;

  return res;
}

async function initBulletPartPool() {
  if (_bulletPartPoolIsInit) return;
  _bulletPartPoolIsInit = true;
  const em: EntityManager = EM;
  const { assets } = await em.whenResources(AssetsDef);

  const numSetsInPool = 20;

  for (let i = 0; i < numSetsInPool; i++) {
    let bset: BulletPart[] = [];
    for (let part of assets.ball_broken) {
      const pe = em.new();
      em.set(pe, RenderableConstructDef, part.proto);
      em.set(pe, ColorDef);
      em.set(pe, RotationDef);
      em.set(pe, PositionDef);
      em.set(pe, LinearVelocityDef);
      em.set(pe, AngularVelocityDef);
      // em.ensureComponentOn(pe, LifetimeDef, 2000);
      em.set(pe, GravityDef, V(0, -4, 0));
      em.set(pe, SplinterParticleDef);
      bset.push(pe);
    }
    bulletPartPool.push(bset);
  }
}

// TODO(@darzu): use object pool!
export async function breakBullet(
  bullet: EntityW<
    [
      typeof BulletDef,
      typeof WorldFrameDef,
      typeof ColorDef,
      typeof LinearVelocityDef
    ]
  >
) {
  const em: EntityManager = EM;

  if (DeadDef.isOn(bullet)) return;
  if (!WorldFrameDef.isOn(bullet)) return; // TODO(@darzu): BUG. Why does this happen sometimes?

  if (!_bulletPartPoolIsInit) await initBulletPartPool();

  // const { music, assets } = await em.whenResources(MusicDef, AssetsDef);

  const parts = getNextBulletPartSet();
  for (let pe of parts) {
    if (!pe || !bullet || !bullet.world) continue;
    vec3.copy(pe.position, bullet.world.position);
    vec3.copy(pe.color, bullet.color);
    const vel = vec3.clone(bullet.linearVelocity);
    vec3.normalize(vel, vel);
    vec3.negate(vel, vel);
    vec3.add(vel, randNormalVec3(tempVec3()), vel);
    vec3.add(vel, [0, -1, 0], vel);
    vec3.normalize(vel, vel);
    vec3.scale(vel, 0.02, vel);
    em.set(pe, LinearVelocityDef);
    vec3.copy(pe.linearVelocity, vel);
    em.set(pe, AngularVelocityDef);
    vec3.copy(pe.angularVelocity, vel);
    // em.ensureComponentOn(pe, LifetimeDef, 2000);
    em.set(pe, GravityDef);
    vec3.copy(pe.gravity, [0, -4, 0]);
  }

  em.set(bullet, DeadDef);
}
