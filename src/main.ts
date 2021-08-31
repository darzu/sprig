const jsStartTime = performance.now();

import { mat4, vec3, quat } from "./gl-matrix.js";
import { Mesh, scaleMesh, GameObject, NetObject, GameState } from "./state.js";
import { Renderer } from "./render.js";
import { Net } from "./net.js";

class Plane extends GameObject {
  color: vec3;

  constructor(id: number) {
    super(id);
    this.color = vec3.fromValues(0.02, 0.02, 0.02);
  }

  mesh(): Mesh {
    return scaleMesh(
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
    );
  }

  type(): string {
    return "plane";
  }

  netObject() {
    let obj = super.netObject();
    obj.color = Array.from(this.color);
    return obj;
  }
}

abstract class Cube extends GameObject {
  color: vec3;

  constructor(id: number) {
    super(id);
    this.color = vec3.fromValues(0.2, 0, 0);
  }

  mesh(): Mesh {
    return {
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
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
        this.color,
      ],
    };
  }

  netObject() {
    let obj = super.netObject();
    obj.color = Array.from(this.color);
    return obj;
  }
}

class SpinningCube extends Cube {
  axis: vec3;

  constructor(id: number) {
    super(id);
    this.axis = vec3.fromValues(0, 0, 0);
  }

  type(): string {
    return "cube";
  }
  netObject() {
    let obj = super.netObject();
    obj.axis = Array.from(this.axis);
    return obj;
  }
}

class Player extends Cube {
  constructor(id: number, playerId: number) {
    super(id);
    this.authority = playerId;
  }

  type(): string {
    return "player";
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
  accel: boolean;
}

class CubeGameState extends GameState<Inputs> {
  players: Record<number, Player>;
  cubes: SpinningCube[];
  cameraRotation: quat;
  cameraLocation: vec3;

  constructor(time: number, renderer: Renderer, createObjects: boolean = true) {
    super(time, renderer);
    this.time = 0;
    this.me = 0;
    this.cameraRotation = quat.identity(quat.create());
    quat.rotateX(this.cameraRotation, this.cameraRotation, -Math.PI / 8);
    this.cameraLocation = vec3.fromValues(0, 0, 10);
    this.players = {};
    if (createObjects) {
      let plane = new Plane(this.id());
      plane.location = vec3.fromValues(0, -3, -8);
      this.addObject(plane);
      this.addPlayer();
      let randomCubes: SpinningCube[] = [];
      for (let i = 0; i < 10; i++) {
        let cube = new SpinningCube(this.id());
        // create cubes with random colors
        cube.location = vec3.fromValues(
          Math.random() * 20 - 10,
          Math.random() * 5,
          -Math.random() * 10 - 5
        );
        //cube.linear_velocity = vec3.fromValues(0.002, 0, 0);
        cube.color = vec3.fromValues(
          Math.random(),
          Math.random(),
          Math.random()
        );
        cube.axis = vec3.normalize(vec3.create(), [
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ]);
        cube.angular_velocity = vec3.scale(
          vec3.create(),
          cube.axis,
          Math.PI * 0.001
        );
        cube.at_rest = false;
        randomCubes.push(cube);
        this.addObject(cube);
      }
      this.cubes = randomCubes;
    } else {
      this.cubes = [];
    }
    // have added our objects, can unmap buffers
    this.renderer.unmapGPUBuffers();
    this.me = 0;
  }

  playerObject(playerId: number): GameObject {
    let p = new Player(this.id(), playerId);
    this.players[playerId] = p;
    return p;
  }

