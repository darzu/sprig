import { mat4, vec3, quat } from "./gl-matrix.js";
import { scaleMesh, GameObject, GameState } from "./state.js";
import { Serializer, Deserializer } from "./serialize.js";
import { Net } from "./net.js";
import { test } from "./test.js";
import { Renderer, Renderer_WebGPU } from "./render_webgpu.js";
import { attachToCanvas } from "./render_webgl.js";
import { Mesh, unshareProvokingVertices } from "./mesh-pool.js";

const USE_WEBGPU = false;

enum ObjectType {
  Plane,
  Player,
  Bullet,
}
class Plane extends GameObject {
  color: vec3;

  constructor(id: number, creator: number) {
    super(id, creator);
    this.color = vec3.fromValues(0.02, 0.02, 0.02);
  }

  mesh(): Mesh {
    return unshareProvokingVertices(scaleMesh(
      {
        pos: [
          [+1, 0, +1],
          [-1, 0, +1],
          [+1, 0, -1],
          [-1, 0, -1],
        ],
        tri: [
          [0, 2, 3],
          [0, 3, 1], // top
          [3, 2, 0],
          [1, 3, 0], // bottom
        ],
        colors: [this.color, this.color, this.color, this.color],
      },
      10
    ));
  }

  typeId(): number {
    return ObjectType.Plane;
  }

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.location);
  }

  deserializeFull(buffer: Deserializer) {
    buffer.readVec3(this.location);
  }

  serializeDynamic(_buffer: Serializer) {
    // don't need to write anything at all here, planes never change
  }

  deserializeDynamic(_buffer: Deserializer) {
    // don't need to read anything at all here, planes never change
  }
}

const CUBE = unshareProvokingVertices({
  pos: [
    [+1.0, +1.0, +1.0],
    [-1.0, +1.0, +1.0],
    [-1.0, -1.0, +1.0],
    [+1.0, -1.0, +1.0],

    [+1.0, +1.0, -1.0],
    [-1.0, +1.0, -1.0],
    [-1.0, -1.0, -1.0],
    [+1.0, -1.0, -1.0],
  ],
  tri: [
    [0, 1, 2],
    [0, 2, 3], // front
    [4, 5, 1],
    [4, 1, 0], // top
    [3, 4, 0],
    [3, 7, 4], // right
    [2, 1, 5],
    [2, 5, 6], // left
    [6, 3, 2],
    [6, 7, 3], // bottom
    [5, 4, 7],
    [5, 7, 6], // back
  ],
  colors: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
  ],
});

abstract class Cube extends GameObject {
  color: vec3;

  constructor(id: number, creator: number) {
    super(id, creator);
    this.color = vec3.fromValues(0.2, 0, 0);
  }

  mesh(): Mesh {
    return {
      ...CUBE,
      colors: CUBE.colors.map(_ => this.color),
    }
  }
}

class Bullet extends Cube {
  constructor(id: number, creator: number) {
    super(id, creator);
    this.color = vec3.fromValues(0.1, 0.1, 0.8);
  }

  mesh(): Mesh {
    return scaleMesh(super.mesh(), 0.3);
  }

  typeId(): number {
    return ObjectType.Bullet;
  }

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.location);
    buffer.writeVec3(this.linear_velocity);
    buffer.writeQuat(this.rotation);
    buffer.writeVec3(this.angular_velocity);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.linear_velocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.angular_velocity);
  }

  serializeDynamic(buffer: Serializer) {
    // rotation and location can both change, but we only really care about syncing location
    buffer.writeVec3(this.location);
  }

  deserializeDynamic(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
  }
}

class Player extends Cube {
  constructor(id: number, creator: number) {
    super(id, creator);
    this.color = vec3.fromValues(0, 0.2, 0);
  }

  syncPriority(): number {
    return 10000;
  }

