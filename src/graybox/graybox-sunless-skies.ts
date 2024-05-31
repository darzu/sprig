import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { DeletedDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, mat4, quat, V3 } from "../matrix/sprig-matrix.js";
import {
  CubeMesh,
  HexMesh,
  BallMesh,
  CubeRaftMesh,
  UnitCubeMesh,
} from "../meshes/mesh-list.js";
import { XY } from "../meshes/mesh-loader.js";
import {
  cloneMesh,
  createEmptyMesh,
  getAABBFromMesh,
  scaleMesh3,
} from "../meshes/mesh.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MeDef } from "../net/components.js";
import { ColliderDef, DefaultLayer, NoLayer } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { onCollides } from "../physics/phys-helpers.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
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
  clamp,
  jitter,
  lerp,
  randInt,
  randRadian,
  unlerp,
} from "../utils/math.js";
import { FALSE, assert, dbgOnce } from "../utils/util.js";
import { randNormalVec3, vec3Dbg } from "../utils/utils-3d.js";
import { drawLine } from "../utils/utils-game.js";
import { appendBoard, lerpBetween } from "../wood/shipyard.js";
import { createBoardBuilder } from "../wood/wood.js";

/*
# of Sessions: 12

SKETCH:

environment
  world plane
docks
ship
pirates

gameplay:
  front cannon
  docking
    slide into dock
  trade goods
    each dock randomly generates trade missions with timers,
    each dock restocks temp trade goods w/ timer,
    each dock has a set of reliable resource forever, but more expensive,
  upgrades:
    broadside cannons
    relative tracking
    thruster speed
  world danger:
    enemy ships have headlights and smoke trails,
      gives you a heads up when u might encounter them
    graph of possible enemy travel
      enemies pick random new location to travel to
      dead enemies respawn after X seconds
  enemy AI:
    moves toward destination by picking random point on circle in radius R of destination
      draw line from here to there, if unobstructed, that is the path
      waits for velocity drift to near zero before aiming and moving
    aggro bubble
      pulls enemy cluster
    enemy moves toward player
      goal is to be within X distance + facing the player
      shoots when it can
    periodically adjusts to look at the player
      has a %chance of looking aiming correctly
        takes into account velocity (not accel)
        chance is worse as velocity increases
      longer the player stays still, more likely they'll be looking at the player
      if player is moving, chance are much lower
    fires when it's roughly looking at the player, every N seconds + fudge
    occassionally strafes before aiming
    movement is based on target radius from player
      aims toward nearest unobstructed point on circle and moves toward
    flees at Z% health
    

PSEUDO CODE:

init:
  initEnvironment
  initShip
  initShipVsShip
  initDocks
  initTradeRoutes

initEnvironment:
  createWalls
  createDocks
  createNavGraph
  spawnEnemies

initShip:
  setRenderable
  setPosition
  setVelocity
  setShipHeat
  
  on update:
    // move
    accel = f(inputs, shipHeat)
      // strafe costs heat
      // boost costs heat
    vel += accel
    vel -= dampening(vel)
  
  on spacebar:
    // try fire
    kickBack

initShipVsShip:
  on collision(shipA, shipB):
    dmg(shipA)
    dmg(shipB)
    pushBack(shipA)
    pushBack(shipB)

  on collision(ship, bullet)
    dmg(ship)
    pushBack(ship)
    delete(bullet)
  
initDocks:
  for each dock pos:
    createDock
    
*/

const DBG_GRID = true;
const DBG_GIZMO = true;
const DBG_GHOST = false;

// TODO(@darzu): ADD WARNING THAT OBJ INIT PLACED IN CONTACT

const WALL_LAYER = 0b0000000000000010;
const ALLY_LAYER = 0b0000000000000001;
const ENEMY_LAYER = 0b0000000000000100;

