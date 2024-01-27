import { CubeMesh, LD53CannonMesh } from "../meshes/mesh-list.js";
import { AudioDef } from "../audio/audio.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { createRef, Ref } from "../ecs/em-helpers.js";
import { Component, EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { EntityPool, createEntityPool } from "../ecs/entity-pool.js";
import { Bullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { GravityDef } from "../motion/gravity.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { PartyDef } from "../camera/party.js";
import { jitter } from "../utils/math.js";
import {
  AABB,
  copyAABB,
  createAABB,
  doesOverlapAABB,
  mergeAABBs,
  pointInAABB,
  transformAABB,
  updateAABBWithPoint,
} from "../physics/aabb.js";
import { emptyLine } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
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
import { Mesh, createEmptyMesh, createEmptyRawMesh } from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { mat4, tV, V, vec3, quat } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { assert } from "../utils/util.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { transformYUpModelIntoZUp } from "../camera/basis.js";
import { addGizmoChild, drawBall } from "../utils/utils-game.js";

export const DBG_CANNONS = false;

const GRAVITY = 6.0 * 0.00001;
const MIN_BRICK_PERCENT = 0.6;

// TODO(@darzu): Z_UP

export interface Brick {
  aabb: AABB;
  // index of first pos in the mesh
  index: number;
  // track whether this brick has been destroyed
  knockedOut: boolean;
  health: number;
  pos: vec3[];
  color: vec3;
}

export interface BrickRow {
  aabb: AABB;
  bricks: Array<Brick>;
  // excludes "shrunk" bricks--hacky
  totalBricks: number;
  bricksKnockedOut: number;
}

export interface StoneState {
  mesh: Mesh;
  rows: BrickRow[];
  totalBricks: number;
  currentBricks: number;
  aabb: AABB;
}

function createEmptyStoneState(): StoneState {
  return {
    mesh: createEmptyMesh("tower"),
    rows: [],
    totalBricks: 0,
    currentBricks: 0,
    aabb: createAABB(),
  };
}

interface Tower {
  cannon: Ref<[typeof PositionDef, typeof RotationDef, typeof WorldFrameDef]>;
  lastFired: number;
  fireRate: number;
  projectileSpeed: number;
  firingRadius: number;
  alive: boolean;
  stone: StoneState;
}

export const StoneTowerDef = EM.defineNonupdatableComponent(
  "stoneTower",
  (
    cannon: EntityW<
      [typeof PositionDef, typeof RotationDef, typeof WorldFrameDef]
    >,
    stone: StoneState,
    fireRate = 1500,
    projectileSpeed = 0.2,
    firingRadius = Math.PI / 8
  ) =>
    ({
      stone,
      cannon:
        createRef<
          [typeof PositionDef, typeof RotationDef, typeof WorldFrameDef]
        >(cannon),
      lastFired: 0,
      fireRate,
      projectileSpeed,
      firingRadius,
      alive: true,
    } as Tower),
  { multiArg: true }
);

function knockOutBrickAtIndex(stone: StoneState, index: number) {
  for (let i = 0; i < 8; i++) {
    vec3.set(0, 0, 0, stone.mesh.pos[index + i]);
  }
}

let towardsAttractorTmp = vec3.mk();
let testAABBTmp = vec3.mk();

function shrinkBrickAtIndex(
  stone: StoneState,
  baseIndex: number,
  aabb: AABB
): boolean {
  // is right face entirely outside AABB?
  const rightFace = [0, 2, 4, 6];
  const leftFace = [1, 3, 5, 7];
  let face;
  if (
    rightFace.every(
      (index) => !pointInAABB(aabb, stone.mesh.pos[baseIndex + index])
    )
  ) {
    //console.log(`right face out of AABB at index ${baseIndex}`);
    face = rightFace;
  } else if (
    leftFace.every(
      (index) => !pointInAABB(aabb, stone.mesh.pos[baseIndex + index])
    )
  ) {
    //console.log(`left face out of AABB at index ${baseIndex}`);
    face = leftFace;
  }
  if (!face) {
    // neither face is entirely outside the AABB
    return false;
  }
  for (let index of face) {
    // each point can attract a point across from it along x
    let attractedIndex = index % 2 === 0 ? index + 1 : index - 1;
    let attractor = stone.mesh.pos[baseIndex + index];
    let attracted = stone.mesh.pos[baseIndex + attractedIndex];
    if (pointInAABB(aabb, attractor)) {
      console.error("should never happen");
    }
    if (pointInAABB(aabb, attracted)) {
      let towardsAttractor = vec3.sub(
        attractor,
        attracted,
        towardsAttractorTmp
      );
      let min = 0;
      let max = 0.8; // don't want to shrink bricks too much
      if (
        pointInAABB(
          aabb,
          vec3.add(
            attracted,
            vec3.scale(towardsAttractor, max, testAABBTmp),
            testAABBTmp
          )
        )
      ) {
        //console.log(`unshrinkable point at ${baseIndex} + ${attractedIndex}`);
        // can't shrink this point enough, giving up
        return false;
      }
      // we can shrink along this axis!
      // iterate for 10 rounds
      for (let i = 0; i < 10; i++) {
        //console.log(`iteration ${i}, min=${min}, max=${max}`);
        const half = (min + max) / 2;
        if (
          pointInAABB(
            aabb,
            vec3.add(
              attracted,
              vec3.scale(towardsAttractor, half, testAABBTmp),
              testAABBTmp
            )
          )
        ) {
          min = half;
        } else {
          max = half;
        }
      }
      //console.log(`done with iterations, max is ${max}`);
      vec3.add(attracted, vec3.scale(towardsAttractor, max), attracted);
    }
  }
  return true;
}

// takes a tower-space AABB--not world space!
function knockOutBricks(stone: StoneState, aabb: AABB, shrink = false): number {
  let bricksKnockedOut = 0;
  for (let row of stone.rows) {
    if (doesOverlapAABB(row.aabb, aabb)) {
      for (let brick of row.bricks) {
        if (doesOverlapAABB(brick.aabb, aabb)) {
          if (shrink) {
            if (!shrinkBrickAtIndex(stone, brick.index, aabb)) {
              row.totalBricks--;
              knockOutBrickAtIndex(stone, brick.index);
            }
          } else {
            knockOutBrickAtIndex(stone, brick.index);
            if (!brick.knockedOut) {
              brick.knockedOut = true;
              bricksKnockedOut++;
              row.bricksKnockedOut++;
            }
          }
        }
      }
    }
  }
  return bricksKnockedOut;
}

// takes a tower-space AABB--not world space!
function knockOutBricksByBullet(
  tower: EntityW<[typeof StoneTowerDef]>,
  bricks: FlyingBrickPool,
  aabb: AABB,
  bullet: Bullet
): number {
  // [bricks knocked out, updated health]
  let bricksKnockedOut = 0;
  for (let row of tower.stoneTower.stone.rows) {
    if (doesOverlapAABB(row.aabb, aabb)) {
      for (let brick of row.bricks) {
        if (bullet.health <= 0) {
          return bricksKnockedOut;
        }
        if (doesOverlapAABB(brick.aabb, aabb) && !brick.knockedOut) {
          const dmg = Math.min(brick.health, bullet.health) + 0.001;
          bullet.health -= dmg;
          brick.health -= dmg;
          if (brick.health <= 0) {
            row.bricksKnockedOut++;
            knockOutBrickAtIndex(tower.stoneTower.stone, brick.index);
            brick.knockedOut = true;
            bricksKnockedOut++;
            const flyingBrick = bricks.spawn();
            flyingBrick.physicsParent.id = tower.id;
            //console.log(brick.pos[0]);
            vec3.copy(flyingBrick.position, brick.pos[0]);
            vec3.copy(flyingBrick.color, brick.color);
          }
        }
      }
    }
  }
  return bricksKnockedOut;
}

function restoreBrick(tower: Tower, brick: Brick): boolean {
  brick.health = startingBrickHealth;
  if (brick.knockedOut) {
    for (let i = 0; i < 8; i++) {
      vec3.copy(tower.stone.mesh.pos[brick.index + i], brick.pos[i]);
    }
    brick.knockedOut = false;
    return true;
  }
  return false;
}

function restoreAllBricks(tower: Tower): number {
  let bricksRestored = 0;
  for (let row of tower.stone.rows) {
    row.bricksKnockedOut = 0;
    for (let brick of row.bricks) {
      if (restoreBrick(tower, brick)) {
        bricksRestored++;
      }
    }
  }
  return bricksRestored;
}

const maxStoneTowers = 10;

const height: number = 70;
const baseRadius: number = 20;
const approxBrickWidth: number = 5;
const approxBrickHeight: number = 2;
const brickDepth: number = 2.5;
const coolMode: boolean = false;
const startingBrickHealth = 1;

export function calculateNAndBrickWidth(
  radius: number,
  approxBrickWidth: number
): [number, number] {
  const n = Math.floor(Math.PI / Math.asin(approxBrickWidth / (2 * radius)));
  const brickWidth = radius * 2 * Math.sin(Math.PI / n);
  return [n, brickWidth];
}

const baseColor = ENDESGA16.lightGray;

const TowerMeshes = XY.defineMeshSetResource(
  "towerMeshes",
  LD53CannonMesh,
  CubeMesh
);

// TODO(@darzu): Z_UP: this fn
function createTowerState(): StoneState {
  const state = createEmptyStoneState();
  const mesh = state.mesh;

  const rows = Math.floor(height / approxBrickHeight);
  const brickHeight = height / rows;

  const cursor = mat4.create();
  function applyCursor(v: vec3, distort: boolean = false): vec3 {
    vec3.tMat4(v, cursor, v);
    // X is width, Y is height, Z is depth
    // TODO(@darzu): Z_UP: change basis: to X is width, Y is depth, Z is height
    if (distort)
      vec3.add(
        v,
        [
          jitter(approxBrickWidth / 10),
          jitter(brickHeight / 10),
          jitter(brickDepth / 10),
        ],
        v
      );
    return v;
  }
  function appendBrick(brickWidth: number, brickDepth: number): Brick {
    // X is width, Y is height, Z is depth
    // TODO(@darzu): Z_UP: change basis: to X is width, Y is depth, Z is height
    const index = mesh.pos.length;
    const aabb = createAABB();
    // base
    const pos: vec3[] = [];
    function addPos(p: vec3) {
      pos.push(vec3.clone(p));
      mesh.pos.push(p);
      updateAABBWithPoint(aabb, p);
    }
    addPos(applyCursor(V(0, 0, 0)));
    addPos(applyCursor(V(0 + brickWidth, 0, 0)));
    addPos(applyCursor(V(0, 0, 0 + brickDepth), true));
    addPos(applyCursor(V(0 + brickWidth, 0, 0 + brickDepth), true));

    //top
    addPos(applyCursor(V(0, 0 + brickHeight, 0)));
    addPos(applyCursor(V(0 + brickWidth, 0 + brickHeight, 0)));
    addPos(applyCursor(V(0, 0 + brickHeight, 0 + brickDepth), true));
    addPos(
      applyCursor(V(0 + brickWidth, 0 + brickHeight, 0 + brickDepth), true)
    );

    // base
    mesh.quad.push(V(index, index + 1, index + 3, index + 2));

    // top
    mesh.quad.push(V(index + 4, index + 2 + 4, index + 3 + 4, index + 1 + 4));

    // sides
    mesh.quad.push(V(index, index + 4, index + 1 + 4, index + 1));
    mesh.quad.push(V(index, index + 2, index + 2 + 4, index + 4));
    mesh.quad.push(V(index + 2, index + 3, index + 3 + 4, index + 2 + 4));
    mesh.quad.push(V(index + 1, index + 1 + 4, index + 3 + 4, index + 3));
    //
    const brightness = Math.random() * 0.05;
    const color = V(brightness, brightness, brightness);
    vec3.add(color, baseColor, color);
    for (let i = 0; i < 6; i++) {
      mesh.colors.push(color);
    }
    return {
      aabb,
      index,
      knockedOut: false,
      health: startingBrickHealth,
      pos,
      color,
    };
  }

  let rotation = 0;
  let towerAABB = createAABB();
  let totalBricks = 0;
  for (let r = 0; r < rows; r++) {
    const row: BrickRow = {
      aabb: createAABB(),
      bricks: [],
      totalBricks: 0,
      bricksKnockedOut: 0,
    };
    state.rows.push(row);
    const radius = baseRadius * (1 - r / (rows * 2));
    const [n, brickWidth] = calculateNAndBrickWidth(radius, approxBrickWidth);
    const angle = (2 * Math.PI) / n;
    mat4.identity(cursor);
    mat4.translate(cursor, [0, r * brickHeight, 0], cursor);
    rotation += angle / 2;
    rotation += jitter(angle / 4);
    mat4.rotateY(cursor, rotation, cursor);
    mat4.translate(cursor, [0, 0, radius], cursor);
    mat4.rotateY(cursor, coolMode ? -angle / 2 : angle / 2, cursor);
    for (let i = 0; i < n; i++) {
      totalBricks++;
      row.totalBricks++;
      const brick = appendBrick(
        brickWidth,
        brickDepth + jitter(brickDepth / 10)
      );
      mergeAABBs(row.aabb, row.aabb, brick.aabb);
      row.bricks.push(brick);
      if (coolMode) {
        mat4.rotateY(cursor, angle, cursor);
        mat4.translate(cursor, [brickWidth, 0, 0], cursor);
      } else {
        mat4.translate(cursor, [brickWidth, 0, 0], cursor);
        mat4.rotateY(cursor, angle, cursor);
      }
    }
    mergeAABBs(towerAABB, towerAABB, row.aabb);
  }
  //mesh.quad.forEach(() => mesh.colors.push(V(0, 0, 0)));
  mesh.quad.forEach((_, i) => mesh.surfaceIds.push(i + 1));
  const windowHeight = 0.7 * height;
  const windowAABB: AABB = {
    min: V(
      baseRadius - 4 * brickDepth,
      windowHeight - 2 * brickHeight,
      -approxBrickWidth
    ),
    max: V(
      baseRadius + 2 * brickDepth,
      windowHeight + 2 * brickHeight,
      approxBrickWidth
    ),
  };
  knockOutBricks(state, windowAABB, true);

  state.totalBricks = totalBricks;
  state.currentBricks = totalBricks;
  state.aabb = towerAABB;

  {
    // TODO(@darzu): Z_UP: inline this above
    state.mesh.pos.forEach((v) => vec3.tMat4(v, transformYUpModelIntoZUp, v));
    transformAABB(state.aabb, transformYUpModelIntoZUp);
  }

  return state;
}

type TowerPool = EntityPool<
  [typeof StoneTowerDef, typeof PositionDef, typeof RotationDef]
>;
export const TowerPoolDef = EM.defineResource("towerPool", (p: TowerPool) => p);

EM.addLazyInit([RendererDef], [TowerPoolDef], (res) => {
  const towerPool: TowerPool = createEntityPool({
    max: maxStoneTowers,
    maxBehavior: "crash",
    create: () => {
      const tower = EM.new();
      const cannon = EM.new();
      EM.set(cannon, RenderableConstructDef, LD53CannonMesh);
      EM.set(cannon, PositionDef);
      EM.set(cannon, ColorDef, V(0.05, 0.05, 0.05));
      EM.set(cannon, RotationDef);
      EM.set(cannon, PhysicsParentDef, tower.id);
      EM.set(cannon, WorldFrameDef);
      vec3.set(baseRadius - 2, 0, height * 0.7, cannon.position);

      const stone = createTowerState();

      EM.set(tower, StoneTowerDef, cannon, stone);
      EM.set(tower, PositionDef);
      EM.set(tower, RotationDef);

      EM.set(tower, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: stone.aabb,
      });

      EM.set(tower, RenderableConstructDef, tower.stoneTower.stone.mesh);

      if (DBG_CANNONS) addGizmoChild(tower, 30);

      return tower;
    },
    onSpawn: (p) => {
      const cannon = p.stoneTower.cannon()!;

      EM.tryRemoveComponent(p.id, DeadDef);
      EM.tryRemoveComponent(cannon.id, DeadDef);

      if (RenderableDef.isOn(p)) p.renderable.hidden = false;
      if (RenderableDef.isOn(cannon)) cannon.renderable.hidden = false;

      // platform.towerPlatform.tiltPeriod = tiltPeriod;
      // platform.towerPlatform.tiltTimer = tiltTimer;
      p.stoneTower.lastFired = 0;
      if (restoreAllBricks(p.stoneTower)) {
        EM.whenEntityHas(p, RenderableDef).then((e) => {
          res.renderer.renderer.stdPool.updateMeshVertices(
            e.renderable.meshHandle,
            p.stoneTower.stone.mesh
          );
        });
      }
      p.stoneTower.stone.currentBricks = p.stoneTower.stone.totalBricks;
      p.stoneTower.alive = true;
    },
    onDespawn: (e) => {
      // tower
      if (!DeadDef.isOn(e)) {
        // dead platform
        EM.set(e, DeadDef);
        if (RenderableDef.isOn(e)) e.renderable.hidden = true;
        e.dead.processed = true;

        // dead cannon
        if (e.stoneTower.cannon()) {
          const c = e.stoneTower.cannon()!;
          EM.set(c, DeadDef);
          if (RenderableDef.isOn(c)) c.renderable.hidden = true;
          c.dead.processed = true;
        }
      }
    },
  });
  EM.addResource(TowerPoolDef, towerPool);
});

export const FlyingBrickDef = EM.defineComponent("flyingBrick", () => true);

const maxFlyingBricks = 50;

type FlyingBrickPool = EntityPool<
  [
    typeof FlyingBrickDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof LinearVelocityDef,
    typeof AngularVelocityDef,
    typeof ColorDef,
    typeof LifetimeDef,
    typeof PhysicsParentDef
  ]
>;
export const FlyingBrickPoolDef = EM.defineResource(
  "flyingBrickPool",
  (p: FlyingBrickPool) => p
);

EM.addLazyInit([RendererDef], [FlyingBrickPoolDef], (res) => {
  const flyingBrickPool: FlyingBrickPool = createEntityPool({
    max: maxFlyingBricks,
    maxBehavior: "rand-despawn",
    create: () => {
      const brick = EM.new();
      EM.set(brick, FlyingBrickDef);
      EM.set(brick, PositionDef);
      EM.set(brick, RotationDef);
      EM.set(brick, LinearVelocityDef);
      EM.set(brick, AngularVelocityDef);
      EM.set(brick, ColorDef);
      EM.set(brick, LifetimeDef);
      EM.set(brick, RenderableConstructDef, CubeMesh);
      EM.set(brick, GravityDef, V(0, 0, -GRAVITY));
      EM.set(
        brick,
        ScaleDef,
        V(approxBrickWidth / 2, approxBrickHeight / 2, brickDepth / 2)
      );
      EM.set(brick, PhysicsParentDef);
      return brick;
    },
    onSpawn: (e) => {
      EM.tryRemoveComponent(e.id, DeadDef);
      if (RenderableDef.isOn(e)) e.renderable.hidden = false;

      // set random rotation and angular velocity
      quat.identity(e.rotation);
      quat.rotateX(e.rotation, Math.PI * 0.5, e.rotation);
      quat.rotateY(e.rotation, Math.PI * Math.random(), e.rotation);
      quat.rotateZ(e.rotation, Math.PI * Math.random(), e.rotation);

      vec3.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        e.angularVelocity
      );
      vec3.scale(e.angularVelocity, 0.01, e.angularVelocity);
      vec3.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        e.linearVelocity
      );
      vec3.scale(e.linearVelocity, 0.1, e.linearVelocity);

      e.lifetime.startMs = 8000;
      e.lifetime.ms = e.lifetime.startMs;
    },
    onDespawn: (e) => {
      EM.set(e, DeadDef);
      if (RenderableDef.isOn(e)) e.renderable.hidden = true;
      e.dead.processed = true;
    },
  });

  EM.addResource(FlyingBrickPoolDef, flyingBrickPool);
});

