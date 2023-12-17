import { CubeMesh, LD53CannonMesh } from "../meshes/mesh-list.js";
import { AudioDef } from "../audio/audio.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { createRef, Ref } from "../ecs/em-helpers.js";
import { Component, EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
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
import { StoneTowerDef, Tower } from "./tower.js";

const GRAVITY = 6.0 * 0.00001;

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

export function createEmptyStoneState(): StoneState {
  return {
    mesh: createEmptyMesh("tower"),
    rows: [],
    totalBricks: 0,
    currentBricks: 0,
    aabb: createAABB(),
  };
}

export function knockOutBrickAtIndex(stone: StoneState, index: number) {
  for (let i = 0; i < 8; i++) {
    vec3.set(0, 0, 0, stone.mesh.pos[index + i]);
  }
}

let towardsAttractorTmp = vec3.tmp();
let testAABBTmp = vec3.tmp();

export function shrinkBrickAtIndex(
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
export function knockOutBricks(
  stone: StoneState,
  aabb: AABB,
  shrink = false
): number {
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
export function knockOutBricksByBullet(
  tower: EntityW<[typeof StoneTowerDef]>,
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
            FlyingBrickPool.spawn().then((flyingBrick) => {
              flyingBrick.physicsParent.id = tower.id;
              //console.log(brick.pos[0]);
              vec3.copy(flyingBrick.position, brick.pos[0]);
              vec3.copy(flyingBrick.color, brick.color);
            });
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

export function restoreAllBricks(tower: Tower): number {
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

export const approxBrickWidth: number = 5;
export const approxBrickHeight: number = 2;
export const brickDepth: number = 2.5;
export const startingBrickHealth = 1;

export function calculateNAndBrickWidth(
  radius: number,
  approxBrickWidth: number
): [number, number] {
  const n = Math.floor(Math.PI / Math.asin(approxBrickWidth / (2 * radius)));
  const brickWidth = radius * 2 * Math.sin(Math.PI / n);
  return [n, brickWidth];
}

export const FlyingBrickDef = EM.defineComponent("flyingBrick", () => true);

export const FlyingBrickPool = createEntityPool<
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
>({
  max: 50,
  maxBehavior: "rand-despawn",
  create: async () => {
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
  onSpawn: async (e) => {
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

EM.addSystem(
  "despawnFlyingBricks",
  Phase.GAME_WORLD,
  [FlyingBrickDef, DeadDef],
  [],
  (es, _) =>
    es.forEach((e) => {
      if (!e.dead.processed) {
        //console.log("despawning brick");
        FlyingBrickPool.despawn(e);
      }
    })
);
