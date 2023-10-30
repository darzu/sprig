import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { DeletedDef } from "../ecs/delete.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, mat4, quat, vec3 } from "../matrix/sprig-matrix.js";
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
import { createMultiBarMesh } from "../meshes/primatives.js";
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
import { jitter, lerp, randInt, randRadian } from "../utils/math.js";
import { assert, dbgOnce } from "../utils/util.js";
import {
  quatFromUpForward,
  randNormalVec3,
  vec3Dbg,
} from "../utils/utils-3d.js";
import { drawLine } from "../utils/utils-game.js";
import { appendBoard, lerpBetween } from "../wood/shipyard.js";
import { createTimberBuilder } from "../wood/wood.js";

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
const DBG_GIZMO = false;
const DBG_GHOST = true;

// TODO(@darzu): ADD WARNING THAT OBJ INIT PLACED IN CONTACT

const WALL_LAYER = 0b0000000000000010;
const ALLY_LAYER = 0b0000000000000001;
const ENEMY_LAYER = 0b0000000000000100;

export async function initGrayboxSunless() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { mesh_cube, mesh_hex } = await EM.whenResources(
    CubeMesh.def,
    HexMesh.def
  );

  // dbg ghost
  if (DBG_GHOST) {
    const g = createGhost();
    g.position[1] = 5;
    EM.set(g, RenderableConstructDef, mesh_cube.proto);

    // overview
    // vec3.copy(g.position, [102.41, 142.23, 154.95]);
    // quat.copy(g.rotation, [0.0, 0.0, 0.0, 0.99]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -1.388;

    // close up of corner
    vec3.copy(g.position, [6.5, 11.81, 9.94]);
    quat.copy(g.rotation, [0.0, -0.86, 0.0, 0.49]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.871;
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
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, RenderableConstructDef, mesh_cube.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 300, 10));

  // gizmo
  if (DBG_GIZMO) {
    const gizmoMesh = createGizmoMesh();
    const gizmo = EM.new();
    EM.set(gizmo, RenderableConstructDef, gizmoMesh);
    EM.set(gizmo, PositionDef, V(0, 0, 0));
    EM.set(gizmo, ScaleDef, V(5, 5, 5));
  }

  createWorld();

  if (!DBG_GHOST) createPlayerShip();

  createEnemies();

  initHealthBars();
}

const WallDef = EM.defineComponent("sunlessWall", () => true);

