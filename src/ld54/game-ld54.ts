import {
  BallMesh,
  CubeMesh,
  CubeRaftMesh,
  HexMesh,
  LD54AstronautMesh,
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
import { quat, V, vec3 } from "../matrix/sprig-matrix.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
  RiggedRenderableConstructDef,
} from "../render/renderer-ecs.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
// import { ControllableDef } from "../input/controllable.js";
import { ColliderDef } from "../physics/collider.js";
import { TimeDef } from "../time/time.js";
import { assert } from "../utils/util.js";
import { MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { initStars, renderStars } from "../render/pipelines/std-stars.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { SpaceSuitDef } from "./space-suit-controller.js";
import { PlayerRenderDef } from "./player-render.js";
import { RiggedMesh } from "../meshes/mesh.js";
import { stdRiggedRenderPipeline } from "../render/pipelines/std-rigged.js";
import { PoseDef, repeatPoses } from "../animation/skeletal.js";
import { createSpacePath } from "./space-path.js";
import { getPathPosRot } from "../utils/spline.js";
import { PartyDef } from "../camera/party.js";
import { makeDome, makeSphere } from "../meshes/primatives.js";
import { BUBBLE_MASK } from "../render/pipeline-masks.js";
import { bubblePipeline } from "../render/pipelines/xp-bubble.js";
import { BubbleDef, OxygenDef } from "./oxygen.js";
import { OreCarrierDef, OreStoreDef, initOre } from "./ore.js";

const RENDER_TRUTH_CUBE = false;

const ld54Meshes = XY.defineMeshSetResource(
  "ld54_meshes",
  CubeMesh,
  HexMesh,
  BallMesh,
  CubeRaftMesh,
  LD54AstronautMesh
);

const {
  PlayerLocalDef,
  PlayerPropsDef,
  createPlayer,
  createPlayerNow,
  createPlayerAsync,
} = defineNetEntityHelper({
  name: "player",
  defaultProps: () => {
    return {
      location: V(0, 0, 0),
      color: V(0, 0, 0),
      // parentId: 0,
    };
  },
  updateProps: (
    p,
    location: vec3.InputT,
    color: vec3.InputT
    // parentId: number
  ) => {
    // console.log(
    //   `updating mpPlayerProps w/ ${vec3Dbg(location)} ${vec3Dbg(color)}`
    // );
    vec3.copy(p.location, location);
    vec3.copy(p.color, color);
    // p.parentId = parentId;
    return p;
  },
  serializeProps: (c, buf) => {
    buf.writeVec3(c.location);
    buf.writeVec3(c.color);
    // buf.writeUint32(c.parentId);
    // console.log(
    //   `serialized mpPlayerProps w/ ${vec3Dbg(c.location)} ${vec3Dbg(c.color)}`
    // );
  },
  deserializeProps: (c, buf) => {
    buf.readVec3(c.location);
    buf.readVec3(c.color);
    // c.parentId = buf.readUint32();
    // console.log(
    //   `deserialized mpPlayerProps w/ ${vec3Dbg(c.location)} ${vec3Dbg(c.color)}`
    // );
  },
  defaultLocal: () => {
    return {};
  },
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [ld54Meshes, MeDef],
  build: (e, res) => {
    console.log(
      `creating player (${e.id}) auth.pid:${e.authority.pid} me.pid:${res.me.pid}`
    );

    const props = e.playerProps;

    // TODO(@darzu): BUG. props.color is undefined
    EM.set(e, ColorDef, props.color);
    // don't render the truth cube by default
    EM.set(
      e,
      RenderableConstructDef,
      res.ld54_meshes.cube.proto,
      RENDER_TRUTH_CUBE
    );
    EM.set(e, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.ld54_meshes.cube.aabb,
    });
    // EM.set(e, PhysicsParentDef, props.parentId);

    if (e.authority.pid === res.me.pid) {
      vec3.copy(e.position, props.location); // TODO(@darzu): should be fine to have this outside loop

      EM.set(e, LinearVelocityDef);

      EM.set(e, SpaceSuitDef);
      // e.controllable.modes.canFall = true;
      // e.controllable.modes.canJump = true;
      // e.controllable.modes.canFly = false;
      // e.controllable.speed *= 2;
      // e.controllable.sprintMul = 1;

      EM.set(e, CameraFollowDef, 1);
      // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, e.rotation);
      // vec3.copy(e.cameraFollow.positionOffset, [0.0, 4.0, 10.0]);
      vec3.copy(e.cameraFollow.positionOffset, [0.0, 0.0, 10.0]);
      // e.cameraFollow.yawOffset = 0.0;
      // e.cameraFollow.pitchOffset = -0.593;

      EM.set(e, OreCarrierDef);

      const playerRender = EM.new();
      const riggedAstronaut = res.ld54_meshes.ld54_astronaut.mesh as RiggedMesh;
      EM.set(playerRender, RiggedRenderableConstructDef, riggedAstronaut);
      EM.set(playerRender, PositionDef);
      EM.set(playerRender, RotationDef);
      EM.set(playerRender, PlayerRenderDef, e);
      EM.set(playerRender, PoseDef, riggedAstronaut.rigging);
      repeatPoses(playerRender, [0, 2000], [0, 1000], [1, 2000], [1, 1000]);
      // demo mode?
      /*
        playerRender.pose.repeat = [
          { pose: 0, t: 1000 },
          { pose: 1, t: 1000 },
          { pose: 2, t: 1000 },
          { pose: 3, t: 1000 },
          { pose: 4, t: 1000 },
          { pose: 5, t: 1000 },
          { pose: 6, t: 1000 },
          ];
          */
    }

    return e;
  },
});