EM.addSystem(
  "despawnFlyingBricks",
  Phase.GAME_WORLD,
  [FlyingBrickDef, DeadDef],
  [FlyingBrickPoolDef],
  (es, res) =>
    es.forEach((e) => {
      if (!e.dead.processed) {
        //console.log("despawning brick");
        res.flyingBrickPool.despawn(e);
      }
    })
);

const __previousPartyPos = vec3.mk();
let __prevTime = 0;

const MAX_THETA = Math.PI / 2 - Math.PI / 16;
const MIN_THETA = -MAX_THETA;
const TARGET_WIDTH = 12;
const TARGET_LENGTH = 30;
const MISS_TARGET_LENGTH = 55;
const MISS_TARGET_WIDTH = 22;
const MISS_BY_MAX = 10;
const MISS_PROBABILITY = 0.25;
const MAX_RANGE = 300;

function getTargetMissOrHitPosition(
  targetPos: vec3,
  targetDir: vec3,
  missed: boolean,
  out?: vec3
): vec3 {
  // return vec3.copy(out ?? vec3.tmp(), targetPos);

  const UP: vec3.InputT = [0, 0, 1];
  let tFwd = vec3.copy(vec3.tmp(), targetDir);
  let tRight = vec3.cross(targetDir, UP);

  // console.log(
  //   `targetDir: ${vec3Dbg(targetDir)}, tFwd: ${vec3Dbg(
  //     tFwd
  //   )}, tRight: ${vec3Dbg(tRight)}`
  // );

  // pick an actual target to aim for on the ship
  if (missed) {
    let rightMul = 0;
    let fwdMul = 0;
    if (Math.random() < 0.5) {
      // miss width-wise
      rightMul = 1;
    } else {
      // miss length-wise
      fwdMul = 1;
    }
    if (Math.random() < 0.5) {
      rightMul *= -1;
      fwdMul *= -1;
    }

    vec3.scale(
      tFwd,
      fwdMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_LENGTH),
      tFwd
    );
    vec3.scale(
      tRight,
      rightMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_WIDTH),
      tRight
    );

    // TODO: why do we move missed shots up?
    tRight[2] += 5;
  } else {
    vec3.scale(tFwd, (Math.random() - 0.5) * TARGET_LENGTH, tFwd);
    vec3.scale(tRight, (Math.random() - 0.5) * TARGET_WIDTH, tRight);
  }

  const target = vec3.add(
    targetPos,
    vec3.add(tFwd, tRight, tRight),
    out ?? vec3.tmp()
  );

  return target;
}

