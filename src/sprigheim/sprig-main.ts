import { mat4, vec3 } from '../ext/gl-matrix.js';
import { align } from '../math.js';
import { initGrassSystem } from './grass.js';
import { createMeshPoolBuilder, MeshHandle, MeshPool, meshUniByteSizeAligned, setVertexData, vertByteSize, vertexDataFormat, VertexKind } from './mesh-pool.js';

const ENABLE_WATER = false;

// Defines shaders in WGSL for the shadow and regular rendering pipelines. Likely you'll want
// these in external files but they've been inlined for redistribution convenience.
// shader common structs
const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
        time : f32;
        targetSize: vec2<f32>;
        cameraPos : vec3<f32>;
    };
`;
const vertexInputStruct = `
    [[location(0)]] position : vec3<f32>,
    [[location(1)]] color : vec3<f32>,
    [[location(2)]] normal : vec3<f32>,
    [[location(3)]] kind : u32,
`;
const vertexShaderOutput = `
    [[location(0)]] shadowPos : vec3<f32>;
    [[location(1)]] [[interpolate(flat)]] normal : vec3<f32>;
    [[location(2)]] [[interpolate(flat)]] color : vec3<f32>;
    [[location(3)]] worldPos : vec3<f32>;
    [[builtin(position)]] position : vec4<f32>;
`
const shaderModelStruct = `
    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
        modelMin: vec3<f32>;
        modelMax: vec3<f32>;
    };
`
// shader code
const vertexShaderForShadows = `
    ${shaderSceneStruct}

    ${shaderModelStruct}

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    [[stage(vertex)]]
    fn main([[location(0)]] position : vec3<f32>) -> [[builtin(position)]] vec4<f32> {
        return scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
    }
`;
const fragmentShaderForShadows = `
    [[stage(fragment)]] fn main() { }
`;
const vertexShader = `
    ${shaderSceneStruct}

    ${shaderModelStruct}

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;
    // [[group(0), binding(3)]] var fsTexture: texture_2d<f32>;

    struct VertexOutput {
        ${vertexShaderOutput}
    };

    fn waterDisplace(pos: vec3<f32>) -> vec3<f32> {
        let t = scene.time * 0.004;
        let xt = pos.x + t;
        let zt = pos.z + t;
        let y = 0.0
            + sin(xt * 0.2)
            + cos((zt * 2.0 + xt) * 0.1) * 2.0
            + cos((zt * 0.5 + xt * 0.2) * 0.2) * 4.0
            + sin((xt * 0.5 + zt) * 0.9) * 0.2
            + sin((xt - zt * 0.5) * 0.7) * 0.1
            ;
        return vec3<f32>(0.0, y, 0.0);
    }

    // fn quantize(n: f32, step: f32) -> f32 {
    //     return floor(n / step) * step;
    // }

    [[stage(vertex)]]
    fn main(
        ${vertexInputStruct}
        ) -> VertexOutput {
        var output : VertexOutput;

        // // sample from displacement map
        // // let geometrySize: vec2<f32> = vec2<f32>(100.0, 100.0);
        // let geometrySize: vec2<f32> = (model.modelMax - model.modelMin).xz;
        // let fsSampleCoord = vec2<i32>(((position.xz - model.modelMin.xz) / geometrySize) * vec2<f32>(textureDimensions(fsTexture)));
        // let fsSample : vec3<f32> = textureLoad(fsTexture, fsSampleCoord, 0).rgb;
        // let fsSampleQuant = vec3<f32>(quantize(fsSample.x, 0.1), quantize(fsSample.y, 0.1), quantize(fsSample.z, 0.1));
        let positionL: vec3<f32> = vec3<f32>(position.x - 1.0, position.y, position.z);
        let positionB: vec3<f32> = vec3<f32>(position.x, position.y, position.z - 1.0);
        var displacement: vec3<f32> = vec3<f32>(0.0);
        var displacementL: vec3<f32> = vec3<f32>(0.0);
        var displacementB: vec3<f32> = vec3<f32>(0.0);
        if (kind == 1u) {
            displacement = waterDisplace(position);
            displacementL = waterDisplace(positionL);
            displacementB = waterDisplace(positionB);
        }
        let dPos: vec3<f32> = position + displacement;
        let dPosL: vec3<f32> = positionL + displacementL;
        let dPosB: vec3<f32> = positionB + displacementB;

        var dNorm: vec3<f32> = normal;
        if (kind == 1u) {
            // const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
            dNorm = normalize(cross(dPosB - dPos, dPosL - dPos));
            // dNorm = normalize(cross(dPos - dPosB, dPos - dPosL));
        }

        // var dPos2: vec3<f32>;

        // if (kind == 1u) {
        //     dPos2 = position + fsSample;
        //     // dPos2 = position + fsSampleQuant * 10.0;
        // } else {
        //     dPos2 = position;
        // }

        let worldPos: vec4<f32> = model.modelMatrix * vec4<f32>(dPos, 1.0);

        // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight : vec4<f32> = scene.lightViewProjMatrix * worldPos;
        // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
        output.shadowPos = vec3<f32>(
            posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
            posFromLight.z
        );

        let worldNorm: vec4<f32> = normalize(model.modelMatrix * vec4<f32>(dNorm, 0.0));

        output.worldPos = worldPos.xyz;
        output.position = scene.cameraViewProjMatrix * worldPos;
        // let xyz = (output.position.xyz / output.position.w);
        // let xy = (xyz.xy / xyz.z);
        // // output.screenCoord = normalize(xy) * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
        output.normal = worldNorm.xyz;
        // output.color = model.modelMin + model.modelMax;
        // output.color = model.modelMax;
        // output.color = vec3<f32>(geometrySize.x, 0.0, geometrySize.y);
        output.color = color;
        // output.color = worldNorm.xyz;
        return output;
    }