const { RaftPropsDef, createRaft } = defineNetEntityHelper({
  name: "raft",
  defaultProps: () => ({}),
  updateProps: (p) => p,
  serializeProps: (obj, buf) => {},
  deserializeProps: (obj, buf) => {},
  defaultLocal: () => {},
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [ld54Meshes],
  build: (raft, res) => {
    EM.set(raft, RenderableConstructDef, res.ld54_meshes.cubeRaft.proto);
    EM.set(raft, ColorDef, ENDESGA16.darkGreen);
    EM.set(raft, PositionDef, V(0, 5, 0));
    EM.set(raft, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.ld54_meshes.cubeRaft.aabb,
    });

    const pedestal = EM.new();
    EM.set(pedestal, PositionDef, V(0, 1, 0));
    EM.set(pedestal, RenderableConstructDef, res.ld54_meshes.hex.proto);
    EM.set(pedestal, ColorDef, ENDESGA16.white);
    EM.set(pedestal, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.ld54_meshes.hex.aabb,
    });
    EM.set(pedestal, PhysicsParentDef, raft.id);

    EM.set(raft, OreStoreDef);
  },
});

// console.log(`MpPlayerPropsDef: ${MpPlayerPropsDef.id}`); // 1867295084

// TODO(@darzu): EXAMPLE: event w/ entity & variable length serialization

const raiseSetLevel = eventWizard(
  "set-level",
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
  const { ld54_meshes } = await EM.whenResources(ld54Meshes);

  // TODO(@darzu): differentiate level based on idx
  // ground
  const ground = EM.new();
  EM.set(ground, RenderableConstructDef, ld54_meshes.hex.proto);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, -10, 0));
  EM.set(ground, ScaleDef, V(10, 10, 10));
  EM.set(ground, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: ld54_meshes.hex.aabb,
  });
}

export async function initLD54() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // init stars
    res.renderer.renderer.submitPipelines([], [...noisePipes, initStars]);

    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      // skyPipeline,
      stdRenderPipeline,
      stdRiggedRenderPipeline,
      bubblePipeline,
      // renderGrassPipe,
      // renderOceanPipe,
      outlineRender,
      deferredPipeline,
      renderStars,
      ...blurPipelines,
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
  camera.viewDist = 1000;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { ld54_meshes } = await EM.whenResources(ld54Meshes);

  // light
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  // EM.set(sun, PositionDef, V(100, 100, 0));
  // EM.set(sun, PositionDef, V(-10, 10, 10));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.set(sun, RenderableConstructDef, ld54_meshes.ball.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 300, 10));

  // gizmo
  const gizmoMesh = createGizmoMesh();
  const gizmo = EM.new();
  EM.set(gizmo, RenderableConstructDef, gizmoMesh);
  EM.set(gizmo, PositionDef, V(0, 1, 0));
  EM.set(gizmo, ScaleDef, V(2, 2, 2));

  // space path
  const spacePath = createSpacePath();
  const numPathSeg = spacePath.spacePath.path.length - 1;

  // ore
  initOre(spacePath.spacePath.path);

  // raft
  if (me.host) {
    createRaft();

    const raftSpeed_segPerSecond = 1;

    EM.addSystem(
      "movePlatform",
      Phase.GAME_WORLD,
      [RaftPropsDef, PositionDef, RotationDef],
      [TimeDef, PartyDef],
      (es, res) => {
        if (es.length !== 1) return;
        const raft = es[0];

        const seconds = res.time.time * 0.001;
        const t = (seconds * raftSpeed_segPerSecond) % numPathSeg;

        getPathPosRot(
          spacePath.spacePath.path,
          t,
          raft.position,
          raft.rotation
        );
        quat.rotateY(raft.rotation, Math.PI / 2, raft.rotation);

        // const t = res.time.time * 0.001;
        // const r = 20;
        // const x = Math.cos(t) * r;
        // const y = Math.sin(t) * r;
        // raft.position[0] = y;
        // raft.position[2] = x;
        // quat.fromEuler(0, t, 0, raft.rotation);

        vec3.copy(res.party.pos, raft.position);
      }
    );
  }
  const raft = await EM.whenSingleEntity(RaftPropsDef, FinishedDef);

  // bubble
  const BUBBLE_HALFSIZE = 1;
  const bubbleMesh = makeSphere(16, 8, BUBBLE_HALFSIZE);
  console.log("bubbleMesh", bubbleMesh);
  const bubble = EM.new();
  EM.set(bubble, PositionDef, V(0, 10, 0));
  EM.set(
    bubble,
    RenderableConstructDef,
    bubbleMesh,
    undefined,
    undefined,
    BUBBLE_MASK
  );
  EM.set(bubble, BubbleDef);
  EM.set(bubble, PhysicsParentDef, raft.id);

  EM.addResource(OxygenDef, 100);

  // player
  const color = AllEndesga16[me.pid + 4 /*skip browns*/];
  // TODO(@darzu): parent to raft.id ?
  const player = createPlayerNow({ ld54_meshes, me }, V(0, 10, 0), color);

  // start pos?
  vec3.copy(player.position, [12.15, 22.03, -14.57]);
  quat.copy(player.rotation, [0.01, -0.96, -0.21, 0.16]);
}
