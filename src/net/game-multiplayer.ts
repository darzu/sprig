import {
  BallMesh,
  CubeMesh,
  CubeRaftMesh,
  HexMesh,
} from "../meshes/mesh-list.js";
import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { FinishedDef, defineNetEntityHelper } from "../ecs/em-helpers.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
  TransformDef,
  updateFrameFromTransform,
} from "../physics/transform.js";
import { mat4, quat, V, V3 } from "../matrix/sprig-matrix.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { ControllableDef } from "../input/controllable.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, NetworkReadyDef } from "./components.js";
import { TimeDef } from "../time/time.js";
import { eventWizard } from "./events.js";
import { assert } from "../utils/util.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { createHtmlBuilder, mkEl } from "../web/html-builder.js";
import { getWebLocationHash, isTopLevelFrame } from "../web/webnav.js";
import { CanvasDef } from "../render/canvas.js";
import { InputsDef } from "../input/inputs.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { onCollides } from "../physics/phys-helpers.js";
import { TeleportDef } from "../physics/teleport.js";
import { T } from "../utils/util-no-import.js";

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
  createMpPlayerAsync,
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
      e.controllable.requiresPointerLock = false;
      e.controllable.requiresPointerHover = true;
      e.controllable.modes.canFall = true;
      e.controllable.modes.canJump = true;
      e.controllable.modes.canFly = false;
      e.controllable.modes.canZoom = true;
      e.controllable.modes.mustDragPan = true;
      e.controllable.maxZoom = 50;
      EM.set(e, CameraFollowDef, 1);
      // quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, e.rotation);

      e.controllable.speed *= 2;
      e.controllable.sprintMul = 1;
      V3.copy(e.cameraFollow.positionOffset, [0.0, -20.0, 0.0]);
      // e.cameraFollow.yawOffset = 0.0;
      e.cameraFollow.pitchOffset = -0.593;

      console.log(`player has .controllable`);
    }

    return e;
  },
});

const MpPatformDef = EM.defineComponent(
  "mpPlatform",
  () => ({
    setParentId: 0,
  }),
  (p, setParentId?: number) => {
    if (setParentId) p.setParentId = setParentId;
    return p;
  }
);

const raiseSetParent = eventWizard(
  "mp-set-parent",
  [[PhysicsParentDef]] as const,
  ([e], newParentId: number) => {
    e.physicsParent.id = newParentId;
  },
  {
    serializeExtra: (buf, newParentId: number) => {
      buf.writeUint32(newParentId);
    },
    deserializeExtra: (buf) => {
      const newParentId = buf.readUint32();
      return newParentId;
    },
  }
);

const StartRaftDef = EM.defineComponent("starterRaft", () => true);

const { MpRaftPropsDef, createMpRaft } = defineNetEntityHelper({
  name: "mpRaft",
  defaultProps: () => ({
    color: V(0, 0, 0),
    scale: V(1, 1, 1),
    starter: false,
  }),
  updateProps: (p, color: V3.InputT, scale: V3.InputT, starter: boolean) => {
    V3.copy(p.color, color);
    V3.copy(p.scale, scale);
    p.starter = starter;
    return p;
  },
  serializeProps: (obj, buf) => {
    buf.writeVec3(obj.color);
    buf.writeVec3(obj.scale);
    buf.writeUint8(obj.starter ? 1 : 0);
  },
  deserializeProps: (obj, buf) => {
    buf.readVec3(obj.color);
    buf.readVec3(obj.scale);
    obj.starter = !!buf.readUint8();
  },
  defaultLocal: () => {},
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [mpMeshes],
  build: (platform, res) => {
    EM.set(platform, RenderableConstructDef, res.mp_meshes.cubeRaft.proto);
    EM.set(platform, ColorDef, platform.mpRaftProps.color);
    EM.set(platform, PositionDef, V(0, 0, 5));
    EM.set(platform, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: res.mp_meshes.cubeRaft.aabb,
    });
    EM.set(platform, MpPatformDef, platform.id);
    EM.set(platform, ScaleDef, platform.mpRaftProps.scale);
    if (platform.mpRaftProps.starter) EM.set(platform, StartRaftDef);

    const obstacle = EM.mk();
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
  const ground = EM.mk();
  EM.set(ground, RenderableConstructDef, mp_meshes.hex.proto);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -10));
  EM.set(ground, ScaleDef, V(10, 10, 10));
  EM.set(ground, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: mp_meshes.hex.aabb,
  });
  EM.set(ground, MpPatformDef, 0);
}

function joinURL(address: string): string {
  return `${window.location.protocol}//${window.location.host}/full-screen.html?server=${address}${window.location.hash}`;
}

