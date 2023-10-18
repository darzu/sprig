import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import {
  CubeMesh,
  HexMesh,
  BallMesh,
  CubeRaftMesh,
  UnitCubeMesh,
  GizmoMesh,
  BulletMesh,
} from "../meshes/mesh-list.js";
import { XY } from "../meshes/mesh-loader.js";
import { cloneMesh, getAABBFromMesh, scaleMesh3 } from "../meshes/mesh.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MeDef } from "../net/components.js";
import { ColliderDef, DefaultLayer } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { randInt, randRadian } from "../utils/math.js";
import { assert } from "../utils/util.js";
import { randNormalVec3 } from "../utils/utils-3d.js";

/*
SKETCH:

environment
  world plane
enemies
pickups
exits
    
*/

const DBG_GRID = true;
const DBG_GIZMO = false;
const DBG_GHOST = false;

// TODO(@darzu): ADD WARNING THAT OBJ INIT PLACED IN CONTACT

const WALL_LAYER = 0b0000000000000010;

export async function initGrayboxAR() {
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
  camera.nearClipDist = -100;
  camera.viewDist = 400;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  camera.perspectiveMode = "ortho";
  camera.orthoSize = 20;

  const { mesh_cube } = await EM.whenResources(CubeMesh.def);

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

  if (!DBG_GHOST) createPlayer();
}

async function createWorld() {
  const { mesh_unitCube } = await EM.whenResources(
    CubeMesh.def,
    UnitCubeMesh.def
  );
  const gridWidth = 5;
  const gridScale = 50;
  const gridHalfScale = gridScale * 0.5;
  const wallWidth = 8;
  const wallHeight = 4;

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

const ARPlayerDef = EM.defineComponent("arPlayer", () => ({
  speed: 0.0003,
  localAccel: vec3.create(),
  dampingFactor: 0.9,
}));

EM.addEagerInit([ARPlayerDef], [CubeMesh.def], [], ({ mesh_cube }) => {
  EM.addSystem(
    "controlARPlayer",
    Phase.GAME_PLAYERS,
    [ARPlayerDef, RotationDef, LinearVelocityDef],
    [InputsDef, TimeDef],
    (ships, res) => {
      if (!ships.length) return;
      assert(ships.length === 1);
      const e = ships[0];

      let speed = e.arPlayer.speed * res.time.dt;
      vec3.zero(e.arPlayer.localAccel);

      // 4-DOF translation
      if (res.inputs.keyDowns["w"]) e.arPlayer.localAccel[2] -= speed;
      if (res.inputs.keyDowns["s"]) e.arPlayer.localAccel[2] += speed;
      if (res.inputs.keyDowns["a"]) e.arPlayer.localAccel[0] -= speed;
      if (res.inputs.keyDowns["d"]) e.arPlayer.localAccel[0] += speed;

      // rotate localAccel to account for isometric projection
      vec3.rotateY(
        e.arPlayer.localAccel,
        [0, 0, 0],
        -Math.PI / 4,
        e.arPlayer.localAccel
      );

      // TODO: rotate object towards movement

      // dampener
      const dampening = vec3.normalize(vec3.negate(e.linearVelocity));
      vec3.scale(dampening, speed * e.arPlayer.dampingFactor, dampening);
      vec3.add(dampening, e.arPlayer.localAccel, e.arPlayer.localAccel);

      // halt if at small delta
      if (vec3.sqrLen(e.arPlayer.localAccel) === 0) {
        if (
          vec3.sqrLen(e.linearVelocity) < vec3.sqrLen(e.arPlayer.localAccel)
        ) {
          vec3.zero(e.arPlayer.localAccel);
          vec3.zero(e.linearVelocity);
        }
      }

      vec3.add(e.linearVelocity, e.arPlayer.localAccel, e.linearVelocity);
    }
  );
});

async function createPlayer() {
  const { mesh_unitCube, mesh_gizmo, mesh_bullet } = await EM.whenResources(
    UnitCubeMesh.def,
    GizmoMesh.def,
    BulletMesh.def
  );

  const player = EM.new();

  EM.set(player, PositionDef);
  EM.set(player, RotationDef);
  EM.set(player, LinearVelocityDef);
  const mesh = cloneMesh(mesh_unitCube.mesh);
  EM.set(player, RenderableConstructDef, mesh);
  EM.set(player, ColorDef, ENDESGA16.lightGreen);
  EM.set(player, CameraFollowDef);
  vec3.copy(player.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  player.cameraFollow.yawOffset = -Math.PI / 4;
  player.cameraFollow.pitchOffset = Math.atan(Math.sin(-Math.PI / 4));

  EM.set(player, ARPlayerDef);
}
