import {
  AllMeshesDef,
  BallMesh,
  CubeMesh,
  GrappleGunMesh,
  HexMesh,
} from "../meshes/mesh-list.js";
import {
  CameraDef,
  CameraComputedDef,
  CameraFollowDef,
} from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { jitter } from "../utils/math.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { mat4, quat, V, vec3 } from "../matrix/sprig-matrix.js";
import { createGhost } from "../debug/ghost.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { cloneMesh, mapMeshPositions } from "../meshes/mesh.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { LocalHsPlayerDef, HsPlayerDef } from "../hyperspace/hs-player";
import { ControllableDef } from "../input/controllable.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { MeDef, AuthorityDef } from "./components.js";
import { vec3Dbg } from "../utils/utils-3d.js";

const mpMeshes = XY.defineMeshSetResource(
  "mp_meshes",
  CubeMesh,
  HexMesh,
  BallMesh
);

export const {
  MpPlayerLocalDef,
  MpPlayerPropsDef,
  createMpPlayer,
  createMpPlayerNow,
} = defineNetEntityHelper({
  name: "mpPlayer",
  defaultProps: (location?: vec3, color?: vec3) => {
    console.log(
      `creating mpPlayerProps w/ ${vec3Dbg(location)} ${vec3Dbg(color)}`
    );
    return {
      location: location ?? V(0, 0, 0),
      color: color ?? V(0, 0, 0),
    };
  },
  // TODO(@darzu): can't do this b/c constructors must create a valid shape even when given no params
  // defaultProps: (location: vec3, color: vec3) => {
  //   console.log(
  //     `creating mpPlayerProps w/ ${vec3Dbg(location)} ${vec3Dbg(color)}`
  //   );
  //   return {
  //     location: location,
  //     color: color,
  //   };
  // },
  serializeProps: (c, buf) => {
    buf.writeVec3(c.location);
    buf.writeVec3(c.color);
    console.log(
      `serialized mpPlayerProps w/ ${
        c.location ? vec3Dbg(c.location) : "NULL"
      } ${c.color ? vec3Dbg(c.color) : "NULL"}`
    );
  },
  deserializeProps: (c, buf) => {
    buf.readVec3(c.location);
    buf.readVec3(c.color);
    console.log(
      `deserialized mpPlayerProps w/ ${
        c.location ? vec3Dbg(c.location) : "NULL"
      } ${c.color ? vec3Dbg(c.color) : "NULL"}`
    );
  },
  defaultLocal: () => {
    return {};
  },
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [CubeMesh.def, MeDef],
  build: (e, res) => {
    console.log(
      `creating player (${e.id}) auth.pid:${e.authority.pid} me.pid:${res.me.pid}`
    );

    const props = e.mpPlayerProps;

    // TODO(@darzu): BUG. props.color is undefined
    EM.ensureComponentOn(e, ColorDef, props.color);
    EM.ensureComponentOn(e, RenderableConstructDef, res.mesh_cube.proto);
    EM.ensureComponentOn(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.mesh_cube.aabb,
    });

    if (e.authority.pid === res.me.pid) {
      vec3.copy(e.position, props.location); // TODO(@darzu): should be fine to have this outside loop

      EM.ensureComponentOn(e, ControllableDef);
      e.controllable.modes.canFall = true;
      e.controllable.modes.canJump = false;
      e.controllable.modes.canFly = false;
      EM.ensureComponentOn(e, CameraFollowDef, 1);
      quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, e.rotation);
      e.controllable.speed *= 2;
      e.controllable.sprintMul = 1;
      vec3.copy(e.cameraFollow.positionOffset, [0.0, 4.0, 10.0]);
      e.cameraFollow.yawOffset = 0.0;
      e.cameraFollow.pitchOffset = -0.593;

      console.log(`player has .controllable`);
    }

    return e;
  },
});

// console.log(`MpPlayerPropsDef: ${MpPlayerPropsDef.id}`); // 1867295084

export async function initMPGame() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      // skyPipeline,
      stdRenderPipeline,
      // renderGrassPipe,
      // renderOceanPipe,
      outlineRender,
      deferredPipeline,
      // skyPipeline,
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

  const { mp_meshes } = await EM.whenResources(mpMeshes);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  // EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  // EM.ensureComponentOn(sun, PositionDef, V(-10, 10, 10));
  EM.ensureComponentOn(sun, PositionDef, V(100, 100, 100));
  EM.ensureComponentOn(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.ensureComponentOn(
    sun,
    RenderableConstructDef,
    mp_meshes.ball.proto,
    false
  );
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.ensureComponentOn(sun, PositionDef, V(50, 300, 10));

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(ground, RenderableConstructDef, mp_meshes.hex.proto);
  EM.ensureComponentOn(ground, ColorDef, ENDESGA16.blue);
  EM.ensureComponentOn(ground, PositionDef, V(0, -10, 0));
  EM.ensureComponentOn(ground, ScaleDef, V(10, 10, 10));
  EM.ensureComponentOn(ground, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: mp_meshes.hex.aabb,
  });

  // gizmo
  const gizmoMesh = createGizmoMesh();
  const gizmo = EM.new();
  EM.ensureComponentOn(gizmo, RenderableConstructDef, gizmoMesh);
  EM.ensureComponentOn(gizmo, PositionDef, V(0, 1, 0));

  // player
  const color = AllEndesga16[me.pid];
  createMpPlayer(V(0, 10, 0), color);
}