export async function initMPGame() {
  // TODO(@darzu): implement server<->client

  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      // skyPipeline,
      stdMeshPipe,
      // renderGrassPipe,
      // renderOceanPipe,
      outlineRender,
      deferredPipeline,
      // skyPipeline,
      postProcess,
    ];
  });

  const { camera, me, htmlCanvas } = await EM.whenResources(
    CameraDef,
    MeDef,
    CanvasDef
  );

  // html
  initHtml(me.host);

  // start level
  if (me.host) {
    raiseSetLevel(0);
  }

  // camera
  camera.fov = Math.PI * 0.4;
  camera.viewDist = 200;
  V3.set(-20, -20, -20, camera.maxWorldAABB.min);
  V3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  // camera lock
  htmlCanvas.shouldLockMouseOnClick = false;
  htmlCanvas.unlockMouse();

  const { mp_meshes } = await EM.whenResources(mpMeshes);

  // light
  const sun = EM.mk();
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
    const raftHostParam = EM.defineNonupdatableComponent(
      "raftParam",
      T<{ speed: number; radius: number; zPos: number }>()
    );

    const raft1 = createMpRaft(ENDESGA16.darkGreen, V(1, 1, 1), true);
    EM.set(raft1, raftHostParam, {
      speed: 1,
      radius: 20,
      zPos: 5,
    });

    const raft2 = createMpRaft(ENDESGA16.deepGreen, V(4, 4, 4), false);
    EM.set(raft2, raftHostParam, {
      speed: 0.5,
      radius: 50,
      zPos: -30,
    });

    // const raft3 = createMpRaft(ENDESGA16.lightGreen, V(0.4, 0.4, 0.4), false);
    // EM.set(raft3, raftHostParam, {
    //   speed: 0.7,
    //   radius: 30,
    //   zPos: -0,
    // });

    EM.addSystem(
      "movePlatform",
      Phase.GAME_WORLD,
      [MpRaftPropsDef, PositionDef, RotationDef, raftHostParam],
      [TimeDef],
      (es, res) => {
        for (let platform of es) {
          const t = res.time.time * 0.001 * platform.raftParam.speed;
          const r = platform.raftParam.radius;
          const x = Math.cos(t) * r;
          const y = Math.sin(t) * r;
          platform.position[0] = x;
          platform.position[1] = y;
          platform.position[2] = platform.raftParam.zPos;
          quat.fromYawPitchRoll(-t, 0, 0, platform.rotation);
        }
      }
    );
  }

  const raft = await EM.whenSingleEntity(
    MpRaftPropsDef,
    StartRaftDef,
    FinishedDef
  );

  // player
  const color =
    AllEndesga16[(me.pid + 4) /*skip browns*/ % AllEndesga16.length];
  const myPlayer = await createMpPlayerAsync(
    getPlayerRaftSpawnPos(me.pid),
    color,
    raft.id
  );

  EM.addSystem("playerFallThrough", Phase.GAME_WORLD, null, [], () => {
    if (myPlayer.position[2] < -100) {
      V3.copy(myPlayer.position, getPlayerRaftSpawnPos(me.pid));
      myPlayer.physicsParent.id = raft.id;
      raiseSetParent(myPlayer, raft.id);
      if (LinearVelocityDef.isOn(myPlayer)) V3.zero(myPlayer.linearVelocity);
      console.log("player fell through");
    }
  });

  // change platform
  onCollides(
    [
      MpPlayerPropsDef,
      AuthorityDef,
      PositionDef,
      RotationDef,
      ScaleDef,
      TransformDef,
      WorldFrameDef,
      PhysicsParentDef,
      ColliderDef,
    ],
    [MpPatformDef, ColliderDef, TransformDef],
    [MeDef],
    (player, platform, res) => {
      if (player.authority.pid !== res.me.pid) return;
      if (player.physicsParent.id === platform.mpPlatform.setParentId) return;
      console.log(`hit new platform ${platform.id}!`);
      player.physicsParent.id = platform.mpPlatform.setParentId;

      // notify other players we're changing our parent
      raiseSetParent(player, platform.mpPlatform.setParentId);

      // notify the physics system we're going to be lurching
      EM.set(player, TeleportDef);
      // update player's frame to the new parent
      const worldFromPlayer = player.world.transform;
      const worldFromPlatform =
        platform.mpPlatform.setParentId === 0
          ? mat4.IDENTITY
          : platform.transform; // NOTE: assumes platform doesn't have a parent
      const platformFromWorld = mat4.invert(worldFromPlatform);
      const platformFromPlayer = mat4.mul(platformFromWorld, worldFromPlayer);
      mat4.copy(player.transform, platformFromPlayer);
      updateFrameFromTransform(player);
      // except scale
      V3.copy(player.scale, V3.ONES);
      // halt fall
      EM.set(player, LinearVelocityDef, V3.ZEROS);
      // and make sure position is above parent
      assert(platform.collider.shape === "AABB");
      const parentTopZ = platform.collider.aabb.max[2];
      assert(player.collider.shape === "AABB");
      const playerBotZ = player.collider.aabb.min[2];
      player.position[2] = parentTopZ - playerBotZ + 0.1;
    }
  );
}