`;
const fragmentShader = `
    ${shaderSceneStruct}

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    // TODO(@darzu): waiting on this sample to work again: http://austin-eng.com/webgpu-samples/samples/shadowMapping
    [[group(0), binding(2)]] var shadowSampler: sampler_comparison;
    [[group(0), binding(3)]] var fsTexture: texture_2d<f32>;
    [[group(0), binding(4)]] var samp : sampler;

    struct VertexOutput {
        ${vertexShaderOutput}
    };

    fn quantize(n: f32, step: f32) -> f32 {
        return floor(n / step) * step;
    }

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        // let shadowVis : f32 = 1.0;
        let shadowVis : f32 = textureSampleCompare(shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);
        let sunLight : f32 = shadowVis * clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);

        // // TODO: test fs shader
        // // top left is 0,0
        // let screenCoordinates = input.position.xy / scene.targetSize;
        // let fsSampleCoord = screenCoordinates * vec2<f32>(textureDimensions(fsTexture));
        // // let fsSampleCoord = vec2<f32>(input.position.x, input.position.y);
        // let fsSample : vec3<f32> = textureSample(fsTexture, samp, screenCoordinates).rgb;
        // let fsSampleQuant = vec3<f32>(quantize(fsSample.x, 0.1), quantize(fsSample.y, 0.1), quantize(fsSample.z, 0.1));


        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2); // + fsSampleQuant * 0.2;
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// generates a texture
const vertexShaderForFS = `
    [[block]] struct Scene {
        time : f32;
    };

    struct VertexOutput {
        [[builtin(position)]] position: vec4<f32>;
        [[location(0)]] coordinate: vec2<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;

    [[stage(vertex)]]
    fn main([[location(0)]] position : vec2<f32>) -> VertexOutput {
        // TODO:
        var output: VertexOutput;
        output.position = vec4<f32>(position, 0.0, 1.0);
        output.coordinate = position * 0.5 + 0.5;
        return output;
    }
`;
const fragmentShaderForFS = `
    struct VertexOutput {
        [[builtin(position)]] position: vec4<f32>;
        [[location(0)]] coordinate: vec2<f32>;
    };

    [[stage(fragment)]]
    fn main(
        input: VertexOutput
    ) -> [[location(0)]] vec4<f32> {
        let r = input.coordinate.x;
        let g = input.coordinate.y;
        let b = 0.0;
        return vec4<f32>(r, g, b, 1.0);
     }
`;

const computeForFS = `
  [[block]] struct Scene {
    time : f32;
  };

  [[group(0), binding(0)]] var<uniform> scene : Scene;
  [[group(0), binding(1)]] var output : texture_storage_2d<rgba8unorm, write>;

  // TODO: try workgroup data
  // var<workgroup> tile : array<array<vec3<f32>, 256>, 4>;

  fn waterDisplace(pos: vec3<f32>) -> vec3<f32> {
    let t = scene.time * 0.004;
    let xt = pos.x + t;
    let zt = pos.z + t;
    let y = 0.0
        + sin(xt * 0.2)
        + cos((zt * 2.0 + xt) * 0.1) * 2.0
        + cos((zt * 0.5 + xt * 0.2) * 0.2) * 4.0
        + sin((xt * 0.5 + zt) * 0.9) * 0.2
        + sin((xt - zt * 0.5) * 0.7) * 0.1
        ;
    return vec3<f32>(0.0, y, 0.0);
}

  [[stage(compute), workgroup_size(8, 8, 1)]]
  fn main(
    [[builtin(workgroup_id)]] groupId : vec3<u32>,
    [[builtin(local_invocation_id)]] localId : vec3<u32>,
    [[builtin(global_invocation_id)]] globalId : vec3<u32>
  ) {
    let dims : vec2<i32> = textureDimensions(output);

    let col: u32 = (groupId.x * 8u) + localId.x;
    let row: u32 = (groupId.y * 8u) + localId.y;
    let coord = vec2<i32>(i32(col), i32(row));

    let x = f32(col) / f32(dims.x);
    let y = f32(row) / f32(dims.y);
    let z = 0.0;

    let pos = vec3<f32>(f32(col), f32(row), z);

    // let height = y;
    let height = waterDisplace(pos).y;

    let res = vec4<f32>(0.0, height, 0.0, 1.0);

    textureStore(output, coord, res);
  }
`

// useful constants
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerUint16 = Uint16Array.BYTES_PER_ELEMENT;
const bytesPerUint32 = Uint32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

// render pipeline parameters
const antiAliasSampleCount = 4;
const swapChainFormat = 'bgra8unorm';
const depthStencilFormat = 'depth24plus-stencil8';
const shadowDepthStencilFormat = 'depth32float';
const backgroundColor = { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };

// this state is recomputed upon canvas resize
let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspectRatio = 1;