  typeId(): number {
    return ObjectType.Player;
  }

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.location);
    buffer.writeVec3(this.linear_velocity);
    buffer.writeQuat(this.rotation);
    buffer.writeVec3(this.angular_velocity);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.linear_velocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.angular_velocity);
  }

  serializeDynamic(buffer: Serializer) {
    this.serializeFull(buffer);
  }

  deserializeDynamic(buffer: Deserializer) {
    this.deserializeFull(buffer);
  }
}

interface Inputs {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  mouseX: number;
  mouseY: number;
  lclick: boolean;
  rclick: boolean;
  accel: boolean;
}

class CubeGameState extends GameState<Inputs> {
  players: Record<number, Player>;
  cameraRotation: quat;
  cameraLocation: vec3;

  constructor(renderer: Renderer, createObjects: boolean = true) {
    super(renderer);
    this.me = 0;
    this.cameraRotation = quat.identity(quat.create());
    quat.rotateX(this.cameraRotation, this.cameraRotation, -Math.PI / 8);
    this.cameraLocation = vec3.fromValues(0, 0, 10);
    this.players = {};
    if (createObjects) {
      let plane = new Plane(this.id(), this.me);
      plane.location = vec3.fromValues(0, -3, -8);
      this.addObject(plane);
      this.addPlayer();
      // have added our objects, can unmap buffers
      this.renderer.finishInit();
    }
    this.me = 0;
  }

  playerObject(playerId: number): GameObject {
    let p = new Player(this.id(), this.me);
    p.authority = playerId;
    p.authority_seq = 1;
    return p;
  }

  objectOfType(typeId: ObjectType, id: number, creator: number) {
    switch (typeId) {
      case ObjectType.Plane:
        return new Plane(id, creator);
      case ObjectType.Bullet:
        return new Bullet(id, creator);
      case ObjectType.Player:
        return new Player(id, creator);
    }
    throw `No such object type ${typeId}`;
  }

  addObject(obj: GameObject) {
    super.addObject(obj);
    if (obj instanceof Player) {
      this.players[obj.authority] = obj;
    }
  }

  private player() {
    return this.players[this.me];
  }