// TODO(@darzu): extract!!
function getFireDirection(
  sourcePos: vec3.InputT,
  targetPos: vec3.InputT,
  targetVel: vec3.InputT,
  projectileSpeed: number
): quat | undefined {
  // NOTE: cannon forward is +X
  // TODO(@darzu): change cannon forward to be +Y?
  const v = projectileSpeed;
  const g = GRAVITY;

  // calculate initial distance
  const d0 = vec3.dist(
    [sourcePos[0], sourcePos[1], 0],
    [targetPos[0], targetPos[1], 0]
  );

  // try to lead the target a bit using an approximation of flight
  // time. this will not be exact.
  // TODO(@darzu): sub with exact flight time?
  const flightTime = d0 / (v * Math.cos(Math.PI / 4));
  const leadPos = tV(
    targetPos[0] + targetVel[0] * flightTime * 0.5,
    targetPos[1] + targetVel[1] * flightTime * 0.5,
    targetPos[2] + targetVel[2] * flightTime * 0.5
  );

  // calculate delta between source and target
  const delta = vec3.sub(leadPos, sourcePos);

  // calculate yaw
  const yaw = -Math.atan2(delta[1], delta[0]);

  // calculate horizontal distance to target
  const d = vec3.len([delta[0], delta[1], 0]);

  // vertical distance to target
  const h = delta[2];

  // now, find the angle from our cannon.
  // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
  let pitch1 = Math.atan(
    (v * v + Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );
  let pitch2 = Math.atan(
    (v * v - Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );

  // console.log(`pitch1: ${pitch1}, pitch2: ${pitch2}`);

  // prefer smaller theta
  if (pitch2 > pitch1) {
    let temp = pitch1;
    pitch1 = pitch2;
    pitch2 = temp;
  }
  let pitch = pitch2;
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    pitch = pitch1;
  }
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    // no firing solution--target is too far or too close
    // console.log("no solution");
    return undefined;
  }

  // ok, we have a firing solution. rotate to the right angle

  // console.log(`yaw: ${yaw}, pitch: ${pitch}`);
  // pitch = 0;

  const worldRot = quat.create();
  // TODO(@darzu): b/c we're using +X is fwd, we can't use quat.fromYawPitchRoll
  quat.rotateZ(worldRot, -yaw, worldRot);
  quat.rotateY(worldRot, -pitch, worldRot);

  return worldRot;
}