export async function initGrayboxSunless() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdMeshPipe,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-20, -20, -20, camera.maxWorldAABB.min);
  V3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { mesh_cube, mesh_hex } = await EM.whenResources(
    CubeMesh.def,
    HexMesh.def
  );

  // dbg ghost
  if (DBG_GHOST) {
    const g = createGhost(mesh_cube.proto);
    g.position[2] = 5;

    // overview
    // vec3.copy(g.position, [16.63, -27.49, 107.08]);
    // quat.copy(g.rotation, [0.0, 0.0, -0.26, 0.97]);
    // g.cameraFollow.pitchOffset = -0.957;

    // zoom on enemy
    V3.copy(g.position, [17.46, 10.74, 4.72]);
    quat.copy(g.rotation, [0.0, 0.0, 0.09, 1.0]);
    V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.692;
  }

  // ground
  // const ground = EM.new();
  // EM.set(ground, RenderableConstructDef, mesh_hex.proto);
  // EM.set(ground, ColorDef, ENDESGA16.blue);
  // EM.set(ground, PositionDef, V(0, -10, 0));
  // EM.set(ground, ScaleDef, V(10, 10, 10));
  // EM.set(ground, ColliderDef, {
  //   shape: "AABB",
  //   solid: true,
  //   aabb: mesh_hex.aabb,
  // });

  // light
  const sun = EM.mk();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, RenderableConstructDef, mesh_cube.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  V3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  V3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 10, 300));

  // gizmo
  if (DBG_GIZMO) {
    const gizmoMesh = createGizmoMesh();
    const gizmo = EM.mk();
    EM.set(gizmo, RenderableConstructDef, gizmoMesh);
    EM.set(gizmo, PositionDef, V(0, 0, 0));
    EM.set(gizmo, ScaleDef, V(5, 5, 5));
  }

  createWorld();

  if (!DBG_GHOST) createPlayerShip();

  createEnemies();
}

const WallDef = EM.defineComponent("sunlessWall", () => true);

