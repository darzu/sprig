import {
  BallMesh,
  CubeMesh,
  CubeRaftMesh,
  HexMesh,
} from "../meshes/mesh-list.js";
import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { FinishedDef, defineNetEntityHelper } from "../ecs/em-helpers.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { quat, V, V3 } from "../matrix/sprig-matrix.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { ControllableDef } from "../input/controllable.js";
import { ColliderDef } from "../physics/collider.js";
import { MeDef } from "./components.js";
import { TimeDef } from "../time/time.js";
import { eventWizard } from "./events.js";
import { assert } from "../utils/util.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";

const mpMeshes = XY.defineMeshSetResource(
  "mp_meshes",
  CubeMesh,
  HexMesh,
  BallMesh,
  CubeRaftMesh
);

const {
  MpPlayerLocalDef,
  MpPlayerPropsDef,
  createMpPlayer,
  createMpPlayerNow,
} = defineNetEntityHelper({
  name: "mpPlayer",
  defaultProps: () => {
    return {
      location: V(0, 0, 0),
      color: V(0, 0, 0),
      parentId: 0,
    };
  },
  updateProps: (p, location: V3.InputT, color: V3.InputT, parentId: number) => {
    // console.log(
    //   `updating mpPlayerProps w/ ${vec3Dbg(location)} ${vec3Dbg(color)}`
    // );
    V3.copy(p.location, location);
    V3.copy(p.color, color);
    p.parentId = parentId;
    return p;
  },
  serializeProps: (c, buf) => {
    buf.writeVec3(c.location);
    buf.writeVec3(c.color);
    buf.writeUint32(c.parentId);
    // console.log(
    //   `serialized mpPlayerProps w/ ${vec3Dbg(c.location)} ${vec3Dbg(c.color)}`
    // );
  },
  deserializeProps: (c, buf) => {
    buf.readVec3(c.location);
    buf.readVec3(c.color);
    c.parentId = buf.readUint32();
    // console.log(
    //   `deserialized mpPlayerProps w/ ${vec3Dbg(c.location)} ${vec3Dbg(c.color)}`
    // );
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
    EM.set(e, ColorDef, props.color);
    EM.set(e, RenderableConstructDef, res.mesh_cube.proto);
    EM.set(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.mesh_cube.aabb,
    });
    EM.set(e, PhysicsParentDef, props.parentId);

    if (e.authority.pid === res.me.pid) {
      V3.copy(e.position, props.location); // TODO(@darzu): should be fine to have this outside loop

      EM.set(e, ControllableDef);
      e.controllable.modes.canFall = true;
      e.controllable.modes.canJump = true;
      e.controllable.modes.canFly = false;
      EM.set(e, CameraFollowDef, 1);
      // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, e.rotation);

      e.controllable.speed *= 2;
      e.controllable.sprintMul = 1;
      V3.copy(e.cameraFollow.positionOffset, [0.0, -10.0, 4.0]);
      // e.cameraFollow.yawOffset = 0.0;
      // e.cameraFollow.pitchOffset = -0.593;

      console.log(`player has .controllable`);
    }

    return e;
  },
});

const { MpRaftPropsDef, createMpRaft } = defineNetEntityHelper({
  name: "mpRaft",
  defaultProps: () => ({}),
  updateProps: (p) => p,
  serializeProps: (obj, buf) => {},
  deserializeProps: (obj, buf) => {},
  defaultLocal: () => {},
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [mpMeshes],
  build: (platform, res) => {
    EM.set(platform, RenderableConstructDef, res.mp_meshes.cubeRaft.proto);
    EM.set(platform, ColorDef, ENDESGA16.darkGreen);
    EM.set(platform, PositionDef, V(0, 0, 5));
    EM.set(platform, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.mp_meshes.cubeRaft.aabb,
    });

    const obstacle = EM.new();
    EM.set(obstacle, PositionDef, V(0, 0, 1));
    EM.set(obstacle, RenderableConstructDef, res.mp_meshes.hex.proto);
    EM.set(obstacle, ColorDef, ENDESGA16.white);
    EM.set(obstacle, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.mp_meshes.hex.aabb,
    });
    EM.set(obstacle, PhysicsParentDef, platform.id);

    addGizmoChild(obstacle, 3);
  },
});

// console.log(`MpPlayerPropsDef: ${MpPlayerPropsDef.id}`); // 1867295084

// TODO(@darzu): EXAMPLE: event w/ entity & variable length serialization

const raiseSetLevel = eventWizard(
  "mp-set-level",
  [] as const,
  (_, levelIdx: number) => setLevelLocal(levelIdx),
  {
    legalEvent: (_, levelIdx: number) => {
      assert(0 <= levelIdx && levelIdx <= 3);
      return true;
    },
    serializeExtra: (buf, levelIdx: number) => {
      buf.writeUint8(levelIdx);
    },
    deserializeExtra: (buf) => {
      const levelIdx = buf.readUint8();
      return levelIdx;
    },
  }
);

async function setLevelLocal(levelIdx: number) {
  const { mp_meshes } = await EM.whenResources(mpMeshes);

  // TODO(@darzu): differentiate level based on idx
  // ground
  const ground = EM.new();
  EM.set(ground, RenderableConstructDef, mp_meshes.hex.proto);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -10));
  EM.set(ground, ScaleDef, V(10, 10, 10));
  EM.set(ground, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: mp_meshes.hex.aabb,
  });
}

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

  // start level
  if (me.host) {
    raiseSetLevel(0);
  }

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  V3.set(-20, -20, -20, camera.maxWorldAABB.min);
  V3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { mp_meshes } = await EM.whenResources(mpMeshes);

  // light
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  // EM.set(sun, PositionDef, V(100, 100, 0));
  // EM.set(sun, PositionDef, V(-10, 10, 10));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, LinearVelocityDef, V(0.001, 0, 0.001));
  EM.set(sun, RenderableConstructDef, mp_meshes.ball.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  V3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  V3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 10, 300));

  // gizmo
  addWorldGizmo(V3.ZEROS, 5);

  // raft
  if (me.host) {
    createMpRaft();

    EM.addSystem(
      "movePlatform",
      Phase.GAME_WORLD,
      [MpRaftPropsDef, PositionDef, RotationDef],
      [TimeDef],
      (es, res) => {
        if (es.length !== 1) return;
        const platform = es[0];

        const t = res.time.time * 0.001;
        const r = 20;
        const x = Math.cos(t) * r;
        const y = Math.sin(t) * r;
        platform.position[0] = x;
        platform.position[1] = y;
        quat.fromYawPitchRoll(-t, 0, 0, platform.rotation);
      }
    );
  }

  const raft = await EM.whenSingleEntity(MpRaftPropsDef, FinishedDef);

  // player
  const color = AllEndesga16[me.pid + 4 /*skip browns*/];
  createMpPlayer(V(0, 0, 10), color, raft.id);
}