EM.addSystem(
  "stoneTowerAttack",
  Phase.GAME_WORLD,
  [StoneTowerDef, WorldFrameDef, RotationDef],
  [TimeDef, PartyDef],
  (es, res) => {
    // pick a random spot on the ship to aim for
    if (!res.party.pos) return;

    for (let tower of es) {
      if (!tower.stoneTower.alive) continue;

      // maybe we can't actually fire yet?
      if (
        tower.stoneTower.lastFired + tower.stoneTower.fireRate >
        res.time.time
      ) {
        continue;
      }

      // are we within range?
      const dist = vec3.dist(tower.world.position, res.party.pos);
      if (MAX_RANGE < dist) {
        continue;
      }

      // calc target velocity
      const targetVel = vec3.scale(
        vec3.sub(res.party.pos, __previousPartyPos),
        1 / (res.time.time - __prevTime)
      );

      // should we miss?
      const missed = Math.random() < MISS_PROBABILITY;

      // determine where to aim
      const aimPos = getTargetMissOrHitPosition(
        res.party.pos,
        res.party.dir,
        missed
      );

      // debugging
      if (DBG_CANNONS)
        drawBall(
          vec3.clone(aimPos),
          0.5,
          missed ? ENDESGA16.darkRed : ENDESGA16.darkGreen
        );

      // determine how to aim
      const cannon = tower.stoneTower.cannon()!;
      const worldRot = getFireDirection(
        cannon.world.position,
        aimPos,
        targetVel,
        tower.stoneTower.projectileSpeed
      );

      if (!worldRot)
        // no valid firing solution
        continue;

      // check max arc
      const maxRadius = tower.stoneTower.firingRadius;
      const yaw = quat.getAngle(tower.world.rotation, worldRot);
      if (maxRadius < Math.abs(yaw))
        // out of angle
        continue;

      // aim cannon toward boat
      const invRot = quat.invert(tower.world.rotation);
      const localRot = quat.mul(invRot, worldRot);
      quat.copy(cannon.rotation, localRot);

      // quat.identity(cannon.rotation);
      // quat.copy(tower.rotation, worldRot);

      // fire bullet
      const b = fireBullet(
        2,
        cannon.world.position,
        worldRot,
        tower.stoneTower.projectileSpeed,
        0.02,
        GRAVITY,
        // 2.0,
        20.0,
        // TODO(@darzu): make this use vec3.FWD
        vec3.X
      );

      // play sound
      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("cannonL", res.soundSet["cannonL.mp3"], 0.1);
      });

      // debugging
      if (DBG_CANNONS) {
        b.then((b) => {
          if (missed) {
            vec3.set(1, 0, 0, b.color);
          } else {
            vec3.set(0, 1, 0, b.color);
          }
        });
      }

      // reset fire timer
      tower.stoneTower.lastFired = res.time.time;
    }

    // TODO(@darzu): hacky tracking these this way
    vec3.copy(__previousPartyPos, res.party.pos);
    __prevTime = res.time.time;
  }
);