async function createWorld() {
  const { mesh_cube, mesh_unitCube } = await EM.whenResources(
    CubeMesh.def,
    UnitCubeMesh.def
  );

  // TODO(@darzu): procedural generate this
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
    for (let zi = 0; zi < gridWidth; zi++) {
      for (let xi = 0; xi < gridWidth; xi++) {
        const node = EM.new();
        EM.set(node, PositionDef, V(xi * gridScale, 0, zi * gridScale));
        EM.set(node, RenderableConstructDef, mesh_cube.proto);
        // EM.set(node, ScaleDef, V(0.5, 0.5, 0.5));
        EM.set(node, ColorDef, ENDESGA16.lightBlue);
      }
    }
  }

  function createWall(pos: vec3, vertical: boolean, length: number) {
    const wall = EM.new();
    EM.set(wall, PositionDef, pos);
    EM.set(wall, RenderableConstructDef, mesh_cube.proto);
    if (vertical) EM.set(wall, ScaleDef, V(wallWidth, wallHeight, length));
    else EM.set(wall, ScaleDef, V(length, wallHeight, wallWidth));
    vec3.add(
      wall.scale,
      vec3.scale(randNormalVec3(), wallWidth * 0.1),
      wall.scale
    ); // jitter it
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

  function createDbgPath(pos: vec3, horizontal: boolean) {
    const path = EM.new();
    EM.set(path, PositionDef, pos);
    EM.set(path, RenderableConstructDef, mesh_cube.proto);
    if (horizontal) EM.set(path, ScaleDef, V(gridHalfScale, 0.2, 0.2));
    else EM.set(path, ScaleDef, V(0.2, 0.2, gridHalfScale));
    EM.set(path, ColorDef, ENDESGA16.lightBlue);
  }

  for (let zi = 0; zi < gridWidth; zi++) {
    for (let xi = 0; xi < gridWidth - 1; xi++) {
      const hasEdge = !!horiEdges[zi][xi];
      const pos = V((xi + 0.5) * gridScale, 0, zi * gridScale);
      if (!hasEdge) createWall(pos, true, gridHalfScale);

      if (DBG_GRID && hasEdge) createDbgPath(pos, true);
    }
  }

  for (let zi = 0; zi < gridWidth - 1; zi++) {
    for (let xi = 0; xi < gridWidth; xi++) {
      const hasEdge = !!vertEdges[zi][xi];
      const pos = V(xi * gridScale, 0, (zi + 0.5) * gridScale);
      if (!hasEdge) createWall(pos, false, gridHalfScale);

      if (DBG_GRID && hasEdge) createDbgPath(pos, false);
    }
  }

  // outer walls
  [
    V(0, 0, gridScale * gridWidth * 0.5),
    V(gridScale * gridWidth * 0.5, 0, 0),
    V(gridScale * gridWidth * 0.5, 0, gridScale * gridWidth),
    V(gridScale * gridWidth, 0, gridScale * gridWidth * 0.5),
  ].forEach((pos, i) => {
    const isVertical = i === 0 || i === 3;
    vec3.add(pos, [-gridHalfScale, 0, -gridHalfScale], pos);
    createWall(pos, isVertical, gridScale * gridWidth * 0.5);
  });

  // floor
  {
    const floor = EM.new();
    EM.set(
      floor,
      ScaleDef,
      V(gridScale * gridWidth, wallHeight, gridScale * gridWidth)
    );
    EM.set(floor, PositionDef, V(-gridHalfScale, -wallHeight, -gridHalfScale));
    EM.set(floor, RenderableConstructDef, mesh_unitCube.proto);
    EM.set(floor, ColorDef, ENDESGA16.blue);
  }

  // docks
  const dockWidth = 5;
  const dockLen = 10.0;
  const dockOffset = 20.0;
  const dockHeight = 2;
  const dirToDockOffset = {
    S: V(0, 0, dockOffset),
    N: V(0, 0, -dockOffset),
    E: V(dockOffset, 0, 0),
    W: V(-dockOffset, 0, 0),
  };
  for (let [xi, zi, dir] of docks) {
    const vert = dir === "N" || dir === "S";
    const node = EM.new();
    EM.set(node, RenderableConstructDef, mesh_cube.proto);
    EM.set(
      node,
      ScaleDef,
      V(vert ? dockWidth : dockLen, dockHeight, vert ? dockLen : dockWidth)
    );
    EM.set(node, PositionDef, V(xi * gridScale, 0, zi * gridScale));
    vec3.add(node.position, dirToDockOffset[dir], node.position);
    EM.set(node, ColorDef, ENDESGA16.orange);
  }
}

const SunlessPlayerDef = EM.defineComponent("sunlessPlayer", () => ({
  speed: 0.00003,
  turnSpeed: 0.001,
  rollSpeed: 0.01,
  doDampen: true,
  localAccel: vec3.create(),
}));

const BulletDef = EM.defineComponent("sunlessBullet", () => ({}));

const HealthDef = EM.defineComponent(
  "health",
  () => 100,
  (p, max: number) => max
);

