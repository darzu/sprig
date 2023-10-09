import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import {
  CubeMesh,
  HexMesh,
  BallMesh,
  CubeRaftMesh,
  UnitCubeMesh,
} from "../meshes/mesh-list.js";
import { XY } from "../meshes/mesh-loader.js";
import { cloneMesh, scaleMesh3 } from "../meshes/mesh.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";

/*
# of Sessions: 6

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

const DBG_GRID = false;
const DBG_GIZMO = false;

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
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { mesh_cube, mesh_hex } = await EM.whenResources(
    CubeMesh.def,
    HexMesh.def
  );

  // dbg ghost
  const g = createGhost();
  g.position[1] = 5;
  EM.set(g, RenderableConstructDef, mesh_cube.proto);
  vec3.copy(g.position, [-0.5, 10.7, 15.56]);
  quat.copy(g.rotation, [0.0, -0.09, 0.0, 0.99]);
  g.cameraFollow.pitchOffset = -0.32;

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

  createPlayerShip();
}

async function createWorld() {
  const { mesh_cube, mesh_unitCube } = await EM.whenResources(
    CubeMesh.def,
    UnitCubeMesh.def
  );

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

  const gridScale = 5;
  const gridHalfScale = gridScale * 0.5;
  const wallWidth = 0.8;

  if (DBG_GRID)
    for (let zi = 0; zi < gridWidth; zi++) {
      for (let xi = 0; xi < gridWidth; xi++) {
        const node = EM.new();
        EM.set(node, PositionDef, V(xi * gridScale, 0, zi * gridScale));
        EM.set(node, RenderableConstructDef, mesh_cube.proto);
        EM.set(node, ScaleDef, V(0.5, 0.5, 0.5));
        EM.set(node, ColorDef, ENDESGA16.darkRed);
      }
    }

  for (let zi = 0; zi < gridWidth; zi++) {
    for (let xi = 0; xi < gridWidth - 1; xi++) {
      const hasEdge = !!horiEdges[zi][xi];
      const pos = V((xi + 0.5) * gridScale, 0, zi * gridScale);
      if (!hasEdge) {
        const wall = EM.new();
        EM.set(wall, PositionDef, pos);
        EM.set(wall, RenderableConstructDef, mesh_cube.proto);
        EM.set(wall, ScaleDef, V(wallWidth, wallWidth, gridHalfScale));
        EM.set(wall, ColorDef, ENDESGA16.darkGray);
      } else if (DBG_GRID) {
        const path = EM.new();
        EM.set(path, PositionDef, pos);
        EM.set(path, RenderableConstructDef, mesh_cube.proto);
        EM.set(path, ScaleDef, V(gridHalfScale, 0.2, 0.2));
        EM.set(path, ColorDef, ENDESGA16.darkRed);
      }
    }
  }

  for (let zi = 0; zi < gridWidth - 1; zi++) {
    for (let xi = 0; xi < gridWidth; xi++) {
      const hasEdge = !!vertEdges[zi][xi];
      const pos = V(xi * gridScale, 0, (zi + 0.5) * gridScale);
      if (!hasEdge) {
        const wall = EM.new();
        EM.set(wall, PositionDef, pos);
        EM.set(wall, RenderableConstructDef, mesh_cube.proto);
        EM.set(wall, ScaleDef, V(gridHalfScale, wallWidth, wallWidth));
        EM.set(wall, ColorDef, ENDESGA16.darkGray);
      } else if (DBG_GRID) {
        const path = EM.new();
        EM.set(path, PositionDef, pos);
        EM.set(path, RenderableConstructDef, mesh_cube.proto);
        EM.set(path, ScaleDef, V(0.2, 0.2, gridHalfScale));
        EM.set(path, ColorDef, ENDESGA16.darkRed);
      }
    }
  }

  // outer walls
  [
    V(0, 0, gridScale * gridWidth * 0.5),
    V(gridScale * gridWidth * 0.5, 0, 0),
    V(gridScale * gridWidth * 0.5, 0, gridScale * gridWidth),
    V(gridScale * gridWidth, 0, gridScale * gridWidth * 0.5),
  ].forEach((pos) => {
    const wall = EM.new();
    EM.set(
      wall,
      ScaleDef,
      V(
        pos[0] % 1 ? gridScale * gridWidth * 0.5 : wallWidth,
        wallWidth,
        pos[2] % 1 ? gridScale * gridWidth * 0.5 : wallWidth
      )
    );
    vec3.add(pos, [-gridHalfScale, 0, -gridHalfScale], pos);
    EM.set(wall, PositionDef, pos);
    EM.set(wall, RenderableConstructDef, mesh_cube.proto);
    EM.set(wall, ColorDef, ENDESGA16.darkGray);
  });

  // floor
  {
    const wall = EM.new();
    EM.set(
      wall,
      ScaleDef,
      V(gridScale * gridWidth, wallWidth, gridScale * gridWidth)
    );
    EM.set(wall, PositionDef, V(-gridHalfScale, -wallWidth, -gridHalfScale));
    EM.set(wall, RenderableConstructDef, mesh_unitCube.proto);
    EM.set(wall, ColorDef, ENDESGA16.blue);
  }

  // docks
  const dockWidth = 0.5;
  const dockLen = 1.0;
  const dockOffset = 2.0;
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
      V(vert ? dockWidth : dockLen, 0.2, vert ? dockLen : dockWidth)
    );
    EM.set(node, PositionDef, V(xi * gridScale, 0, zi * gridScale));
    vec3.add(node.position, dirToDockOffset[dir], node.position);
    EM.set(node, ColorDef, ENDESGA16.orange);
  }
}

async function createPlayerShip() {
  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

  // TODO(@darzu):
  const ship = EM.new();
  EM.set(ship, PositionDef, V(0.2, 0, 0.2));
  const mesh = cloneMesh(mesh_cube.mesh);
  scaleMesh3(mesh, [0.1, 0.1, 0.2]);
  EM.set(ship, RenderableConstructDef, mesh);
  EM.set(ship, ColorDef, ENDESGA16.lightGreen);
}