function getPlayerRaftSpawnPos(pid: number): V3 {
  return V(0, -10 + pid * 4, 10);
}

async function initHtml(isHost: boolean) {
  let hostDiv: HTMLDivElement | undefined = undefined;
  let childDiv: HTMLDivElement | undefined = undefined;
  if (isHost && isTopLevelFrame()) {
    const canvasHolder = document.getElementsByClassName("canvasHolder")[0];
    if (canvasHolder) {
      hostDiv = canvasHolder.getElementsByTagName("canvas")[0]
        .parentElement as HTMLDivElement;
      const iFrameDiv = mkEl("div", {}, "loading...");
      childDiv = iFrameDiv;
      canvasHolder.appendChild(iFrameDiv);
      EM.whenResources(NetworkReadyDef).then(
        ({ networkReady: { address } }) => {
          const iFrame = mkEl("iframe", {
            id: "multiplayerFrame-1",
            src: joinURL(address),
            title: `Client of ${address}`,
          });
          iFrameDiv.replaceChildren(iFrame);
          // canvasHolder.classList.add("hoverable");
        }
      );
    }
  }

  // cross-iframe notifications
  let childIsActive = false;
  if (!isTopLevelFrame()) {
    console.log("am child!");
    EM.addSystem(
      "notifyParentOfActivity",
      Phase.GAME_WORLD,
      null,
      [InputsDef],
      (_, res) => {
        if (res.inputs.anyDown) {
          window.top!.postMessage("iframeActivity");
        }
      }
    );
  } else if (hostDiv && childDiv) {
    window.addEventListener("message", (e) => {
      if (e.data === "iframeActivity") {
        childIsActive = true;
      }
    });
    let _lastChildIsActive: boolean | undefined = undefined;
    EM.addSystem(
      "notifyParentOfActivity",
      Phase.GAME_WORLD,
      null,
      [InputsDef],
      (_, res) => {
        if (res.inputs.anyDown) {
          childIsActive = false;
        }
        if (_lastChildIsActive !== childIsActive) {
          _lastChildIsActive = childIsActive;
          if (childIsActive) {
            hostDiv.classList.remove("hoverable");
            childDiv.classList.add("hoverable");
          } else {
            hostDiv.classList.add("hoverable");
            childDiv.classList.remove("hoverable");
          }
        }
      }
    );
  }

  if (!document.getElementById("infoPanelsHolder")) {
    console.warn("no infoPanelsHolder");
    return;
  }
  const htmlBuilder = createHtmlBuilder();

  // about
  const aboutPanel = htmlBuilder.addInfoPanel("Multiplayer");
  aboutPanel.addText(`
     Each player is a cube that moves around on a shared platform.
     The first player hosts the game and sends updates for the platforms.
     Each player owns and sends updates for their position.
     Built with WebRTC.
  `);

  // controls
  const controlsPanel = htmlBuilder.addInfoPanel("Controls");
  controlsPanel.addHTML(`
    <ul>
      <li>Drag to pan</li>
      <li>Click mouse to activate</li>
      <li>WASD or arrow keys to move</li>
      <li>Spacebar to jump</li>
      <li>Scroll to zoom</li>
    </ul>
  `);

  if (isHost) {
    const {
      networkReady: { address },
    } = await EM.whenResources(NetworkReadyDef);

    // multiplayer
    const joinPanel = htmlBuilder.addInfoPanel("Join");
    // <a href="${joinURL(address)}" target="_blank">New Player Link</a>
    joinPanel.addHTML(`
    Send this to a friend:
    <input id="addressBox" type="text" readonly value="${joinURL(
      address
    )}"></input>
    <button id="copyBtn">copy url</button>
    `);

    {
      const addressBox = document.getElementById(
        "addressBox"
      ) as HTMLInputElement;
      const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;
      copyBtn.onclick = () => {
        addressBox.select();
        addressBox.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(addressBox.value);
      };
    }

    const caveatsPanel = htmlBuilder.addInfoPanel("Known Issues");
    caveatsPanel._panelDiv.style.width = "300px";
    caveatsPanel.addHTML(`
    <ul>
      <li>Each browser tab must remain visible for the network to update.</li>
      <li>Each time the New Player Link is visited or refreshed, a new player will be spawned.</li>
      <li>There is no rejoin (yet).</li>
    </ul>
    `);
  }
}