async function createWorld() {
  const { mesh_cube, mesh_unitCube } = await EM.whenResources(
    CubeMesh.def,
    UnitCubeMesh.def
  );

  // TODO(@darzu): procedural generate this
  // TODO(@darzu): Since Z_UP, this world desc doesn't match
  const gridWidth = 5;
  const horiEdges = [
    [1, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 1, 1, 1],
  ];
  const vertEdges = [
    [1, 0, 1, 0, 1],
    [1, 0, 1, 1, 1],
    [0, 1, 0, 1, 1],
    [1, 0, 1, 1, 1],
  ];
  const docks: [number, number, "S" | "E" | "N" | "W"][] = [
    [1, 0, "S"],
    [3, 2, "W"],
    [1, 4, "N"],
    [4, 3, "W"],
  ];

  const gridScale = 50;
  const gridHalfScale = gridScale * 0.5;
  const wallWidth = 8;
  const wallHeight = 4;

  if (DBG_GRID) {
    for (let yi = 0; yi < gridWidth; yi++) {
      for (let xi = 0; xi < gridWidth; xi++) {
        const node = EM.mk();
        EM.set(node, PositionDef, V(xi * gridScale, yi * gridScale, 0));
        EM.set(node, RenderableConstructDef, mesh_cube.proto);
        // EM.set(node, ScaleDef, V(0.5, 0.5, 0.5));
        EM.set(node, ColorDef, ENDESGA16.lightBlue);
      }
    }
  }

  function createWall(pos: V3, vertical: boolean, length: number) {
    const wall = EM.mk();
    EM.set(wall, PositionDef, pos);
    EM.set(wall, RenderableConstructDef, mesh_cube.proto);
    if (vertical) EM.set(wall, ScaleDef, V(wallWidth, length, wallHeight));
    else EM.set(wall, ScaleDef, V(length, wallWidth, wallHeight));
    V3.add(wall.scale, wall.scale, V3.scale(randNormalVec3(), wallWidth * 0.1)); // jitter it
    EM.set(wall, ColorDef, ENDESGA16.darkGray);
    EM.set(wall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: mesh_cube.aabb,
      myLayer: WALL_LAYER,
      targetLayer: ALLY_LAYER,
    });
    EM.set(wall, WallDef);
  }

  function createDbgPath(pos: V3, horizontal: boolean) {
    const path = EM.mk();
    EM.set(path, PositionDef, pos);
    EM.set(path, RenderableConstructDef, mesh_cube.proto);
    if (horizontal) EM.set(path, ScaleDef, V(gridHalfScale, 0.2, 0.2));
    else EM.set(path, ScaleDef, V(0.2, gridHalfScale, 0.2));
    EM.set(path, ColorDef, ENDESGA16.lightBlue);
  }

  for (let yi = 0; yi < gridWidth; yi++) {
    for (let xi = 0; xi < gridWidth - 1; xi++) {
      const hasEdge = !!horiEdges[yi][xi];
      const pos = V((xi + 0.5) * gridScale, yi * gridScale, 0);
      if (!hasEdge) createWall(pos, true, gridHalfScale);

      if (DBG_GRID && hasEdge) createDbgPath(pos, true);
    }
  }

  for (let yi = 0; yi < gridWidth - 1; yi++) {
    for (let xi = 0; xi < gridWidth; xi++) {
      const hasEdge = !!vertEdges[yi][xi];
      const pos = V(xi * gridScale, (yi + 0.5) * gridScale, 0);
      if (!hasEdge) createWall(pos, false, gridHalfScale);

      if (DBG_GRID && hasEdge) createDbgPath(pos, false);
    }
  }

  // outer walls
  [
    V(0, gridScale * gridWidth * 0.5, 0),
    V(gridScale * gridWidth * 0.5, 0, 0),
    V(gridScale * gridWidth * 0.5, gridScale * gridWidth, 0),
    V(gridScale * gridWidth, gridScale * gridWidth * 0.5, 0),
  ].forEach((pos, i) => {
    const isVertical = i === 0 || i === 3;
    V3.add(pos, [-gridHalfScale, -gridHalfScale, 0], pos);
    createWall(pos, isVertical, gridScale * gridWidth * 0.5);
  });

  // floor
  {
    const floor = EM.mk();
    EM.set(
      floor,
      ScaleDef,
      V(gridScale * gridWidth, gridScale * gridWidth, wallHeight)
    );
    EM.set(floor, PositionDef, V(-gridHalfScale, -gridHalfScale, -wallHeight));
    EM.set(floor, RenderableConstructDef, mesh_unitCube.proto);
    EM.set(floor, ColorDef, ENDESGA16.blue);
  }

  // docks
  const dockWidth = 5;
  const dockLen = 10.0;
  const dockOffset = 20.0;
  const dockHeight = 2;
  const dirToDockOffset = {
    S: V(0, -dockOffset, 0),
    N: V(0, dockOffset, 0),
    E: V(dockOffset, 0, 0),
    W: V(-dockOffset, 0, 0),
  };
  for (let [xi, yi, dir] of docks) {
    const vert = dir === "N" || dir === "S";
    const node = EM.mk();
    EM.set(node, RenderableConstructDef, mesh_cube.proto);
    EM.set(
      node,
      ScaleDef,
      V(vert ? dockWidth : dockLen, vert ? dockLen : dockWidth, dockHeight)
    );
    EM.set(node, PositionDef, V(xi * gridScale, yi * gridScale, 0));
    V3.add(node.position, dirToDockOffset[dir], node.position);
    EM.set(node, ColorDef, ENDESGA16.orange);
  }
}

const SunlessPlayerDef = EM.defineComponent("sunlessPlayer", () => ({}));

const BulletDef = EM.defineComponent("sunlessBullet", () => ({}));

const SunlessShipDef = EM.defineComponent("sunlessShip", () => ({
  speed: 0.00003,
  yawSpeed: 0.01,
  doDampen: true,
  localAccel: V3.mk(),
  localYaw: 0,
}));