  stepGame(dt: number, inputs: Inputs) {
    if (this.player()) {
      // move player
      this.player().linear_velocity = vec3.fromValues(0, 0, 0);
      let playerSpeed = inputs.accel ? 0.005 : 0.001;
      let n = playerSpeed * dt;
      if (inputs.left) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(-n, 0, 0)
        );
      }
      if (inputs.right) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(n, 0, 0)
        );
      }
      if (inputs.forward) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(0, 0, -n)
        );
      }
      if (inputs.back) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(0, 0, n)
        );
      }
      if (inputs.up) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(0, n, 0)
        );
      }
      if (inputs.down) {
        vec3.add(
          this.player().linear_velocity,
          this.player().linear_velocity,
          vec3.fromValues(0, -n, 0)
        );
      }
      vec3.transformQuat(
        this.player().linear_velocity,
        this.player().linear_velocity,
        this.player().rotation
      );
      quat.rotateY(
        this.player().rotation,
        this.player().rotation,
        -inputs.mouseX * 0.001
      );
      quat.rotateX(
        this.cameraRotation,
        this.cameraRotation,
        -inputs.mouseY * 0.001
      );
    }
    // add bullet on lclick
    if (inputs.lclick) {
      let bullet = new Bullet(this.id(), this.me);
      let bullet_axis = vec3.fromValues(0, 0, -1);
      bullet_axis = vec3.transformQuat(
        bullet_axis,
        bullet_axis,
        this.player().rotation
      );
      bullet.location = vec3.clone(this.player().location);
      bullet.rotation = quat.clone(this.player().rotation);
      bullet.linear_velocity = vec3.scale(
        bullet.linear_velocity,
        bullet_axis,
        0.02
      );
      bullet.linear_velocity = vec3.add(
        bullet.linear_velocity,
        bullet.linear_velocity,
        this.player().linear_velocity
      );
      bullet.angular_velocity = vec3.scale(
        bullet.angular_velocity,
        bullet_axis,
        0.01
      );
      this.addObject(bullet);
    }
    if (inputs.rclick) {
      const SPREAD = 10;
      for (let i = 0; i <= SPREAD; i++) {
        for (let i2 = 0; i2 <= SPREAD; i2++) {
          let bullet = new Bullet(this.id(), this.me);
          let bullet_axis = vec3.fromValues(0, 0, -1);
          bullet_axis = vec3.transformQuat(
            bullet_axis,
            bullet_axis,
            this.player().rotation
          );
          bullet.location = vec3.add(
            vec3.create(),
            this.player().location,
            vec3.fromValues(i - 5, i2 - 5, 0)
          );
          bullet.rotation = quat.clone(this.player().rotation);
          bullet.linear_velocity = vec3.scale(
            bullet.linear_velocity,
            bullet_axis,
            0.005
          );
          bullet.linear_velocity = vec3.add(
            bullet.linear_velocity,
            bullet.linear_velocity,
            this.player().linear_velocity
          );
          bullet.angular_velocity = vec3.scale(
            bullet.angular_velocity,
            bullet_axis,
            0.01
          );
          this.addObject(bullet);
        }
      }
    }
  }

  viewMatrix() {
    //TODO: this calculation feels like it should be simpler but Doug doesn't
    //understand quaternions.
    let viewMatrix = mat4.create();
    if (this.player()) {
      mat4.translate(viewMatrix, viewMatrix, this.player().location);
      mat4.multiply(
        viewMatrix,
        viewMatrix,
        mat4.fromQuat(mat4.create(), this.player().rotation)
      );
    }
    mat4.multiply(
      viewMatrix,
      viewMatrix,
      mat4.fromQuat(mat4.create(), this.cameraRotation)
    );
    mat4.translate(viewMatrix, viewMatrix, this.cameraLocation);
    mat4.invert(viewMatrix, viewMatrix);
    return viewMatrix;
  }
}

function inputsReader(canvas: HTMLCanvasElement): () => Inputs {
  let forward = false;
  let back = false;
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let accel = false;
  let lclick = false;
  let rclick = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener("keydown", (ev) => {
    switch (ev.key.toLowerCase()) {
      case "w":
        forward = true;
        back = false;
        break;
      case "s":
        back = true;
        forward = false;
        break;
      case "a":
        left = true;
        right = false;
        break;
      case "d":
        right = true;
        left = false;
        break;
      case "shift":
        up = true;
        down = false;
        break;
      case "c":
        down = true;
        up = false;
        break;
      case " ":
        accel = true;
        break;
    }
  });

  window.addEventListener("keyup", (ev) => {
    switch (ev.key.toLowerCase()) {
      case "w":
        forward = false;
        break;
      case "s":
        back = false;
        break;
      case "a":
        left = false;
        break;
      case "d":
        right = false;
        break;
      case "shift":
        up = false;
        break;
      case "c":
        down = false;
        break;
      case " ":
        accel = false;
        break;
    }
  });

  window.addEventListener("mousemove", (ev) => {
    if (document.pointerLockElement === canvas) {
      mouseX += ev.movementX;
      mouseY += ev.movementY;
    }
  });

  window.addEventListener("click", (ev) => {
    if (document.pointerLockElement === canvas) {
      if (ev.button === 0) {
        lclick = true;
      } else {
        rclick = true;
      }
    }
    return false;
  });

  function getInputs(): Inputs {
    let inputs = {
      forward,
      back,
      left,
      right,
      up,
      down,
      accel,
      mouseX,
      mouseY,
      lclick,
      rclick,
    };
    mouseX = 0;
    mouseY = 0;
    lclick = false;
    rclick = false;
    return inputs;
  }
  return getInputs;
}

// ms per network sync (should be the same for all servers)
const NET_DT = 1000.0 / 20;

