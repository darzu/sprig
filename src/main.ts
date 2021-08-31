import { mat4, vec3, quat } from "./gl-matrix.js";
import Peer from "./peerjs.js";

// shaders

const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
    };
`;
const vertexShader =
  shaderSceneStruct +
  `
    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] normal : vec3<f32>;
        [[location(1)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        [[location(0)]] position : vec3<f32>,
        [[location(1)]] color : vec3<f32>,
        [[location(2)]] normal : vec3<f32>,
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.modelMatrix * vec4<f32>(position, 1.0);
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
        output.color = color;
        return output;
    }
`;
const fragmentShader =
  shaderSceneStruct +
  `
    [[group(0), binding(0)]] var<uniform> scene : Scene;

    struct VertexOutput {
        [[location(0)]] normal : vec3<f32>;
        [[location(1)]] color : vec3<f32>;
    };

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// defines the geometry and coloring of a mesh
interface Mesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
}

abstract class Object {
  location: vec3;
  rotation: quat;
  at_rest: boolean;
  linear_velocity: vec3;
  angular_velocity: vec3;
  owner: number;
  authority: number;

  constructor() {
    this.location = vec3.fromValues(0, 0, 0);
    this.rotation = quat.fromValues(0, 0, 0, 0);
    this.linear_velocity = vec3.fromValues(0, 0, 0);
    this.angular_velocity = vec3.fromValues(0, 0, 0);
    this.at_rest = true;
    this.owner = 0;
    this.authority = 0;
  }

  transform(): mat4 {
    return mat4.fromRotationTranslation(
      mat4.create(),
      this.rotation,
      this.location
    );
  }

  abstract mesh(): Mesh;
}

class Cube extends Object {
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

class GameState {
  players: Player[];
  cubes: SpinningCube[];
  me: number;
  sequences: number[];
  time: number;

  constructor() {
    let player = new Player(0);
    this.players = [player];
    let randomCubes: SpinningCube[] = [];
    for (let i = 0; i < 1; i++) {
      let cube = new SpinningCube();
      // create cubes with random colors
      cube.location = vec3.fromValues(0, 0, -5 * (i + 1));
      cube.rotation = quat.fromValues(0, 0, 0, 0);
      cube.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
      cube.axis = vec3.normalize(vec3.create(), [
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ]);
      cube.angular_velocity = vec3.scale(
        vec3.create(),
        cube.axis,
        Math.PI * 0.01
      );
      cube.at_rest = false;
      randomCubes.push(cube);
    }
    this.cubes = randomCubes;
    this.me = 0;
    this.sequences = [0];
    this.time = 0;
  }

  stepCubes(time: number) {
    for (let cube of this.cubes) {
      cube.angular_velocity = vec3.scale(
        cube.angular_velocity,
        cube.axis,
        Math.PI * 0.01
      );
      let deltaQuaternion = quat.setAxisAngle(
        quat.create(),
        cube.axis,
        time - this.time
      );
      quat.multiply(cube.rotation, deltaQuaternion, cube.rotation);
    }
  }

  step(time: number) {
    this.stepCubes(time);
    this.time = time;
  }

  snap(snapshot: string, time: number) {
    let deserialized = JSON.parse(snapshot);
    this.cubes = deserialized.cubes;
    this.time = time;
  }

  objects(): Object[] {
    let r = [];
    for (let o of this.players) {
      r.push(o);
    }
    for (let o of this.cubes) {
      r.push(o);
    }
    console.log(r.length);
    return r;
  }