function destroyTower(
  tower: EntityW<[typeof StoneTowerDef, typeof RenderableDef]>,
  bricks: FlyingBrickPool
) {
  let knockedOut = 0;
  let i = 0;
  while (knockedOut < maxFlyingBricks / 2 && i < 200) {
    i++;
    const rowIndex = Math.floor(
      Math.random() * tower.stoneTower.stone.rows.length
    );
    const brickIndex = Math.floor(
      Math.random() * tower.stoneTower.stone.rows[rowIndex].bricks.length
    );
    const brick = tower.stoneTower.stone.rows[rowIndex].bricks[brickIndex];
    if (!brick.knockedOut) {
      knockedOut++;
      knockOutBrickAtIndex(tower.stoneTower.stone, brick.index);
      brick.knockedOut = true;
      const flyingBrick = bricks.spawn();
      flyingBrick.physicsParent.id = tower.id;
      vec3.copy(flyingBrick.position, brick.pos[0]);
      vec3.copy(flyingBrick.color, brick.color);
      vec3.set(0, 0.01, 0, flyingBrick.linearVelocity);
    }
  }
  tower.renderable.hidden = true;
  tower.stoneTower.alive = false;
  const cannon = tower.stoneTower.cannon()!;
  EM.whenEntityHas(cannon, RenderableDef).then(
    (c) => (c.renderable.hidden = true)
  );
}