EM.addEagerInit([SunlessPlayerDef], [CubeMesh.def], [], ({ mesh_cube }) => {
  EM.addSystem(
    "moveSunlessShip",
    Phase.GAME_PLAYERS,
    [SunlessPlayerDef, RotationDef, LinearVelocityDef],
    [InputsDef, TimeDef],
    (ships, res) => {
      if (!ships.length) return;
      assert(ships.length === 1);
      const e = ships[0];

      let speed = e.sunlessPlayer.speed * res.time.dt;

      vec3.zero(e.sunlessPlayer.localAccel);
      // 4-DOF translation
      if (res.inputs.keyDowns["q"]) e.sunlessPlayer.localAccel[0] -= speed;
      if (res.inputs.keyDowns["e"]) e.sunlessPlayer.localAccel[0] += speed;
      if (res.inputs.keyDowns["w"]) e.sunlessPlayer.localAccel[2] -= speed;
      if (res.inputs.keyDowns["s"]) e.sunlessPlayer.localAccel[2] += speed;

      const rotatedAccel = vec3.transformQuat(
        e.sunlessPlayer.localAccel,
        e.rotation
      );

      let rollSpeed = 0;
      if (res.inputs.keyDowns["a"]) rollSpeed = 1;
      if (res.inputs.keyDowns["d"]) rollSpeed = -1;

      quat.rotateY(
        e.rotation,
        rollSpeed * e.sunlessPlayer.rollSpeed,
        e.rotation
      );

      // change dampen?
      if (res.inputs.keyClicks["z"])
        e.sunlessPlayer.doDampen = !e.sunlessPlayer.doDampen;

      // dampener
      if (e.sunlessPlayer.doDampen && vec3.sqrLen(rotatedAccel) === 0) {
        const dampDir = vec3.normalize(vec3.negate(e.linearVelocity));
        vec3.scale(dampDir, speed, rotatedAccel);

        // halt if at small delta
        if (vec3.sqrLen(e.linearVelocity) < vec3.sqrLen(rotatedAccel)) {
          vec3.zero(rotatedAccel);
          vec3.zero(e.linearVelocity);
        }
      }

      vec3.add(e.linearVelocity, rotatedAccel, e.linearVelocity);
    }
  );

  const bulletVel = V(0, 0, -0.1);
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
        const bullet = EM.new();
        EM.set(bullet, PositionDef, vec3.clone(ship.position));
        EM.set(bullet, RenderableConstructDef, mesh_cube.proto);
        EM.set(bullet, ColorDef, ENDESGA16.darkGreen);
        EM.set(bullet, ScaleDef, V(0.5, 0.5, 1));
        EM.set(bullet, BulletDef);
        EM.set(bullet, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: mesh_cube.aabb,
          myLayer: NoLayer,
          targetLayer: WALL_LAYER | ENEMY_LAYER,
        });

        // orientation & velocity
        EM.set(bullet, LinearVelocityDef, vec3.clone(bulletVel));
        EM.set(bullet, RotationDef, quat.clone(ship.rotation));
        vec3.transformQuat(
          bullet.linearVelocity,
          bullet.rotation,
          bullet.linearVelocity
        );
        vec3.add(
          ship.linearVelocity,
          bullet.linearVelocity,
          bullet.linearVelocity
        );

        // kickback
        const kickback = vec3.negate(bullet.linearVelocity);
        vec3.scale(kickback, 0.2, kickback);
        vec3.add(ship.linearVelocity, kickback, ship.linearVelocity);
      }
    }
  );

  onCollides([BulletDef], [EnemyDef], [], (a, b) => {
    // console.log("HIT SHIP!");
    // TODO(@darzu): IMPL dmg enemy logic
    EM.set(a, DeletedDef);
  });

  onCollides([BulletDef], [WallDef], [], (a, b) => {
    // console.log("HIT WALL!");
    EM.set(a, DeletedDef);
  });
});

const SunlessShipDef = EM.defineComponent("sunlessShip", () => ({}));

async function createPlayerShip() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

  const ship = EM.new();
  EM.set(ship, PositionDef, V(9, 0, 8));
  EM.set(ship, RotationDef);
  quat.rotateY(ship.rotation, -Math.PI * 0.4, ship.rotation);
  EM.set(ship, LinearVelocityDef);
  const mesh = cloneMesh(mesh_cube.mesh);
  scaleMesh3(mesh, [1, 1, 2]);
  EM.set(ship, RenderableConstructDef, mesh);
  EM.set(ship, ColorDef, ENDESGA16.lightGreen);
  EM.set(ship, CameraFollowDef);
  vec3.copy(ship.cameraFollow.positionOffset, [0.0, 0.0, 50.0]);
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
  EM.set(ship, HealthDef, 100);

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