// recomputes textures, widths, and aspect ratio on canvas resize
function checkCanvasResize(device: GPUDevice, canvasWidth: number, canvasHeight: number) {
    if (lastWidth === canvasWidth && lastHeight === canvasHeight)
        return;

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
    });;
    colorTextureView = colorTexture.createView();

    lastWidth = canvasWidth;
    lastHeight = canvasHeight;

    aspectRatio = Math.abs(canvasWidth / canvasHeight);
}

// defines the geometry and coloring of a mesh
export interface Mesh {
    pos: vec3[];
    tri: vec3[];
    colors: vec3[];  // colors per triangle in r,g,b float [0-1] format
    // format flags:
    usesProvoking?: boolean,
    verticesUnshared?: boolean, // TODO(@darzu): support
}

function unshareVertices(input: Mesh): Mesh {
    const pos: vec3[] = []
    const tri: vec3[] = []
    input.tri.forEach(([i0, i1, i2], i) => {
        pos.push(input.pos[i0]);
        pos.push(input.pos[i1]);
        pos.push(input.pos[i2]);
        tri.push([
            i * 3 + 0,
            i * 3 + 1,
            i * 3 + 2,
        ])
    })
    return { pos, tri, colors: input.colors, verticesUnshared: true }
}
function unshareProvokingVertices(input: Mesh): Mesh {
    const pos: vec3[] = [...input.pos]
    const tri: vec3[] = []
    const provoking: { [key: number]: boolean } = {}
    input.tri.forEach(([i0, i1, i2], triI) => {
        if (!provoking[i0]) {
            // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
            provoking[i0] = true;
            tri.push([i0, i1, i2])
        } else if (!provoking[i1]) {
            // First vertex was taken, so let's see if we can rotate the indices to get an unused 
            // provoking vertex.
            provoking[i1] = true;
            tri.push([i1, i2, i0])
        } else if (!provoking[i2]) {
            // ditto
            provoking[i2] = true;
            tri.push([i2, i0, i1])
        } else {
            // All vertices are taken, so create a new one
            const i3 = pos.length;
            pos.push(input.pos[i0])
            provoking[i3] = true;
            tri.push([i3, i1, i2])
        }
    })
    return { ...input, pos, tri, usesProvoking: true }
}


// define our meshes (ideally these would be imported from a standard format)
export const CUBE: Mesh = unshareProvokingVertices({
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
        [0, 1, 2], [0, 2, 3], // front
        [4, 5, 1], [4, 1, 0], // top
        [3, 4, 0], [3, 7, 4], // right
        [2, 1, 5], [2, 5, 6], // left
        [6, 3, 2], [6, 7, 3], // bottom
        [5, 4, 7], [5, 7, 6], // back
    ],
    colors: [
        [0.2, 0, 0], [0.2, 0, 0], // front
        [0.2, 0, 0], [0.2, 0, 0], // top
        [0.2, 0, 0], [0.2, 0, 0], // right
        [0.2, 0, 0], [0.2, 0, 0], // left
        [0.2, 0, 0], [0.2, 0, 0], // bottom
        [0.2, 0, 0], [0.2, 0, 0], // back
    ],
})
const PLANE: Mesh = unshareProvokingVertices({
    pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
    ],
    tri: [
        [0, 2, 3], [0, 3, 1], // top
        [3, 2, 0], [1, 3, 0], // bottom
    ],
    colors: [
        [0.02, 0.02, 0.02], [0.02, 0.02, 0.02],
        [0.02, 0.02, 0.02], [0.02, 0.02, 0.02],
    ],
})

// TODO(@darzu): SCENE FORMAT
// defines the format of our scene's uniform data
const sceneUniBufferSizeExact =
    bytesPerMat4 * 2 // camera and light projection
    + bytesPerVec3 * 1 // light pos
    + bytesPerFloat * 1 // time
    + bytesPerFloat * 2 // targetSize
    + bytesPerVec3 * 1 // camera pos