  playerTransform() {
    return this.players[this.me].transform();
  }
}

const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = 4 * 4 /*4x4 mat*/ * 4; /*f32*/
const bytesPerVec3 = 3 /*vec3*/ * 4; /*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

// render pipeline parameters
const antiAliasSampleCount = 4;
const swapChainFormat = "bgra8unorm";
const depthStencilFormat = "depth24plus-stencil8";
const backgroundColor = { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspectRatio = 1;

// recomputes textures, widths, and aspect ratio on canvas resize
function checkCanvasResize(
  device: GPUDevice,
  canvasWidth: number,
  canvasHeight: number
) {
  if (lastWidth === canvasWidth && lastHeight === canvasHeight) return;

  if (depthTexture) depthTexture.destroy();
  if (colorTexture) colorTexture.destroy();

  depthTexture = device.createTexture({
    size: { width: canvasWidth, height: canvasHeight },
    format: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  depthTextureView = depthTexture.createView();

  colorTexture = device.createTexture({
    size: { width: canvasWidth, height: canvasHeight },
    sampleCount: antiAliasSampleCount,
    format: swapChainFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  colorTextureView = colorTexture.createView();

  lastWidth = canvasWidth;
  lastHeight = canvasHeight;

  aspectRatio = Math.abs(canvasWidth / canvasHeight);
}

// normally vertices can be shared by triangles, so this duplicates vertices as necessary so they are unshared
// TODO: this shouldn't be needed once "flat" shading is supported in Chrome's WGSL, see:
//      https://bugs.chromium.org/p/tint/issues/detail?id=746&q=interpolate&can=2
function unshareVertices(input: Mesh): Mesh {
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  input.tri.forEach(([i0, i1, i2], i) => {
    pos.push(input.pos[i0]);
    pos.push(input.pos[i1]);
    pos.push(input.pos[i2]);
    tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
  });
  return { pos, tri, colors: input.colors };
}

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need
// to track offsets into those buffers so we can make modifications and form draw calls.
interface MeshHandle {
  // handles into the buffers
  vertNumOffset: number;
  indicesNumOffset: number;
  modelUniByteOffset: number;
  triCount: number;
  // data
  obj: Object;
}

// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
const vertexDataFormat: GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: bytesPerVec3 * 0, format: "float32x3" }, // position
  { shaderLocation: 1, offset: bytesPerVec3 * 1, format: "float32x3" }, // color
  { shaderLocation: 2, offset: bytesPerVec3 * 2, format: "float32x3" }, // normals
];
// these help us pack and use vertices in that format
const vertElStride = 3 /*pos*/ + 3 /*color*/ + 3; /*normal*/
const vertByteSize = bytesPerFloat * vertElStride;

// define the format of our models' uniform buffer
const meshUniByteSizeExact =
  bytesPerMat4 + // transform
  bytesPerFloat; // max draw distance;
const meshUniByteSizeAligned = align(meshUniByteSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the format of our scene's uniform data
const sceneUniBufferSizeExact =
  bytesPerMat4 * 2 + // camera and light projection
  bytesPerVec3 * 1; // light pos
const sceneUniBufferSizeAligned = align(sceneUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the limits of our vertex, index, and uniform buffers
const maxMeshes = 100;
const maxTris = maxMeshes * 100;
const maxVerts = maxTris * 3;

// create a directional light and compute it's projection (for shadows) and direction
const worldOrigin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.lookAt(
  mat4.create(),
  lightPosition,
  worldOrigin,
  upVector
);
const lightProjectionMatrix = mat4.ortho(
  mat4.create(),
  -80,
  80,
  -80,
  80,
  -200,
  300
);
const lightViewProjMatrix = mat4.multiply(
  mat4.create(),
  lightProjectionMatrix,
  lightViewMatrix
);
const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
vec3.normalize(lightDir, lightDir);

function align(x: number, size: number): number {
  return Math.ceil(x / size) * size;
}
function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = vec3.cross(
    vec3.create(),
    vec3.sub(vec3.create(), p2, p1),
    vec3.sub(vec3.create(), p3, p1)
  );
  vec3.normalize(n, n);
  return n;
}

// matrix utilities
function pitch(m: mat4, rad: number) {
  return mat4.rotateX(m, m, rad);
}
function yaw(m: mat4, rad: number) {
  return mat4.rotateY(m, m, rad);
}
function roll(m: mat4, rad: number) {
  return mat4.rotateZ(m, m, rad);
}
function moveX(m: mat4, n: number) {
  return mat4.translate(m, m, [n, 0, 0]);
}
function moveY(m: mat4, n: number) {
  return mat4.translate(m, m, [0, n, 0]);
}
function moveZ(m: mat4, n: number) {
  return mat4.translate(m, m, [0, 0, n]);
}

interface MappedGPUBuffers {
  vertexBufferOffset: number;
  vertexBuffer: Float32Array;
  indexBufferOffset: number;
  indexBuffer: Uint16Array;
  meshUniformBufferOffset: number;
  meshUniformBuffer: Float32Array;
}

class Renderer {
  maxMeshes = 100;
  maxTris = maxMeshes * 100;
  maxVerts = maxTris * 3;

  state: GameState;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  numVerts: number;
  numTris: number;

  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  meshUniformBuffer: GPUBuffer;
  sceneUniformBuffer: GPUBuffer;

  cameraOffset: mat4;

  meshHandles: MeshHandle[];

  mappedGPUBuffers: MappedGPUBuffers | null = null;

  renderBundle: GPURenderBundle;

  private gpuBufferWriteMeshTransform(m: MeshHandle) {
    this.device.queue.writeBuffer(
      this.meshUniformBuffer,
      m.modelUniByteOffset,
      (m.obj.transform() as Float32Array).buffer
    );
  }

  // should only be called when GPU buffers are already mapped
  private getMappedRanges() {
    let vertexBuffer = new Float32Array(this.vertexBuffer.getMappedRange());
    let indexBuffer = new Uint16Array(this.indexBuffer.getMappedRange());
    let meshUniformBuffer = new Float32Array(
      this.meshUniformBuffer.getMappedRange()
    );

    this.mappedGPUBuffers = {
      vertexBuffer,
      indexBuffer,
      meshUniformBuffer,
      vertexBufferOffset: 0,
      indexBufferOffset: 0,
      meshUniformBufferOffset: 0,
    };
  }

  private async mapGPUBuffers() {
    await Promise.all([
      this.vertexBuffer.mapAsync(GPUMapMode.READ),
      this.indexBuffer.mapAsync(GPUMapMode.READ),
      this.meshUniformBuffer.mapAsync(GPUMapMode.READ),
    ]);
    this.getMappedRanges();
  }

  private unmapGPUBuffers() {
    this.vertexBuffer.unmap();
    this.indexBuffer.unmap();
    this.meshUniformBuffer.unmap();
    this.mappedGPUBuffers = null;
  }

  /*
                  Adds an object to be rendered. Currently expects the GPU's buffers to be memory-mapped.
                  
                  TODO: support adding objects when buffers aren't memory-mapped using device.queue
                */
  addObject(o: Object): MeshHandle {
    let m = o.mesh();
    m = unshareVertices(m); // work-around; see TODO inside function
    if (this.mappedGPUBuffers === null) {
      throw "addObject() called with un-mapped buffers";
    } else {
      // need to introduce a new variable to convince Typescript the mapping is non-null
      let mapped = this.mappedGPUBuffers;
      if (this.numVerts + m.pos.length > maxVerts) throw "Too many vertices!";
      if (this.numTris + m.tri.length > maxTris) throw "Too many triangles!";

      const vertNumOffset = this.numVerts;
      const indicesNumOffset = this.numTris * 3;

      m.tri.forEach((triInd, i) => {
        const vOff = this.numVerts * vertElStride;
        const iOff = this.numTris * indicesPerTriangle;
        mapped.indexBuffer[iOff + 0] = triInd[0];
        mapped.indexBuffer[iOff + 1] = triInd[1];
        mapped.indexBuffer[iOff + 2] = triInd[2];
        const normal = computeTriangleNormal(
          m.pos[triInd[0]],
          m.pos[triInd[1]],
          m.pos[triInd[2]]
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[0]], ...m.colors[i], ...normal],
          vOff + 0 * vertElStride
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[1]], ...m.colors[i], ...normal],
          vOff + 1 * vertElStride
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[2]], ...m.colors[i], ...normal],
          vOff + 2 * vertElStride
        );
        this.numVerts += 3;
        this.numTris += 1;
      });

      const uniOffset = this.meshHandles.length * meshUniByteSizeAligned;
      console.log(uniOffset);
      console.log(mapped.meshUniformBuffer);
      mapped.meshUniformBuffer.set(o.transform() as Float32Array, uniOffset);
      console.log(mapped.meshUniformBuffer);
      const res: MeshHandle = {
        vertNumOffset,
        indicesNumOffset,
        modelUniByteOffset: uniOffset,
        triCount: m.tri.length,
        obj: o,
      };
      console.log(res);
      this.meshHandles.push(res);
      return res;
    }
  }

  setupSceneBuffer() {
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      bytesPerMat4 * 1,
      (lightViewProjMatrix as Float32Array).buffer
    );
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      bytesPerMat4 * 2,
      (lightDir as Float32Array).buffer
    );
  }

  constructor(state: GameState, canvas: HTMLCanvasElement, device: GPUDevice) {
    this.state = state;
    this.canvas = canvas;
    this.device = device;
    this.context = canvas.getContext("gpupresent")!;
    this.context.configure({ device, format: swapChainFormat });

    this.vertexBuffer = device.createBuffer({
      size: maxVerts * vertByteSize,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    this.indexBuffer = device.createBuffer({
      size: maxTris * bytesPerTri,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    this.meshUniformBuffer = device.createBuffer({
      size: meshUniByteSizeAligned * maxMeshes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    this.getMappedRanges();
    // create our scene's uniform buffer
    this.sceneUniformBuffer = device.createBuffer({
      size: sceneUniBufferSizeAligned,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.meshHandles = [];
    this.numVerts = 0;
    this.numTris = 0;

    for (let obj of state.objects()) {
      this.addObject(obj);
    }
    this.unmapGPUBuffers();

    this.setupSceneBuffer();

    this.cameraOffset = mat4.create();
    pitch(this.cameraOffset, -Math.PI / 8);

    const modelUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform",
            hasDynamicOffset: true,
            minBindingSize: meshUniByteSizeAligned,
          },
        },
      ],
    });
    const modelUniBindGroup = device.createBindGroup({
      layout: modelUniBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.meshUniformBuffer,
            size: meshUniByteSizeAligned,
          },
        },
      ],
    });

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const primitiveBackcull: GPUPrimitiveState = {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    };

    // define the resource bindings for the mesh rendering pipeline
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const renderSceneUniBindGroup = device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
    });

    // setup our second phase pipeline which renders meshes to the canvas
    const renderPipelineDesc: GPURenderPipelineDescriptor = {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          renderSceneUniBindGroupLayout,
          modelUniBindGroupLayout,
        ],
      }),
      vertex: {
        module: device.createShaderModule({ code: vertexShader }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: vertByteSize,
            attributes: vertexDataFormat,
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: fragmentShader }),
        entryPoint: "main",
        targets: [{ format: swapChainFormat }],
      },
      primitive: primitiveBackcull,
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: depthStencilFormat,
      },
      multisample: {
        count: antiAliasSampleCount,
      },
    };
    const renderPipeline = device.createRenderPipeline(renderPipelineDesc);

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats: [swapChainFormat],
      depthStencilFormat: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
    });
    bundleEnc.setPipeline(renderPipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setVertexBuffer(0, this.vertexBuffer);
    bundleEnc.setIndexBuffer(this.indexBuffer, "uint16");
    for (let m of this.meshHandles) {
      console.log(m);
      bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
      bundleEnc.drawIndexed(
        m.triCount * 3,
        undefined,
        m.indicesNumOffset,
        m.vertNumOffset
      );
    }
    this.renderBundle = bundleEnc.finish();

    console.log(this.numTris);
    console.log(this.numVerts);
  }

  renderFrame() {
    checkCanvasResize(this.device, this.canvas.width, this.canvas.height);
    const viewMatrix = mat4.create();
    console.log(this.state.playerTransform());
    mat4.multiply(viewMatrix, viewMatrix, this.state.playerTransform());
    mat4.multiply(viewMatrix, viewMatrix, this.cameraOffset);
    mat4.translate(viewMatrix, viewMatrix, [0, 0, 10]); // TODO(@darzu): can this be merged into the camera offset?
    mat4.invert(viewMatrix, viewMatrix);
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspectRatio,
      1,
      10000.0 /*view distance*/
    );
    const viewProj = mat4.multiply(
      mat4.create(),
      projectionMatrix,
      viewMatrix
    ) as Float32Array;
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, viewProj.buffer);

    // start collecting our render commands for this frame
    const commandEncoder = this.device.createCommandEncoder();

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorTextureView,
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadValue: backgroundColor,
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView,
        depthLoadValue: 1.0,
        depthStoreOp: "store",
        stencilLoadValue: 0,
        stencilStoreOp: "store",
      },
    });
    renderPassEncoder.executeBundles([this.renderBundle]);
    renderPassEncoder.endPass();

    // submit render passes to GPU
    this.device.queue.submit([commandEncoder.finish()]);
  }
}

async function startServer() {
  let peer = new Peer();
  peer.on("open", (id: string) => {
    console.log(`Peer id is ${id}`);
  });
  let gameState: GameState = new GameState();
  let canvas = document.getElementById("sample-canvas") as HTMLCanvasElement;
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  let renderer = new Renderer(gameState, canvas, device);
  renderer.renderFrame();
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