EM.addEagerInit([SunlessShipDef], [], [], (_) => {
  EM.addSystem(
    "moveSunlessShip",
    Phase.POST_GAME_PLAYERS,
    [SunlessShipDef, RotationDef, LinearVelocityDef],
    [TimeDef],
    (ships, res) => {
      for (let e of ships) {
        // acceleration
        const speed = e.sunlessShip.speed * res.time.dt;
        const rotatedAccel = V3.tQuat(e.sunlessShip.localAccel, e.rotation);

        // turn
        quat.yaw(
          e.rotation,
          e.sunlessShip.localYaw * e.sunlessShip.yawSpeed,
          e.rotation
        );

        // reset turn
        e.sunlessShip.localYaw = 0;

        // dampen
        if (e.sunlessShip.doDampen && V3.sqrLen(rotatedAccel) === 0) {
          const dampDir = V3.norm(V3.neg(e.linearVelocity));
          V3.scale(dampDir, speed, rotatedAccel);

          // halt if at small delta
          if (V3.sqrLen(e.linearVelocity) < V3.sqrLen(rotatedAccel)) {
            V3.zero(rotatedAccel);
            V3.zero(e.linearVelocity);
          }
        }

        // move ship
        V3.add(e.linearVelocity, rotatedAccel, e.linearVelocity);

        // reset acceleration
        V3.zero(e.sunlessShip.localAccel);
      }
    }
  );
});

EM.addEagerInit([SunlessPlayerDef], [CubeMesh.def], [], ({ mesh_cube }) => {
  EM.addSystem(
    "moveSunlessPlayerShip",
    Phase.GAME_PLAYERS,
    [SunlessPlayerDef, SunlessShipDef],
    [InputsDef, TimeDef],
    (ships, res) => {
      if (!ships.length) return;
      assert(ships.length === 1);
      const e = ships[0];

      let speed = e.sunlessShip.speed * res.time.dt;

      // 4-DOF translation
      if (res.inputs.keyDowns["q"]) e.sunlessShip.localAccel[0] -= speed;
      if (res.inputs.keyDowns["e"]) e.sunlessShip.localAccel[0] += speed;
      if (res.inputs.keyDowns["w"]) e.sunlessShip.localAccel[1] += speed;
      if (res.inputs.keyDowns["s"]) e.sunlessShip.localAccel[1] -= speed;

      // turning
      if (res.inputs.keyDowns["a"]) e.sunlessShip.localYaw = -1;
      if (res.inputs.keyDowns["d"]) e.sunlessShip.localYaw = 1;

      // change dampen?
      if (res.inputs.keyClicks["z"])
        e.sunlessShip.doDampen = !e.sunlessShip.doDampen;
    }
  );

  const bulletVel = V(0, 0.1, 0);
  EM.addSystem(
    "controlSunlessShip",
    Phase.GAME_PLAYERS,
    [SunlessPlayerDef, RotationDef, LinearVelocityDef, PositionDef],
    [InputsDef, TimeDef],
    (ships, res) => {
      if (!ships.length) return;
      assert(ships.length === 1);
      const ship = ships[0];

      if (res.inputs.keyClicks[" "]) {
        const bullet = EM.mk();
        EM.set(bullet, PositionDef, V3.clone(ship.position));
        EM.set(bullet, RenderableConstructDef, mesh_cube.proto);
        EM.set(bullet, ColorDef, ENDESGA16.darkGreen);
        EM.set(bullet, ScaleDef, V(0.5, 1, 0.5));
        EM.set(bullet, BulletDef);
        EM.set(bullet, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: mesh_cube.aabb,
          myLayer: NoLayer,
          targetLayer: WALL_LAYER | ENEMY_LAYER,
        });

        // orientation & velocity
        EM.set(bullet, LinearVelocityDef, V3.clone(bulletVel));
        EM.set(bullet, RotationDef, quat.clone(ship.rotation));
        V3.tQuat(bullet.linearVelocity, bullet.rotation, bullet.linearVelocity);
        V3.add(
          ship.linearVelocity,
          bullet.linearVelocity,
          bullet.linearVelocity
        );

        // kickback
        const kickback = V3.neg(bullet.linearVelocity);
        V3.scale(kickback, 0.1, kickback);
        V3.add(ship.linearVelocity, kickback, ship.linearVelocity);
      }
    }
  );

  onCollides(
    [BulletDef, LinearVelocityDef],
    [
      EnemyDef,
      // HealthDef,
      LinearVelocityDef,
    ],
    [],
    (bullet, enemy) => {
      // hurt ship
      // enemy.health.value -= 10;

      // knockback ship
      const knockback = V3.scale(bullet.linearVelocity, 0.1);
      V3.add(enemy.linearVelocity, knockback, enemy.linearVelocity);

      // delete the bullet
      EM.set(bullet, DeletedDef);
    }
  );

  onCollides([BulletDef], [WallDef], [], (a, b) => {
    // console.log("HIT WALL!");
    EM.set(a, DeletedDef);
  });
});

