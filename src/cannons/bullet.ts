import { EM, Component, Entity, EntityW } from "../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V, tV } from "../matrix/sprig-matrix.js";
import { FinishedDef } from "../ecs/em-helpers.js";
import { ColorDef } from "../color/color-ecs.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { Position, PositionDef, RotationDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import {
  AuthorityDef,
  MeDef,
  SyncDef,
  PredictDef,
  Me,
} from "../net/components.js";
import { AllMeshes, AllMeshesDef } from "../meshes/mesh-list.js";
import {
  AngularVelocity,
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "../motion/velocity.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { Time, TimeDef } from "../time/time.js";
import { GravityDef } from "../motion/gravity.js";
import { ENDESGA16 } from "../color/palettes.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { DeadDef } from "../ecs/delete.js";
import { AudioDef } from "../audio/audio.js";
import { randNormalVec3 } from "../utils/utils-3d.js";
import { assert, assertDbg, range } from "../utils/util.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { Phase } from "../ecs/sys-phase.js";
import { SplinterParticleDef } from "../wood/wood-splinters.js";
import { SketchTrailDef, SketcherDef, sketchLines } from "../utils/sketch.js";

// TODO(@darzu): MULTIPLAYER BULLETS might have been broken during LD51

const DBG_BULLET_TRAILS = true;

const _maxBullets = 100;

export const BulletDef = EM.defineComponent(
  "bullet",
  () => {
    return {
      team: 0,
      health: 10,
    };
  },
  (p, team: number = 0, health: number = 10) => {
    p.team = team;
    p.health = health;
    return p;
  },
  { multiArg: true }
);
export type Bullet = Component<typeof BulletDef>;

export const BulletConstructDef = EM.defineComponent(
  "bulletConstruct",
  () => {
    return {
      location: V(0, 0, 0),
      linearVelocity: V(0, 1, 0),
      angularVelocity: V(0, 0, 0),
      team: 0,
      gravity: 0,
      health: 0,
    };
  },
  (
    p,
    loc?: V3,
    vel?: V3,
    angVel?: V3,
    team?: number,
    gravity?: number,
    health?: number
  ) => {
    if (loc) V3.copy(p.location, loc);
    if (vel) V3.copy(p.linearVelocity, vel);
    if (angVel) V3.copy(p.angularVelocity, angVel);
    if (team !== undefined) p.team = team;
    if (gravity !== undefined) p.gravity = gravity;
    if (health !== undefined) p.health = health;
    return p;
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
  e: Entity & { bulletConstruct: BulletConstruct },
  res: { me: Me; allMeshes: AllMeshes; time: Time }
) {
  const props = e.bulletConstruct;
  assertDbg(props);
  EM.set(e, PositionDef, props.location);
  EM.set(e, RotationDef);
  // EM.set(e, LinearVelocityDef);
  // vec3.copy(e.linearVelocity, props.linearVelocity);
  EM.set(e, AngularVelocityDef, props.angularVelocity);
  if (props.team === 1) {
    EM.set(e, ColorDef, ENDESGA16.deepGreen);
  } else if (props.team === 2) {
    EM.set(e, ColorDef, ENDESGA16.deepBrown);
  } else {
    EM.set(e, ColorDef, ENDESGA16.orange);
  }
  EM.setOnce(e, MotionSmoothingDef);
  EM.setOnce(e, RenderableConstructDef, res.allMeshes.ball.proto);
  EM.setOnce(e, AuthorityDef, res.me.pid);
  EM.set(e, BulletDef, props.team, props.health);
  EM.setOnce(e, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.ball.aabb,
  });
  EM.set(e, LifetimeDef, 8000);
  EM.setOnce(e, SyncDef, [PositionDef.id]);
  e.sync.fullComponents = [BulletConstructDef.id];
  EM.setOnce(e, PredictDef);
  // EM.set(e, GravityDef);
  // e.gravity[1] = -props.gravity;

  // TODO(@darzu): MULTIPLAYER: fix sync & predict to work with parametric motion
  EM.set(e, ParametricDef, {
    pos: props.location,
    vel: props.linearVelocity,
    accel: [0, 0, -props.gravity],
    time: res.time.time,
  });

  if (DBG_BULLET_TRAILS) EM.set(e, SketchTrailDef);

  return e;
}

export function registerBuildBulletsSystem() {
  EM.addSystem(
    "buildBullets",
    Phase.GAME_WORLD,
    [BulletConstructDef],
    [MeDef, AllMeshesDef],
    (bullets, res) => {
      for (let b of bullets) {
        // if (FinishedDef.isOn(b)) continue;
        // createOrUpdateBullet( b, res.me.pid, res.allMeshes);
        // EM.set(b, FinishedDef);
      }
    }
  );
}

export function registerBulletUpdate() {
  // TODO(@darzu): remove?
  EM.addSystem(
    "updateBullets",
    Phase.GAME_WORLD,
    [BulletConstructDef, BulletDef, PositionDef, LinearVelocityDef],
    [TimeDef],
    (bullets, res) => {
      // for (let b of bullets) {
      //   b.linearVelocity[1] -=
      //     b.bulletConstruct.gravity * res.time.dt;
      // }
    }
  );
}

// TODO(@darzu): Use entity pools!!
type BulletEnt = EntityW<[typeof BulletConstructDef]>;
const _bulletPool: BulletEnt[] = [];
let _nextBulletIdx = 0;

// TODO(@darzu): fireBullet has become quite bloated and has wierd parameters like bulletAxis
export async function fireBullet(
  team: number,
  location: V3,
  rotation: quat,
  speed: number, // = 0.02,
  rotationSpeed: number, // = 0.02,
  gravity: number, // = 6
  health: number,
  bulletAxis: V3.InputT
) {
  {
    const music = EM.getResource(AudioDef);
    if (music) {
      // for (let i = 0; i < 10; i++) music.playChords([3], "minor", 2.0, 5.0, 1);
      // TODO(@darzu): AUDIO. unify old and new audio system
      //music.playChords([3], "minor", 2.0, 1.0, 1);
    }
  }

  let e: BulletEnt;
  if (_bulletPool.length < _maxBullets) {
    let e_ = EM.new();
    EM.set(e_, BulletConstructDef);
    e = e_;
    _bulletPool.push(e);
  } else {
    e = _bulletPool[_nextBulletIdx];

    // reconstitute
    EM.tryRemoveComponent(e.id, DeadDef);
    if (RenderableDef.isOn(e)) e.renderable.hidden = false;

    _nextBulletIdx += 1;
    if (_nextBulletIdx >= _bulletPool.length) _nextBulletIdx = 0;
  }

  // let bulletAxis = V(1, 0, 0);
  const axis = V3.tQuat(bulletAxis, rotation, V3.tmp());
  V3.norm(axis, axis);
  const linearVelocity = V3.scale(axis, speed, V3.mk());
  const angularVelocity = V3.scale(axis, rotationSpeed, V3.mk());

  assertDbg(e.bulletConstruct, `bulletConstruct missing on: ${e.id}`);
  V3.copy(e.bulletConstruct.location, location);
  V3.copy(e.bulletConstruct.linearVelocity, linearVelocity);
  V3.copy(e.bulletConstruct.angularVelocity, angularVelocity);
  e.bulletConstruct.team = team;
  e.bulletConstruct.gravity = gravity;
  e.bulletConstruct.health = health;

  // TODO(@darzu): This breaks multiplayer maybe!
  // TODO(@darzu): MULTIPLAYER. need to think how multiplayer and entity pools interact.
  const res = await EM.whenResources(MeDef, TimeDef, AllMeshesDef);
  return createOrResetBullet(e, res);
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

  const { allMeshes } = await EM.whenResources(AllMeshesDef);

  const numSetsInPool = 20;

  for (let i = 0; i < numSetsInPool; i++) {
    let bset: BulletPart[] = [];
    for (let part of allMeshes.ball_broken) {
      const pe = EM.new();
      EM.set(pe, RenderableConstructDef, part.proto);
      EM.set(pe, ColorDef);
      EM.set(pe, RotationDef);
      EM.set(pe, PositionDef);
      EM.set(pe, LinearVelocityDef);
      EM.set(pe, AngularVelocityDef);
      // EM.set(pe, LifetimeDef, 2000);
      EM.set(pe, GravityDef, V(0, 0, -4 * 0.00001));
      EM.set(pe, SplinterParticleDef);
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
      // typeof LinearVelocityDef
      typeof ParametricDef
    ]
  >
) {
  if (DeadDef.isOn(bullet)) return;
  if (!WorldFrameDef.isOn(bullet)) return; // TODO(@darzu): BUG. Why does this happen sometimes?

  if (!_bulletPartPoolIsInit) await initBulletPartPool();

  // const { music, allMeshes } = await EM.whenResources(MusicDef, AssetsDef);

  const parts = getNextBulletPartSet();
  for (let pe of parts) {
    if (!pe || !bullet || !bullet.world) continue;
    V3.copy(pe.position, bullet.world.position);
    V3.copy(pe.color, bullet.color);
    // const vel = vec3.clone(bullet.linearVelocity);
    const vel = V3.clone(bullet.parametric.vel);
    // vel[2] = -vel[2]; // assume we're at the end of a parabola
    V3.norm(vel, vel);
    V3.neg(vel, vel); // reflact back along path of travel
    V3.add(vel, randNormalVec3(V3.tmp()), vel);
    V3.add(vel, [0, 0, +1], vel); // bias upward
    V3.norm(vel, vel);
    V3.scale(vel, 0.02, vel);
    EM.set(pe, LinearVelocityDef);
    V3.copy(pe.linearVelocity, vel);
    EM.set(pe, AngularVelocityDef);
    V3.copy(pe.angularVelocity, vel);
    // EM.set(pe, LifetimeDef, 2000);
    EM.set(pe, GravityDef);
    V3.copy(pe.gravity, [0, 0, -4 * 0.00001]);
  }

  EM.set(bullet, DeadDef);
}

// TODO(@darzu): simulateBullet shouldn't be needed any more since we use
//    the analyitic parameteric equations in parametric-motion.ts
const __simTemp1 = V3.mk();
export function* simulateBullet(
  pos: V3,
  rot: quat,
  speed: number,
  gravity: number,
  dt: number
): Generator<V3, never> {
  let bulletAxis = tV(0, 0, -1);
  V3.tQuat(bulletAxis, rot, bulletAxis);
  V3.norm(bulletAxis, bulletAxis);
  const linVel = V3.scale(bulletAxis, speed, V3.mk());
  const grav = V(0, -gravity, 0);

  yield pos;

  while (true) {
    // gravity
    V3.add(linVel, V3.scale(grav, dt, __simTemp1), linVel);
    // velocity
    V3.add(pos, V3.scale(linVel, dt, __simTemp1), pos);

    yield pos;
  }
}