async function startGame(host: string | null) {
  let hosting = host === null;
  let canvas = document.getElementById("sample-canvas") as HTMLCanvasElement;
  function onWindowResize() {
    canvas.width = window.innerWidth;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.height = window.innerHeight;
    canvas.style.height = `${window.innerHeight}px`;
  }
  window.onresize = function () {
    onWindowResize();
  };
  onWindowResize();

  const debugDiv = document.getElementById("debug-div") as HTMLDivElement;

  let renderer: Renderer;
  if (USE_WEBGPU) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    renderer = new Renderer_WebGPU(canvas, device, 1000);
  } else {
    renderer = attachToCanvas(canvas, 1000, 100);
  }
  let start_of_time = performance.now();
  let gameState = new CubeGameState(renderer, hosting);
  let inputs = inputsReader(canvas);
  function doLockMouse() {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  }
  canvas.addEventListener("click", doLockMouse);

  const controlsStr = `controls: WASD, shift/c, mouse, spacebar`;
  let avgJsTime = 0;
  let avgNetTime = 0;
  let avgFrameTime = 0;
  let avgWeight = 0.05;
  let net: Net<Inputs>;
  let time_to_next_sync = NET_DT;
  let previous_frame_time = start_of_time;
  let frame = () => {
    let frame_start_time = performance.now();
    let time_to_consume = frame_start_time - previous_frame_time;
    let net_time = 0;
    while (true) {
      // need to do some game steps before we render
      if (time_to_consume > time_to_next_sync) {
        gameState.step(time_to_next_sync, inputs());
        let before_net = performance.now();
        net.updateState();
        net.sendStateUpdates();
        net_time += performance.now() - before_net;
        time_to_consume = time_to_consume - time_to_next_sync;
        time_to_next_sync = NET_DT;
      } else {
        gameState.step(time_to_consume, inputs());
        time_to_next_sync = time_to_next_sync - time_to_consume;
        break;
      }
    }
    gameState.renderFrame();
    let jsTime = performance.now() - frame_start_time;
    let frameTime = frame_start_time - previous_frame_time;
    let { reliableBufferSize, unreliableBufferSize, numDroppedUpdates } =
      net.stats();
    previous_frame_time = frame_start_time;
    avgJsTime = avgJsTime
      ? (1 - avgWeight) * avgJsTime + avgWeight * jsTime
      : jsTime;
    avgFrameTime = avgFrameTime
      ? (1 - avgWeight) * avgFrameTime + avgWeight * frameTime
      : frameTime;
    avgNetTime = avgNetTime
      ? (1 - avgWeight) * avgNetTime + avgWeight * net_time
      : net_time;
    const avgFPS = 1000 / avgFrameTime;
    debugDiv.innerText =
      controlsStr +
      `\n` +
      `(js per frame: ${avgJsTime.toFixed(
        2
      )}ms, net per frame: ${avgNetTime.toFixed(2)}ms, 
      fps: ${avgFPS.toFixed(
        1
      )}, buffers: r=${reliableBufferSize}/u=${unreliableBufferSize},
      dropped updates: ${numDroppedUpdates}
      objects=${gameState.numObjects})`;
    requestAnimationFrame(frame);
  };
  net = new Net(gameState, host, (id: string) => {
    if (hosting) {
      console.log("hello");
      console.log(`Net up and running with id ${id}`);
      navigator.clipboard.writeText(id);
      frame();
    } else {
      renderer.finishInit();
      frame();
    }
  });
}

async function main() {
  let controls = document.getElementById("server-controls") as HTMLDivElement;
  let serverStartButton = document.getElementById(
    "server-start"
  ) as HTMLButtonElement;
  let connectButton = document.getElementById("connect") as HTMLButtonElement;
  let serverIdInput = document.getElementById("server-id") as HTMLInputElement;
  serverStartButton.onclick = () => {
    startGame(null);
    controls.hidden = true;
  };
  connectButton.onclick = () => {
    startGame(serverIdInput.value);
    controls.hidden = true;
  };
}

test();

await main();