async function createPlayerShip() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

  const ship = EM.mk();
  EM.set(ship, PositionDef, V(9, 8, 0));
  EM.set(ship, RotationDef);
  quat.yaw(ship.rotation, Math.PI * 0.4, ship.rotation);
  EM.set(ship, LinearVelocityDef);
  const mesh = cloneMesh(mesh_cube.mesh);
  scaleMesh3(mesh, [1, 2, 1]);
  EM.set(ship, RenderableConstructDef, mesh);
  EM.set(ship, ColorDef, ENDESGA16.lightGreen);
  EM.set(ship, CameraFollowDef);
  V3.copy(ship.cameraFollow.positionOffset, [0.0, -50.0, 0.0]);
  ship.cameraFollow.pitchOffset = -Math.PI * 0.5;
  EM.set(ship, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: getAABBFromMesh(mesh),
    myLayer: ALLY_LAYER,
    targetLayer: WALL_LAYER | ENEMY_LAYER,
  });
  EM.set(ship, SunlessPlayerDef);
  EM.set(ship, SunlessShipDef);
  // EM.set(ship, HealthDef, 0, 100, 90);

  // EM.addSystem(
  //   "dbgSunlessCamera",
  //   Phase.GAME_PLAYERS,
  //   [],
  //   [InputsDef],
  //   (_, res) => {
  //     if (res.inputs.keyDowns["w"]) ship.cameraFollow.pitchOffset += 0.01;
  //     if (res.inputs.keyDowns["s"]) ship.cameraFollow.pitchOffset -= 0.01;

  //     console.log(
  //       `ship.cameraFollow.pitchOffset: ${ship.cameraFollow.pitchOffset}`
  //     );
  //   }
  // );

  EM.set(ship, SunlessPlayerDef);
}

const EnemyDef = EM.defineComponent("sunlessEnemy", () => ({}));

async function createEnemies() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

  const ship = EM.mk();
  EM.set(ship, PositionDef, V(15, 17, 0));
  EM.set(ship, RotationDef);
  quat.yaw(ship.rotation, randRadian(), ship.rotation);
  EM.set(ship, LinearVelocityDef);
  const mesh = cloneMesh(mesh_cube.mesh);
  scaleMesh3(mesh, [1, 1, 2]);
  mesh.pos.forEach((p) => {
    if (p[1] >= 0) {
      // squash front
      p[0] *= 0.8;
      p[2] *= 0.8;
    }
  });
  EM.set(ship, RenderableConstructDef, mesh);
  EM.set(ship, ColorDef, ENDESGA16.red);
  EM.set(ship, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: getAABBFromMesh(mesh),
    myLayer: ENEMY_LAYER,
    targetLayer: WALL_LAYER | ALLY_LAYER | ENEMY_LAYER,
  });
  EM.set(ship, EnemyDef);
  EM.set(ship, SunlessShipDef);
  // EM.set(ship, HealthDef, 0, 100, 90);
}