EM.addSystem(
  "stoneTowerDamage",
  Phase.GAME_WORLD,
  [StoneTowerDef, RenderableDef, WorldFrameDef],
  [PhysicsResultsDef, RendererDef, FlyingBrickPoolDef],
  (es, res) => {
    const ballAABB = createAABB();

    for (let tower of es) {
      const hits = res.physicsResults.collidesWith.get(tower.id);
      if (hits) {
        const balls = hits
          .map((h) => EM.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef]))
          .filter((b) => {
            // TODO(@darzu): check authority and team
            return b && b.bullet.health > 0;
          })
          .map((b) => b!);
        const invertedTransform = mat4.invert(tower.world.transform);
        let totalKnockedOut = 0;
        for (let ball of balls) {
          assert(ball.collider.shape === "AABB");
          copyAABB(ballAABB, ball.collider.aabb);
          transformAABB(ballAABB, ball.world.transform);
          transformAABB(ballAABB, invertedTransform);
          totalKnockedOut += knockOutBricksByBullet(
            tower,
            res.flyingBrickPool,
            ballAABB,
            ball.bullet
          );
        }
        if (totalKnockedOut) {
          EM.whenResources(AudioDef, SoundSetDef).then((res) => {
            res.music.playSound(
              "stonebreak",
              res.soundSet["stonebreak.wav"],
              0.1
            );
          });
          tower.stoneTower.stone.currentBricks -= totalKnockedOut;
          if (
            tower.stoneTower.stone.currentBricks /
              tower.stoneTower.stone.totalBricks <
            MIN_BRICK_PERCENT
          ) {
            destroyTower(tower, res.flyingBrickPool);
          } else {
            for (let row of tower.stoneTower.stone.rows) {
              if (row.bricksKnockedOut === row.totalBricks) {
                destroyTower(tower, res.flyingBrickPool);
              }
            }
          }
          res.renderer.renderer.stdPool.updateMeshVertices(
            tower.renderable.meshHandle,
            tower.stoneTower.stone.mesh
          );
        }
      }
    }
  }
);
