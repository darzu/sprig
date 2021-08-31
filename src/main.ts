import { mat4, vec3, quat } from "./gl-matrix.js";
import { Mesh, GameObject, GameState } from "./state.js";
import { Renderer, pitch } from "./render.js";
import Peer from "./peerjs.js";

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
  players: Player[];
  cubes: SpinningCube[];
  cameraOffset: mat4;
  me: number;
  sequences: number[];

  constructor(time: number) {
    super(time);
    let player = new Player(0);
    this.players = [player];
    let randomCubes: SpinningCube[] = [];
    for (let i = 0; i < 1; i++) {
      let cube = new SpinningCube();
      // create cubes with random colors
      cube.location = vec3.fromValues(0, 0, -10 * (i + 1));
      //cube.linear_velocity = vec3.fromValues(0.002, 0, 0);
      cube.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
      cube.color = vec3.fromValues(0, 0, 0);
      if (i === 0) cube.color = vec3.fromValues(1, 0, 0);
      if (i === 1) cube.color = vec3.fromValues(0, 1, 0);
      if (i === 2) cube.color = vec3.fromValues(0, 0, 1);
      if (i === 3) cube.color = vec3.fromValues(1, 0, 1);
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
    this.cameraOffset = mat4.create();
    pitch(this.cameraOffset, -Math.PI / 8);
  }

  stepGame(dt: number, inputs: Inputs) {}

  snap(snapshot: string, time: number) {
    let deserialized = JSON.parse(snapshot);
    this.cubes = deserialized.cubes;
    this.time = time;
  }

  objects(): GameObject[] {
    let r = [];
    for (let o of this.players) {
      r.push(o);
    }
    for (let o of this.cubes) {
      r.push(o);
    }
    return r;
  }

  viewMatrix() {
    const viewMatrix = mat4.create();

    mat4.multiply(viewMatrix, viewMatrix, this.players[this.me].transform());
    mat4.multiply(viewMatrix, viewMatrix, this.cameraOffset);
    mat4.translate(viewMatrix, viewMatrix, [0, 0, 10]); // TODO(@darzu): can this be merged into the camera offset?
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
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  let renderer = new Renderer(gameState, canvas, device);
  let inputs = inputsReader(canvas);
  let frame = () => {
    gameState.step(performance.now(), inputs());
    renderer.renderFrame();
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
