import { mat4, vec3, quat } from "./gl-matrix.js";
import { Mesh, scaleMesh, GameObject, GameState } from "./state.js";
import { Renderer } from "./render.js";
import Peer from "./peerjs.js";

class Plane extends GameObject {
  color: vec3;

  constructor() {
    super();
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
}

class Cube extends GameObject {
  color: vec3;

  constructor() {
    super();
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
}

class SpinningCube extends Cube {
  axis: vec3;

  constructor() {
    super();
    this.axis = vec3.fromValues(0, 0, 0);
  }
}

class Player extends Cube {
  constructor(id: number) {
    super();
    this.authority = id;
    this.owner = id;
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
  plane: Plane;
  players: Player[];
  cubes: SpinningCube[];
  cameraRotation: quat;
  cameraLocation: vec3;
  me: number;
  sequences: number[];

  constructor(time: number) {
    super(time);
    this.plane = new Plane();
    this.plane.location = vec3.fromValues(0, -3, -8);
    let player = new Player(0);
    this.players = [player];
    let randomCubes: SpinningCube[] = [];
    for (let i = 0; i < 1000; i++) {
      let cube = new SpinningCube();
      // create cubes with random colors
      cube.location = vec3.fromValues(
        Math.random() * 20 - 10,
        Math.random() * 5,
        -Math.random() * 10 - 5
      );
      //cube.linear_velocity = vec3.fromValues(0.002, 0, 0);
      cube.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
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
    }
    this.cubes = randomCubes;
    this.me = 0;
    this.sequences = [0];
    this.time = 0;
    this.cameraRotation = quat.identity(quat.create());
    quat.rotateX(this.cameraRotation, this.cameraRotation, -Math.PI / 8);
    this.cameraLocation = vec3.fromValues(0, 0, 10);
  }

  private player() {
    return this.players[this.me];
  }

  stepGame(dt: number, inputs: Inputs) {
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

  snap(snapshot: string, time: number) {
    let deserialized = JSON.parse(snapshot);
    this.cubes = deserialized.cubes;
    this.time = time;
  }

  objects(): GameObject[] {
    let r = [];
    r.push(this.plane);
    for (let o of this.players) {
      r.push(o);
    }
    for (let o of this.cubes) {
      r.push(o);
    }
    return r;
  }

  viewMatrix() {
    //TODO: this calculation feels like it should be simpler but Doug doesn't
    //understand quaternions.
    let viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, this.player().location);
    mat4.multiply(
      viewMatrix,
      viewMatrix,
      mat4.fromQuat(mat4.create(), this.player().rotation)
    );
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

async function startServer() {
  let peer = new Peer();
  peer.on("open", (id: string) => {
    console.log(`Peer id is ${id}`);
  });
  let gameState = new CubeGameState(performance.now());
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
  let renderer = new Renderer(gameState, canvas, device, 2000);
  let inputs = inputsReader(canvas);
  function doLockMouse() {
    canvas.requestPointerLock();
  }
  canvas.addEventListener("click", doLockMouse);

  const controlsStr = `controls: WASD, shift/c, mouse, spacebar`;
  let previousFrameTime = performance.now();
  let avgJsTime = 0;
  let avgFrameTime = 0;
  let avgWeight = 0.05;
  let frame = () => {
    let start = performance.now();
    gameState.step(performance.now(), inputs());
    renderer.renderFrame();
    let jsTime = performance.now() - start;
    let frameTime = start - previousFrameTime;
    console.log(`frame time is ${frameTime}, previous is ${previousFrameTime}`);
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
    requestAnimationFrame(frame);
  };
  frame();
}

async function main() {
  let controls = document.getElementById("server-controls") as HTMLDivElement;
  let serverStartButton = document.getElementById(
    "server-start"
  ) as HTMLButtonElement;
  serverStartButton.onclick = (e: MouseEvent) => {
    startServer();
    controls.hidden = true;
  };
}

await main();