  objectFromNetObject(netObj: NetObject): GameObject {
    switch (netObj.type) {
      case "plane": {
        let p = new Plane(netObj.id);
        p.color = netObj.color;
        return p;
      }
      case "cube": {
        let c = new SpinningCube(netObj.id);
        c.color = netObj.color;
        c.axis = netObj.axis;
        this.cubes.push(c);
        return c;
      }
      case "player": {
        let p = new Player(netObj.id, netObj.authority);
        p.color = netObj.color;
        this.players[p.authority] = p;
        return p;
      }
      default:
        throw "Unrecognized object type";
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
    // move cubes in range of players, and claim authority over the cubes nearest us
    for (let cube of this.cubes) {
      cube.linear_velocity = vec3.fromValues(0, 0, 0);
      let min_distance = 10;
      let min_distance_player = -1;
      for (let player of Object.values(this.players)) {
        let cube_to_player = vec3.subtract(
          vec3.create(),
          player.location,
          cube.location
        );
        let distance = vec3.length(cube_to_player);
        if (distance < min_distance) {
          min_distance = distance;
          min_distance_player = player.authority;
        }
        if (
          vec3.length(cube_to_player) < 8 &&
          vec3.length(cube_to_player) > 2
        ) {
          // each player in range will pull the cube towards them
          vec3.normalize(cube_to_player, cube_to_player);
          vec3.scale(cube_to_player, cube_to_player, 0.01);
          vec3.add(cube.linear_velocity, cube.linear_velocity, cube_to_player);
        }
      }
      // claim authority?
      if (min_distance < 8 && min_distance_player == this.me) {
        cube.authority = this.me;
        cube.authority_seq += 1;
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
    mouseX += ev.movementX;
    mouseY += ev.movementY;
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
    };
    mouseX = 0;
    mouseY = 0;
    return inputs;
  }
  return getInputs;
}

// TODO(@darzu): needed?
interface Game {
  gameState: CubeGameState;
  renderer: Renderer;
  device: GPUDevice;
  running: boolean;
  net: Net<Inputs>;
}

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
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const renderer = new Renderer(canvas, device, 2000);
  const gameState = new CubeGameState(performance.now(), renderer, hosting);
  const inputs = inputsReader(canvas);
  function doLockMouse() {
    canvas.requestPointerLock();
  }
  canvas.addEventListener("click", doLockMouse);

  const controlsStr = `controls: WASD, shift/c, mouse, spacebar`;
  let previousFrameTime = performance.now();
  let avgJsTime = 0;
  let avgFrameTime = 0;
  const avgWeight = 0.05;
  let net: Net<Inputs>;
  const frame = () => {
    const start = performance.now();
    gameState.step(performance.now(), inputs());
    gameState.renderFrame();
    const jsTime = performance.now() - start;
    const frameTime = start - previousFrameTime;
    previousFrameTime = start;
    avgJsTime = avgJsTime
      ? (1 - avgWeight) * avgJsTime + avgWeight * jsTime
      : jsTime;
    avgFrameTime = avgFrameTime
      ? (1 - avgWeight) * avgFrameTime + avgWeight * frameTime
      : frameTime;
    const avgFPS = 1000 / avgFrameTime;
    debugDiv.innerText =
      controlsStr +
      `\n` +
      `(js per frame: ${avgJsTime.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)})`;
    net.sendStateUpdates();
    requestAnimationFrame(frame);
  };
  net = new Net(gameState, host, (id: string) => {
    if (hosting) {
      console.log(`Net up and running with id ${id} (after ${(performance.now() - jsStartTime).toFixed(1)}ms)`);
      navigator.clipboard.writeText(id);
    } else {
      // TODO(@darzu): shouldn't be needed
      // renderer.unmapGPUBuffers();
    }
  });
  frame();
}

async function main() {
  let controls = document.getElementById("server-controls") as HTMLDivElement;
  let serverStartButton = document.getElementById(
    "server-start"
  ) as HTMLButtonElement;
  let connectButton = document.getElementById("connect") as HTMLButtonElement;
  let serverIdInput = document.getElementById("server-id") as HTMLInputElement;
  serverStartButton.onclick = () => {
    // startGame(null);
    controls.hidden = true;
  };
  connectButton.onclick = () => {
    startGame(serverIdInput.value);
    controls.hidden = true;
  };
  startGame(null);
}

await main();