export const sceneUniBufferSizeAligned = align(sceneUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned

// create a directional light and compute it's projection (for shadows) and direction
const worldOrigin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.lookAt(mat4.create(), lightPosition, worldOrigin, upVector);
const lightProjectionMatrix = mat4.ortho(mat4.create(), -80, 80, -80, 80, -200, 300);
const lightViewProjMatrix = mat4.multiply(mat4.create(), lightProjectionMatrix, lightViewMatrix);
const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
vec3.normalize(lightDir, lightDir);

type RenderFrameFn = (timeMS: number) => void;
function attachToCanvas(canvasRef: HTMLCanvasElement, device: GPUDevice): RenderFrameFn {
    // configure our canvas backed swapchain
    const context = canvasRef.getContext('webgpu')!;
    context.configure({ device, format: swapChainFormat });

    // create our scene's uniform buffer
    const sceneUniBuffer = device.createBuffer({
        size: sceneUniBufferSizeAligned,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // setup a binding for our per-mesh uniforms
    const modelUniBindGroupLayout = device.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: meshUniByteSizeAligned },
        }],
    });

    const poolBuilder = createMeshPoolBuilder(device, {
        maxMeshes: 100,
        maxTris: 300,
        maxVerts: 900
    });

    // TODO(@darzu): adding via pool should work...
    const ground = poolBuilder.addMesh(PLANE);
    const player = poolBuilder.addMesh(CUBE);
    const randomCubes: MeshHandle[] = [];
    const NUM_CUBES = 10;
    for (let i = 0; i < NUM_CUBES; i++) {
        // create cubes with random colors
        const color: vec3 = [Math.random(), Math.random(), Math.random()];
        const coloredCube: Mesh = { ...CUBE, colors: CUBE.colors.map(_ => color) }
        randomCubes.push(poolBuilder.addMesh(coloredCube));
    }

    const pool = poolBuilder.finish();
    const poolUniBindGroup = device.createBindGroup({
        layout: modelUniBindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: pool.uniformBuffer, size: meshUniByteSizeAligned, },
        }],
    });

    // place the ground
    mat4.translate(ground.transform, ground.transform, [0, -3, -8])
    mat4.scale(ground.transform, ground.transform, [10, 10, 10])
    pool.updateUniform(ground);

    // initialize our cubes; each will have a random axis of rotation
    const randomCubesAxis: vec3[] = []
    for (let m of randomCubes) {
        // place and rotate cubes randomly
        mat4.translate(m.transform, m.transform, [Math.random() * 20 - 10, Math.random() * 5, -Math.random() * 10 - 5])
        const axis: vec3 = vec3.normalize(vec3.create(), [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        randomCubesAxis.push(axis)
        pool.updateUniform(m);
        // TODO(@darzu): debug
        // meshApplyMinMaxPos(m);
    }

    // init grass
    const grass = initGrassSystem(device)

    // init water
    const water = createWaterSystem(device);

    // track which keys are pressed for use in the game loop
    const pressedKeys: { [keycode: string]: boolean } = {}
    window.addEventListener('keydown', (ev) => pressedKeys[ev.key.toLowerCase()] = true, false);
    window.addEventListener('keyup', (ev) => pressedKeys[ev.key.toLowerCase()] = false, false);

    // track mouse movement for use in the game loop
    let _mouseAccumulatedX = 0;
    let _mouseAccummulatedY = 0;
    window.addEventListener('mousemove', (ev) => {
        _mouseAccumulatedX += ev.movementX
        _mouseAccummulatedY += ev.movementY
    }, false);
    function takeAccumulatedMouseMovement(): { x: number, y: number } {
        const result = { x: _mouseAccumulatedX, y: _mouseAccummulatedY };
        _mouseAccumulatedX = 0; // reset accumulators
        _mouseAccummulatedY = 0;
        return result
    }

    // when the player clicks on the canvas, lock the cursor for better gaming (the browser lets them exit)
    function doLockMouse() {
        canvasRef.requestPointerLock();
        canvasRef.removeEventListener('click', doLockMouse)
    }
    canvasRef.addEventListener('click', doLockMouse)

    // create the "player", which is an affine matrix tracking position & orientation of a cube
    // the camera will follow behind it.
    const cameraOffset = mat4.create();
    pitch(cameraOffset, -Math.PI / 8)
    // mat4.rotateY(player.transform, player.transform, Math.PI * 1.25)
    pool.updateUniform(player)

    // write the light data to the scene uniform buffer
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 1, (lightViewProjMatrix as Float32Array).buffer);
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 2, (lightDir as Float32Array).buffer);

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const primitiveBackcull: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'none', // TODO(@darzu): 
        // cullMode: 'back', 
        frontFace: 'ccw',
    };


    // TODO(@darzu): trying to extract the shadow pipeline
    let shadowBundle: GPURenderBundle;
    let shadowDepthTextureView: GPUTextureView;
    {
        // define the resource bindings for the shadow pipeline
        const shadowSceneUniBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            ],
        });
        const shadowSceneUniBindGroup = device.createBindGroup({
            layout: shadowSceneUniBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: sceneUniBuffer } }
            ],
        });
        // create the texture that our shadow pass will render to
        const shadowDepthTextureDesc: GPUTextureDescriptor = {
            size: { width: 2048 * 2, height: 2048 * 2 },
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
            format: shadowDepthStencilFormat,
        }
        const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
        shadowDepthTextureView = shadowDepthTexture.createView();

        // setup our first phase pipeline which tracks the depth of meshes 
        // from the point of view of the lighting so we know where the shadows are
        const shadowPipelineDesc: GPURenderPipelineDescriptor = {
            layout: device.createPipelineLayout({
                bindGroupLayouts: [shadowSceneUniBindGroupLayout, modelUniBindGroupLayout],
            }),
            vertex: {
                module: device.createShaderModule({ code: vertexShaderForShadows }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: vertByteSize,
                    attributes: vertexDataFormat,
                }],
            },
            fragment: {
                module: device.createShaderModule({ code: fragmentShaderForShadows }),
                entryPoint: 'main',
                targets: [],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: shadowDepthStencilFormat,
            },
            primitive: primitiveBackcull,
        };
        const shadowPipeline = device.createRenderPipeline(shadowPipelineDesc);

        // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
        // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
        const shadowBundleEnc = device.createRenderBundleEncoder({
            colorFormats: [],
            depthStencilFormat: shadowDepthStencilFormat,
        });
        shadowBundleEnc.setPipeline(shadowPipeline);
        shadowBundleEnc.setBindGroup(0, shadowSceneUniBindGroup);
        shadowBundleEnc.setVertexBuffer(0, pool.verticesBuffer);
        shadowBundleEnc.setIndexBuffer(pool.indicesBuffer, 'uint16');
        for (let m of pool.allMeshes) {
            shadowBundleEnc.setBindGroup(1, poolUniBindGroup, [m.modelUniByteOffset]);
            shadowBundleEnc.drawIndexed(m.numTris * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        }
        shadowBundle = shadowBundleEnc.finish()
    }

    // TODO(@darzu): trying to extract the shadow pipeline
    let fsUniBuffer: GPUBuffer;
    let fsBundle: GPURenderBundle;
    let fsTextureView: GPUTextureView;
    {
        const width = 2048;
        const height = 2048;
        // TODO(@darzu): FS SCENE FORMAT
        const fsUniBufferSizeExact = 0
            + bytesPerFloat * 1 // time
        const fsUniBufferSizeAligned = align(fsUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned
        fsUniBuffer = device.createBuffer({
            size: fsUniBufferSizeAligned,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const fsSceneUniBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            ],
        });
        const fsSceneUniBindGroup = device.createBindGroup({
            layout: fsSceneUniBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: fsUniBuffer } }
            ],
        });
        const fsColorFormat: GPUTextureFormat = 'bgra8unorm'; // rgba8unorm
        const fsTextureDesc: GPUTextureDescriptor = {
            size: { width, height },
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
            format: fsColorFormat, // TODO(@darzu): which format?
        }
        const fsDepthTexture = device.createTexture(fsTextureDesc);
        fsTextureView = fsDepthTexture.createView();
        const fsVertByteSize = bytesPerFloat * 2 // TODO(@darzu): FS VERTEX FORMAT
        const fsVertexDataFormat: GPUVertexAttribute[] = [
            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
        ];
        const fsPipelineDesc: GPURenderPipelineDescriptor = {
            layout: device.createPipelineLayout({
                bindGroupLayouts: [fsSceneUniBindGroupLayout],
            }),
            vertex: {
                module: device.createShaderModule({ code: vertexShaderForFS }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: fsVertByteSize,
                    attributes: fsVertexDataFormat,
                }],
            },
            fragment: {
                module: device.createShaderModule({ code: fragmentShaderForFS }),
                entryPoint: 'main',
                targets: [{ format: fsColorFormat }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
                frontFace: 'ccw',
            },
        };
        const numVerts = 6;
        const fsVerticesBuffer = device.createBuffer({
            size: numVerts * fsVertByteSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        {
            // TODO(@darzu): 
            // var uv = array<vec2<f32>, 6>(
            //     vec2<f32>(1.0, 0.0),
            //     vec2<f32>(1.0, 1.0),
            //     vec2<f32>(0.0, 1.0),
            //     vec2<f32>(1.0, 0.0),
            //     vec2<f32>(0.0, 1.0),
            //     vec2<f32>(0.0, 0.0));
            const fsVertsMap = new Float32Array(fsVerticesBuffer.getMappedRange())
            fsVertsMap.set([
                ...[1.0, 1.0],
                ...[1.0, -1.0],
                ...[-1.0, -1.0],
                ...[1.0, 1.0],
                ...[-1.0, -1.0],
                ...[-1.0, 1.0],
            ]);
        }
        // TODO(@darzu): set verts
        fsVerticesBuffer.unmap();
        const fsPipeline = device.createRenderPipeline(fsPipelineDesc);
        const fsBundleEnc = device.createRenderBundleEncoder({
            colorFormats: [fsColorFormat],
        });
        fsBundleEnc.setPipeline(fsPipeline);
        fsBundleEnc.setBindGroup(0, fsSceneUniBindGroup);
        fsBundleEnc.setVertexBuffer(0, fsVerticesBuffer);
        fsBundleEnc.draw(numVerts);
        fsBundle = fsBundleEnc.finish()
    }

    // // our compute pipeline for generating a texture
    // const computeTexWidth = 2048;
    // const computeTexHeight = 2048;
    // const computeGroupSize = 8; // TODO(@darzu): is this needed?
    // let computeTextureView: GPUTextureView;
    // let computeSceneBuffer: GPUBuffer;
    // let computePipeline: GPUComputePipeline;
    // let computeBindGroup: GPUBindGroup;
    // {
    //     computePipeline = device.createComputePipeline({
    //         compute: {
    //             module: device.createShaderModule({
    //                 code: computeForFS,
    //             }),
    //             entryPoint: 'main',
    //         },
    //     });

    //     const computeSceneSizeExact = bytesPerFloat * 1; // time
    //     computeSceneBuffer = device.createBuffer({
    //         size: computeSceneSizeExact,
    //         usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    //     });

    //     const computeColorFormat: GPUTextureFormat = 'rgba8unorm'; // rgba8unorm
    //     const computeTextureDesc: GPUTextureDescriptor = {
    //         size: { width: computeTexWidth, height: computeTexHeight },
    //         usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE | GPUTextureUsage.SAMPLED,
    //         format: computeColorFormat, // TODO(@darzu): which format?
    //     }
    //     const computeTexture = device.createTexture(computeTextureDesc);
    //     computeTextureView = computeTexture.createView();

    //     computeBindGroup = device.createBindGroup({
    //         layout: computePipeline.getBindGroupLayout(0),
    //         entries: [
    //             { binding: 0, resource: { buffer: computeSceneBuffer } },
    //             { binding: 1, resource: computeTextureView },
    //         ],
    //     });
    // }
    // setup our second phase pipeline which renders meshes to the canvas
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
            // TODO(@darzu): testing fullscreen shader
            { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
    });
    const renderSceneUniBindGroup = device.createBindGroup({
        layout: renderSceneUniBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: sceneUniBuffer } },
            { binding: 1, resource: shadowDepthTextureView },
            { binding: 2, resource: device.createSampler({ compare: 'less' }) },
            { binding: 3, resource: fsTextureView },
            // { binding: 3, resource: computeTextureView },
            {
                binding: 4, resource: device.createSampler({
                    magFilter: 'linear',
                    minFilter: 'linear',
                })
            },
        ],
    });
    const renderPipelineDesc: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderSceneUniBindGroupLayout, modelUniBindGroupLayout],
        }),
        vertex: {
            module: device.createShaderModule({ code: vertexShader }),
            entryPoint: 'main',
            buffers: [{
                arrayStride: vertByteSize,
                attributes: vertexDataFormat,
            }],
        },
        fragment: {
            module: device.createShaderModule({ code: fragmentShader }),
            entryPoint: 'main',
            targets: [{ format: swapChainFormat }],
        },
        primitive: primitiveBackcull,
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: depthStencilFormat,
        },
        multisample: {
            count: antiAliasSampleCount,
        },
    };
    const renderPipeline = device.createRenderPipeline(renderPipelineDesc);


    const bundleEnc = device.createRenderBundleEncoder({
        colorFormats: [swapChainFormat],
        depthStencilFormat: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
    });
    bundleEnc.setPipeline(renderPipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    for (let p of [pool, ...grass.getGrassPools(), ...water.getMeshPools()]) {
        // TODO(@darzu): not super happy about these being created during bundle time...
        const modelUniBindGroup = device.createBindGroup({
            layout: modelUniBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: p.uniformBuffer, size: meshUniByteSizeAligned, },
            }],
        });

        bundleEnc.setVertexBuffer(0, p.verticesBuffer);
        bundleEnc.setIndexBuffer(p.indicesBuffer, 'uint16');
        console.log("rendering: " + p.allMeshes.length)
        for (let m of p.allMeshes) {
            bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
            bundleEnc.drawIndexed(m.numTris * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        }
    }
    let renderBundle = bundleEnc.finish()

    // initialize performance metrics
    let debugDiv = document.getElementById('debug-div') as HTMLDivElement;
    let previousFrameTime = 0;
    let avgJsTimeMs = 0
    let avgFrameTimeMs = 0

    // controls for this demo
    const controlsStr = `controls: WASD, shift/c, mouse, spacebar`

    // our main game loop
    function renderFrame(timeMs: number) {
        // track performance metrics
        const start = performance.now();
        const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
        previousFrameTime = timeMs;

        // resize (if necessary)
        checkCanvasResize(device, canvasRef.width, canvasRef.height);
        // TODO(@darzu): integrate this with checkCanvasResize
        // TODO(@darzu): SCENE FORMAT
        // targetSize
        const sceneUniSizeOffset = bytesPerMat4 * 2 // camera and light projection
            + bytesPerVec3 * 1 // light pos
            + bytesPerFloat * 1 // time
        const sizeBuffer = new Float32Array(2);
        sizeBuffer[0] = canvasRef.width;
        sizeBuffer[1] = canvasRef.height;
        device.queue.writeBuffer(sceneUniBuffer, sceneUniSizeOffset, sizeBuffer);

        // process inputs and move the player & camera
        const playerSpeed = pressedKeys[' '] ? 1.0 : 0.2; // spacebar boosts speed
        if (pressedKeys['w']) moveZ(player.transform, -playerSpeed) // forward
        if (pressedKeys['s']) moveZ(player.transform, playerSpeed) // backward
        if (pressedKeys['a']) moveX(player.transform, -playerSpeed) // left
        if (pressedKeys['d']) moveX(player.transform, playerSpeed) // right
        if (pressedKeys['shift']) moveY(player.transform, playerSpeed) // up
        if (pressedKeys['c']) moveY(player.transform, -playerSpeed) // down
        const { x: mouseX, y: mouseY } = takeAccumulatedMouseMovement();
        yaw(player.transform, -mouseX * 0.01);
        pitch(cameraOffset, -mouseY * 0.01);

        // apply the players movement by writting to the model uniform buffer
        pool.updateUniform(player);

        // calculate and write our view and project matrices
        const viewLocMatrix = mat4.create()
        mat4.multiply(viewLocMatrix, viewLocMatrix, player.transform)
        mat4.multiply(viewLocMatrix, viewLocMatrix, cameraOffset)
        mat4.translate(viewLocMatrix, viewLocMatrix, [0, 0, 10]) // TODO(@darzu): can this be merged into the camera offset?
        const viewMatrix = mat4.invert(mat4.create(), viewLocMatrix);
        const projectionMatrix = mat4.perspective(mat4.create(), (2 * Math.PI) / 5, aspectRatio, 1, 10000.0/*view distance*/);
        const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix) as Float32Array
        device.queue.writeBuffer(sceneUniBuffer, 0, viewProj.buffer);

        // rotate the random cubes
        for (let i = 0; i < randomCubes.length; i++) {
            const m = randomCubes[i]
            const axis = randomCubesAxis[i]
            mat4.rotate(m.transform, m.transform, Math.PI * 0.01, axis);
            pool.updateUniform(m);
        }

        // update grass
        const playerPos = getPositionFromTransform(player.transform)
        grass.update(playerPos)

        // update scene data
        // TODO(@darzu): SCENE FORMAT
        const sceneUniTimeOffset = bytesPerMat4 * 2 // camera and light projection
            + bytesPerVec3 * 1 // light pos
        const timeBuffer = new Float32Array(1);
        timeBuffer[0] = timeMs;
        device.queue.writeBuffer(sceneUniBuffer, sceneUniTimeOffset, timeBuffer);
        const cameraPosOffset =
            bytesPerMat4 * 2 // camera and light projection
            + bytesPerVec3 * 1 // light pos
            + bytesPerFloat * 1 // time
            + bytesPerFloat * 2 // targetSize
        // const cameraPos = playerPos as Float32Array;
        // TODO(@darzu): is this the camera position? seems off in the shader...
        const cameraPos = getPositionFromTransform(viewLocMatrix) as Float32Array;
        device.queue.writeBuffer(sceneUniBuffer, cameraPosOffset, cameraPos);

        // update fullscreen scene data
        const fsUniTimeOffset = 0
        const fsTimeBuffer = new Float32Array(1);
        fsTimeBuffer[0] = timeMs;
        device.queue.writeBuffer(fsUniBuffer, fsUniTimeOffset, fsTimeBuffer);

        // start our rendering passes
        const commandEncoder = device.createCommandEncoder();

        // // do compute pass(es)
        // {
        //     const computePass = commandEncoder.beginComputePass();
        //     computePass.setPipeline(computePipeline);
        //     computePass.setBindGroup(0, computeBindGroup);
        //     computePass.dispatch(
        //         Math.ceil(computeTexWidth / computeGroupSize),
        //         Math.ceil(computeTexHeight / computeGroupSize)
        //     );
        //     computePass.endPass();
        // }
        // TODO(@darzu): render fullscreen pipeline
        const fsRenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: fsTextureView,
                loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
                storeOp: 'store',
            }],
        });
        fsRenderPassEncoder.executeBundles([fsBundle]);
        fsRenderPassEncoder.endPass();

        // render from the light's point of view to a depth buffer so we know where shadows are
        const shadowRenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
                view: shadowDepthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        });
        shadowRenderPassEncoder.executeBundles([shadowBundle]);
        shadowRenderPassEncoder.endPass();

        // render to the canvas' via our swap-chain
        const renderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: colorTextureView,
                resolveTarget: context.getCurrentTexture().createView(),
                loadValue: backgroundColor,
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: depthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        });
        renderPassEncoder.executeBundles([renderBundle]);
        renderPassEncoder.endPass();

        // submit render passes to GPU
        device.queue.submit([commandEncoder.finish()]);

        // calculate performance metrics as running, weighted averages across frames
        const jsTime = performance.now() - start;
        const avgWeight = 0.05
        avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
        avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs
        const avgFPS = 1000 / avgFrameTimeMs;
        debugDiv.innerText = controlsStr
            + `\n` + `(js per frame: ${avgJsTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)})`
    }
    return renderFrame;
}

