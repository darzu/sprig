import { AudioDef } from "../audio/audio.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { transformYUpModelIntoZUp } from "../camera/basis.js";
import { BulletDef } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { Ref, createRef } from "../ecs/em-helpers.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3, mat4 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import { LD53CannonMesh, CubeMesh } from "../meshes/mesh-list.js";
import { XY } from "../meshes/mesh-loader.js";
import {
  createAABB,
  copyAABB,
  transformAABB,
  AABB,
  mergeAABBs,
  updateAABBWithPoint,
} from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import {
  WorldFrameDef,
  PhysicsResultsDef,
} from "../physics/nonintersection.js";
import {
  PositionDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { jitter } from "../utils/math.js";
import { assert } from "../utils/util.js";
import {
  Brick,
  BrickRow,
  StoneState,
  approxBrickHeight,
  approxBrickWidth,
  brickDepth,
  calculateNAndBrickWidth,
  createEmptyStoneState,
  FlyingBrickPool,
  knockOutBrickAtIndex,
  knockOutBricks,
  restoreAllBricks,
  startingBrickHealth,
  knockOutBricksByBullet,
} from "./stone.js";

const maxStoneTowers = 10;

const height: number = 70;
const baseRadius: number = 20;

export interface Tower {
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
    } as Tower)
);

const TowerMeshes = XY.defineMeshSetResource(
  "towerMeshes",
  LD53CannonMesh,
  CubeMesh
);

const baseColor = ENDESGA16.lightGray;

// TODO(@darzu): remove?
const coolMode: boolean = false;

// TODO(@darzu): Z_UP: this fn
function createTowerState(): StoneState {
  const state = createEmptyStoneState();
  const mesh = state.mesh;

  const rows = Math.floor(height / approxBrickHeight);
  const brickHeight = height / rows;

  const cursor = mat4.create();
  function applyCursor(v: vec3, distort: boolean = false): vec3 {
    vec3.transformMat4(v, cursor, v);
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
    state.mesh.pos.forEach((v) =>
      vec3.transformMat4(v, transformYUpModelIntoZUp, v)
    );
    transformAABB(state.aabb, transformYUpModelIntoZUp);
  }

  return state;
}

export const towerPool = createEntityPool<
  [typeof StoneTowerDef, typeof PositionDef, typeof RotationDef]
>({
  max: maxStoneTowers,
  maxBehavior: "crash",
  create: async () => {
    const res = await EM.whenResources(TowerMeshes);
    const tower = EM.new();
    const cannon = EM.new();
    EM.set(cannon, RenderableConstructDef, res.towerMeshes.ld53_cannon.proto);
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
    return tower;
  },
  onSpawn: async (p) => {
    const cannon = p.stoneTower.cannon()!;

    EM.tryRemoveComponent(p.id, DeadDef);
    EM.tryRemoveComponent(cannon.id, DeadDef);

    if (RenderableDef.isOn(p)) p.renderable.hidden = false;
    if (RenderableDef.isOn(cannon)) cannon.renderable.hidden = false;

    // platform.towerPlatform.tiltPeriod = tiltPeriod;
    // platform.towerPlatform.tiltTimer = tiltTimer;
    p.stoneTower.lastFired = 0;
    if (restoreAllBricks(p.stoneTower)) {
      const res = await EM.whenResources(RendererDef);
      const meshHandle = (await EM.whenEntityHas(p, RenderableDef)).renderable
        .meshHandle;
      res.renderer.renderer.stdPool.updateMeshVertices(
        meshHandle,
        p.stoneTower.stone.mesh
      );
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

export async function spawnStoneTower() {
  return towerPool.spawn();
}

function destroyTower(
  tower: EntityW<[typeof StoneTowerDef, typeof RenderableDef]>
) {
  let knockedOut = 0;
  let i = 0;
  while (knockedOut < FlyingBrickPool.params.max / 2 && i < 200) {
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
      FlyingBrickPool.spawn().then((flyingBrick) => {
        flyingBrick.physicsParent.id = tower.id;
        vec3.copy(flyingBrick.position, brick.pos[0]);
        vec3.copy(flyingBrick.color, brick.color);
        vec3.set(0, 0.01, 0, flyingBrick.linearVelocity);
      });
    }
  }
  tower.renderable.hidden = true;
  tower.stoneTower.alive = false;
  const cannon = tower.stoneTower.cannon()!;
  EM.whenEntityHas(cannon, RenderableDef).then(
    (c) => (c.renderable.hidden = true)
  );
}

const MIN_BRICK_PERCENT = 0.6;

EM.addSystem(
  "stoneTowerDamage",
  Phase.GAME_WORLD,
  [StoneTowerDef, RenderableDef, WorldFrameDef],
  [PhysicsResultsDef, RendererDef],
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
            destroyTower(tower);
          } else {
            for (let row of tower.stoneTower.stone.rows) {
              if (row.bricksKnockedOut === row.totalBricks) {
                destroyTower(tower);
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