const EnemyDef = EM.defineComponent("sunlessEnemy", () => ({
  // TODO(@darzu):
}));

async function createEnemies() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

  const ship = EM.new();
  EM.set(ship, PositionDef, V(15, 0, 17));
  EM.set(ship, RotationDef);
  quat.rotateY(ship.rotation, randRadian(), ship.rotation);
  EM.set(ship, LinearVelocityDef);
  const mesh = cloneMesh(mesh_cube.mesh);
  scaleMesh3(mesh, [1, 1, 2]);
  mesh.pos.forEach((p) => {
    if (p[2] < 0) {
      // in -Z, squash X and Y
      p[0] *= 0.8;
      p[1] *= 0.8;
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
  EM.set(ship, HealthDef, 50);
}

const HealthBarDef = EM.defineComponent("healthBar", () => true);

async function initHealthBars() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);
  const hasBar = new Set<number>();

  const offset = V(2, 0, 0);

  // TODO(@darzu): IMPL!
  // const barMesh =

  const barMesh = createMultiBarMesh({
    width: 0.2,
    length: 3.0,
    centered: true,
    fullColor: ENDESGA16.red,
    missingColor: ENDESGA16.darkGreen,
  });

  EM.addSystem(
    "addRemoveHealthBars",
    Phase.GAME_WORLD,
    [HealthDef],
    [],
    (hs, res) => {
      // TODO(@darzu): FOO
      for (let h of hs) {
        if (!hasBar.has(h.id)) {
          // TODO(@darzu): create bar
          const bar = EM.new();
          const mesh = cloneMesh(barMesh);
          EM.set(bar, RenderableConstructDef, mesh);
          EM.set(bar, PositionDef, vec3.clone(offset));
          EM.set(bar, PhysicsParentDef, h.id);
          EM.set(bar, HealthBarDef);

          hasBar.add(h.id);
        }
      }
    }
  );

  EM.addSystem(
    "renderHealthBars",
    Phase.GAME_WORLD,
    [HealthBarDef, RenderableDef],
    [RendererDef],
    (hs, res) => {
      const startPosIdx = 4;
      const lastPosIdx = startPosIdx + 3;
      // TODO(@darzu): FOO
      if (dbgOnce("renderHealth"))
        for (let h of hs) {
          const handle = h.renderable.meshHandle;
          assert(handle.mesh);
          const mesh = handle.mesh;
          const min = mesh.pos.at(0)![2]; // first Z;
          const max = mesh.pos.at(-1)![2]; // last Z;
          const percent = 0.8; // TODO(@darzu): update from stat
          const lerped = lerp(min, max, percent);
          mesh.pos.forEach((p, i) => {
            console.log(`${i}: ${vec3Dbg(p)}`);
            if (startPosIdx <= i && i <= lastPosIdx) {
              console.log(`before ${i}[2] = ${p[2]}`);
              // console.log(`${p[2]} -> ${lerped}`);
              // p[2] = lerped;
              // p[2] -= 0.002;
              p[2] -= 0.3;
              // p[2] += 0.6;
              // p[2] = -0.8;
              // p[2] = 0.8999999761581421;
              console.log(`after ${i}[2] = ${p[2]}`);
              // p[2] = -1;
              // p[2] = -2.2;
              // p[2] = -0.9 + jitter(0.1);
              // p[2] = -0;
            }
          });
          console.log(`min: ${min}, max: ${max}, lerped: ${lerped}`);
          console.dir(mesh);
          res.renderer.renderer.stdPool.updateMeshVertices(
            handle,
            mesh,
            startPosIdx,
            4
          );
        }
    }
  );
}