// math utilities
export function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
    vec3.normalize(n, n)
    return n;
}

// matrix utilities
function pitch(m: mat4, rad: number) { return mat4.rotateX(m, m, rad); }
function yaw(m: mat4, rad: number) { return mat4.rotateY(m, m, rad); }
function roll(m: mat4, rad: number) { return mat4.rotateZ(m, m, rad); }
function moveX(m: mat4, n: number) { return mat4.translate(m, m, [n, 0, 0]); }
function moveY(m: mat4, n: number) { return mat4.translate(m, m, [0, n, 0]); }
function moveZ(m: mat4, n: number) { return mat4.translate(m, m, [0, 0, n]); }
export function getPositionFromTransform(t: mat4): vec3 {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos
}

async function main() {
    const start = performance.now();

    // attach to HTML canvas 
    let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    // resize the canvas when the window resizes
    function onWindowResize() {
        canvasRef.width = window.innerWidth;
        canvasRef.style.width = `${window.innerWidth}px`;
        canvasRef.height = window.innerHeight;
        canvasRef.style.height = `${window.innerHeight}px`;
    }
    window.onresize = function () {
        onWindowResize();
    }
    onWindowResize();

    // build our scene for the canvas
    const renderFrame = attachToCanvas(canvasRef, device);
    console.log(`JS init time: ${(performance.now() - start).toFixed(1)}ms`)

    // run our game loop using 'requestAnimationFrame`
    if (renderFrame) {
        const _renderFrame = (time: number) => {
            renderFrame(time);
            requestAnimationFrame(_renderFrame);
        }
        requestAnimationFrame(_renderFrame);
    }
}
await main()

/*
WATER

Approach:
    mesh defining surface of water
    different LODs of that mesh
    vertices displaced using displacement map
*/

interface WaterSystem {
    getMeshPools: () => MeshPool[],
}

function createWaterSystem(device: GPUDevice): WaterSystem {
    if (!ENABLE_WATER)
        return { getMeshPools: () => [] }

    const mapXSize = 100;
    const mapZSize = 100;
    const mapArea = mapXSize * mapZSize;

    const idx = (xi: number, zi: number) => zi * mapXSize + xi

    const map = new Float32Array(mapXSize * mapZSize);
    for (let x = 0; x < mapXSize; x++) {
        for (let z = 0; z < mapZSize; z++) {
            const i = idx(x, z)
            map[i] = 0; // Math.sin(x * 0.5) + Math.cos(z) // TODO(@darzu): 
            // map[i] = Math.random() * 2 + x * 0.02 + z * 0.04 - 10 // TODO(@darzu):
        }
    }

    const builder = createMeshPoolBuilder(device, {
        maxMeshes: 1,
        maxTris: mapArea * 2,
        maxVerts: mapArea * 2,
    })

    // const idx = (xi: number, zi: number) => clamp(zi, 0, mapZSize - 1) * mapXSize + clamp(xi, 0, mapXSize - 1)

    const color1: vec3 = [0.1, 0.3, 0.5]
    const color2: vec3 = color1
    // const color2: vec3 = [0.1, 0.5, 0.3]
    // const color: vec3 = [Math.random(), Math.random(), Math.random()]

    const spacing = 1.0;
    const maxHeight = 10.0; // TODO(@darzu): compute?

    for (let xi = 0; xi < mapXSize; xi++) {
        for (let zi = 0; zi < mapZSize; zi++) {

            let y = map[idx(xi, zi)];
            let yX0 = map[idx(xi - 1, zi)];
            let yX2 = map[idx(xi + 1, zi)];
            let yZ0 = map[idx(xi, zi - 1)];
            let yZ2 = map[idx(xi, zi + 1)];

            const x = xi * spacing;
            const z = zi * spacing;

            const p0: vec3 = [x, y, z]
            const p1: vec3 = [x - 1, yX0, z]
            const p2: vec3 = [x, yZ0, z - 1]

            const norm1 = computeTriangleNormal(p0, p2, p1);

            const p3: vec3 = [x + 1, yX2, z]
            const p4: vec3 = [x, yZ2, z + 1]

            const norm2 = computeTriangleNormal(p0, p4, p3);

            // TODO(@darzu): compute normal
            const kind = VertexKind.water;

            const vOff = builder.numVerts * vertByteSize;
            // builder.verticesMap.set(vertexData, vOff)
            setVertexData(builder.verticesMap, vOff, [x, y, z], color1, norm1, kind)
            setVertexData(builder.verticesMap, vOff + vertByteSize, [x, y, z], color2, norm2, kind)

            builder.numVerts += 2;
            // builder.numVerts += 1;

            // const vertexData = [
            //     ...[xi, y, zi], ...color, ...[0, 1, 0],
            //     ...[xi + 1, y, zi], ...color, ...[0, 1, 0],
            //     ...[xi, y, zi + 1], ...color, ...[0, 1, 0],
            // ]
            // const vOff = builder.numVerts * vertElStride;
            // builder.verticesMap.set(vertexData, vOff)

            // const iOff = builder.numTris * 3;
            // // builder.indicesMap.set([2, 1, 0], iOff)
            // builder.indicesMap.set([2 + builder.numVerts, 1 + builder.numVerts, 0 + builder.numVerts], iOff)

            // builder.numVerts += 3;
        }
    }

    for (let xi = 1; xi < mapXSize - 1; xi++) {
        for (let zi = 1; zi < mapZSize - 1; zi++) {
            let i0 = idx(xi, zi) * 2;
            let i1 = idx(xi - 1, zi) * 2;
            let i2 = idx(xi, zi - 1) * 2;

            builder.indicesMap.set([i0, i1, i2], builder.numTris * 3)
            builder.numTris += 1;

            let i3 = idx(xi, zi) * 2 + 1;
            let i4 = idx(xi + 1, zi) * 2 + 1;
            let i5 = idx(xi, zi + 1) * 2 + 1;

            builder.indicesMap.set([i3, i4, i5], builder.numTris * 3)
            builder.numTris += 1;
        }
    }

    const prevNumVerts = 0;
    const prevNumTris = 0;
    const waterMesh: MeshHandle = {
        vertNumOffset: prevNumVerts,
        indicesNumOffset: prevNumTris * 3,
        modelUniByteOffset: meshUniByteSizeAligned * builder.allMeshes.length,
        numTris: builder.numTris,

        // used and updated elsewhere
        transform: mat4.create(),
        modelMin: vec3.fromValues(0, 0, 0),
        modelMax: vec3.fromValues(mapXSize * spacing, maxHeight, mapZSize * spacing),

        pool: builder.poolHandle,
        // TODO(@darzu):
        // maxDraw: opts.maxBladeDraw,

        // TODO(@darzu): what're the implications of this?
        // shadowCaster: true,

        // not applicable
        // TODO(@darzu): make this optional?
        model: undefined,
    };
    console.dir(waterMesh)
    builder.allMeshes.push(waterMesh)

    // builder.addMesh(CUBE)

    const pool = builder.finish();

    // initial position
    mat4.translate(waterMesh.transform, waterMesh.transform, [-(mapXSize * spacing) * 0.5, -4, -(mapZSize * spacing) * 0.5])

    // TODO(@darzu): these could be done while the builder has mapped buffers
    pool.allMeshes.forEach(m => pool.updateUniform(m));
    // pool.allMeshes.forEach(m => meshApplyMinMaxPos(m));

    const water: WaterSystem = {
        getMeshPools: () => [pool]
    };

    return water;
}
