import { mat4, vec3, quat } from './ext/gl-matrix.js';
import { clamp } from './math.js';

/*
TODO:
    I want some data per:
        Model (e.g. transform)
        Face/Triangle (e.g. color, material, normal)
        Vertex (e.g. ???)

    Face painting:
        color per defining vertex would be ideal
        could do uniform buffer data
        how to do the painting?
        pick out face color in vertex shader and pass to fragment
            How do we know which face? We need that prominent vertex thing...
    Refactor into seperate files
        Kill babylonjs?
*/

// TODO(@darzu): expand faces to have unique vertices

// face normals vs vertex normals
interface MeshModel {
    // vertex positions (x,y,z)
    pos: vec3[];
    // triangles (vert indices, ccw)
    tri: vec3[];
    // colors per triangle in r,g,b float [0-1] format
    colors: vec3[];
}

// TODO(@darzu): this shouldn't be needed once "flat" shading is supported in Chrome's WGSL, 
//  and/or PrimativeID is supported https://github.com/gpuweb/gpuweb/issues/1786
function unshareVertices(inp: MeshModel): MeshModel {
    // TODO(@darzu): pre-alloc
    const outVerts: vec3[] = []
    const outTri: vec3[] = []
    inp.tri.forEach(([i0, i1, i2], i) => {
        const v0 = inp.pos[i0];
        const v1 = inp.pos[i1];
        const v2 = inp.pos[i2];
        outVerts.push(v0);
        outVerts.push(v1);
        outVerts.push(v2);
        const vOff = i * 3;
        outTri.push([
            vOff + 0,
            vOff + 1,
            vOff + 2,
        ])
    })
    return {
        pos: outVerts,
        tri: outTri,
        colors: inp.colors,
    }
}
interface ExpandedMesh extends MeshModel {
    // face normals, per triangle
    fnorm: vec3[];
}

const CUBE: MeshModel = {
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
        // front
        [0, 1, 2],
        [0, 2, 3],
        // top
        [4, 5, 1],
        [4, 1, 0],
        // right
        [3, 4, 0],
        [3, 7, 4],
        // left
        [2, 1, 5],
        [2, 5, 6],
        // bottom
        [6, 3, 2],
        [6, 7, 3],
        // back
        [5, 4, 7],
        [5, 7, 6],
    ],
    colors: [
        // front
        [0.5, 0.0, 0.0],
        [0.5, 0.0, 0.0],
        // top
        [0.0, 0.5, 0.0],
        [0.0, 0.5, 0.0],
        // right
        [0.0, 0.0, 0.5],
        [0.0, 0.0, 0.5],
        // left
        [0.5, 0.5, 0.0],
        [0.5, 0.5, 0.0],
        // bottom
        [0.0, 0.5, 0.5],
        [0.0, 0.5, 0.5],
        // back
        [0.5, 0.0, 0.5],
        [0.5, 0.0, 0.5],
    ]
}

const PLANE: MeshModel = {
    pos: [
        [+10, 0, +10],
        [-10, 0, +10],
        [+10, 0, -10],
        [-10, 0, -10],
    ],
    tri: [
        // top
        [0, 2, 3],
        [0, 3, 1],
        // bottom
        [3, 2, 0],
        [1, 3, 0],
    ],
    colors: [
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
    ],
}

function computeNormal([p1, p2, p3]: [vec3, vec3, vec3]): vec3 {
    // https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    // cross product of two edges
    // edge 1
    const u: vec3 = [0, 0, 0]
    vec3.sub(u, p2, p1)
    // edge 2
    const v: vec3 = [0, 0, 0]
    vec3.sub(v, p3, p1)
    // cross
    const n: vec3 = [0, 0, 0]
    vec3.cross(n, u, v)

    vec3.normalize(n, n)

    return n;
}
function computeNormals(m: MeshModel): vec3[] {
    const triPoses = m.tri.map(([i0, i1, i2]) => [m.pos[i0], m.pos[i1], m.pos[i2]] as [vec3, vec3, vec3])
    return triPoses.map(computeNormal)
}

// TODO: canvas ref
// TODO: navigator.gpu typings
//          @webgpu/types
// TODO: frag_depth
const vertexPositionColorWGSL =
`
[[stage(fragment)]]
fn main(
    [[location(0)]] modelPos: vec4<f32>,
    [[location(1)]] color: vec3<f32>
    ) -> [[location(0)]] vec4<f32> {
    var xTan: vec3<f32> = dpdx(modelPos).xyz;
    var yTan: vec3<f32> = dpdy(modelPos).xyz;
    var norm: vec3<f32> = normalize(cross(xTan, yTan));

    var lDirection: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var lColor: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var ambient: vec4<f32> = vec4<f32>(color, 1.0); // vec4<f32>(0.0, 0.2, 0.2, 0.2);

    var diffuse: vec4<f32> = vec4<f32>(max(dot(lDirection, -norm), 0.0) * lColor, 1.0);

    return ambient + diffuse;
    // return vec4<f32>(norm, 1.0);
}
`;

const basicVertWGSL =
`
[[block]] struct SharedUnis {
    viewProj : mat4x4<f32>;
};
[[binding(0), group(0)]] var<uniform> sharedUnis : SharedUnis;
[[block]] struct ModelUnis {
    model : mat4x4<f32>;
};
[[binding(0), group(1)]] var<uniform> modelUnis : ModelUnis;

struct VertexOutput {
    [[builtin(position)]] pos : vec4<f32>;
    [[location(0)]] modelPos: vec4<f32>;
    [[location(1)]] color: vec3<f32>;
};

[[stage(vertex)]]
fn main(
    [[location(0)]] position : vec3<f32>,
    [[location(1)]] color : vec3<f32>,
    [[location(2)]] color2 : vec3<f32>
    ) -> VertexOutput {
    var output : VertexOutput;
    var pos4: vec4<f32> = vec4<f32>(position, 1.0);
    output.pos =  sharedUnis.viewProj * modelUnis.model * pos4;
    // output.color = vec4<f32>(normal, 1.0);
    // output.color = 0.5 * (pos4 + vec4<f32>(1.0, 1.0, 1.0, 1.0));
    // output.modelPos = sharedUnis.viewProj * pos4;
    output.modelPos = sharedUnis.viewProj * pos4;
    // output.color = color2;
    // output.color = vec3<f32>(0.2, 0.5, 0.4);
    output.color = color;

    return output;
}
`;

const shadowDepthTextureSize = 1024;

const maxNumVerts = 1000;
const maxNumTri = 1000;
const maxNumModels = 100;

const vertElStride = (3/*pos*/ + 3/*color*/)
const vertByteSize = Float32Array.BYTES_PER_ELEMENT * vertElStride
const triElStride = 3/*ind per tri*/;
const triByteSize = Uint16Array.BYTES_PER_ELEMENT * triElStride;

const mat4ByteSize = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const modelUniByteSize = Math.ceil(mat4ByteSize / 256) * 256; // align to 256

// space stats
console.log(`Pre-alloc ${maxNumVerts * vertByteSize / 1024} KB for verts`);
console.log(`Pre-alloc ${maxNumTri * triByteSize / 1024} KB for indices`);
console.log(`Pre-alloc ${maxNumModels * modelUniByteSize / 1024} KB for models`);
const unusedBytesPerModel = 256 - mat4ByteSize % 256
console.log(`Unused ${unusedBytesPerModel} bytes in uniform buffer per model (${unusedBytesPerModel * maxNumModels / 1024} KB total)`);

/*
Adds mesh vertices and indices into buffers. Optionally shifts triangle indicies.
*/
function addMeshToBuffers(m: MeshModel, verts: Float32Array, prevNumVerts: number, indices: Uint16Array, prevNumTri: number, shiftIndices = false): void {
    const norms = computeNormals(m);
    m.pos.forEach((v, i) => {
        const off = (prevNumVerts + i) * vertElStride
        // position
        verts[off + 0] = v[0]
        verts[off + 1] = v[1]
        verts[off + 2] = v[2]
    })
    const vOff = prevNumVerts * vertElStride
    m.tri.forEach((t, i) => {
        const iOff = (prevNumTri + i) * triElStride
        const indShift = shiftIndices ? prevNumVerts : 0;
        const vi0 = t[0] + indShift
        const vi1 = t[1] + indShift
        const vi2 = t[2] + indShift
        indices[iOff + 0] = vi0
        indices[iOff + 1] = vi1
        indices[iOff + 2] = vi2
        // set per-face data
        // color
        const [r, g, b] = m.colors[i]
        verts[vOff + vi0 * vertElStride + 3] = r
        verts[vOff + vi0 * vertElStride + 4] = g
        verts[vOff + vi0 * vertElStride + 5] = b
        verts[vOff + vi1 * vertElStride + 3] = r
        verts[vOff + vi1 * vertElStride + 4] = g
        verts[vOff + vi1 * vertElStride + 5] = b
        verts[vOff + vi2 * vertElStride + 3] = r
        verts[vOff + vi2 * vertElStride + 4] = g
        verts[vOff + vi2 * vertElStride + 5] = b
        // TODO(@darzu): normals needed?
    })
}
interface Mesh {
    vertNumOffset: number,
    indicesNumOffset: number,
    modelUniByteOffset: number,
    transform: mat4;
    model: MeshModel,
    binding: GPUBindGroup,
}

const sampleCount = 4;

interface Transformable {
    getTransform: () => mat4;
    lookAt: (target: vec3) => void;
    pitch: (rad: number) => void;
    yaw: (rad: number) => void;
    roll: (rad: number) => void;
    moveX: (n: number) => void;
    moveY: (n: number) => void;
    moveZ: (n: number) => void;
}

function mkAffineTransformable(): Transformable {
    const transform = mat4.create();
    return {
        getTransform: () => {
            return mat4.clone(transform);
        },
        lookAt: (target: vec3) => {
            // TODO(@darzu): dz
        },
        pitch: (rad: number) => {
            mat4.rotateX(transform, transform, rad)
        },
        yaw: (rad: number) => {
            mat4.rotateY(transform, transform, rad)
        },
        roll: (rad: number) => {
            mat4.rotateZ(transform, transform, rad)
        },
        moveX: (n: number) => {
            mat4.translate(transform, transform, [n, 0, 0]);
        },
        moveY: (n: number) => {
            mat4.translate(transform, transform, [0, n, 0]);
        },
        moveZ: (n: number) => {
            mat4.translate(transform, transform, [0, 0, n]);
        },
    }
}

function mkQuatTransformable(): Transformable {
    const rotation: quat = quat.create();
    const position: vec3 = vec3.create();
    return {
        getTransform: () => {
            return mat4.fromRotationTranslation(mat4.create(), rotation, position);
        },
        lookAt: (target: vec3) => {
            // TODO(@darzu): dz
        },
        pitch: (rad: number) => {
            quat.rotateX(rotation, rotation, rad);
        },
        yaw: (rad: number) => {
            quat.rotateY(rotation, rotation, rad);
        },
        roll: (rad: number) => {
            quat.rotateZ(rotation, rotation, rad);
        },
        moveX: (n: number) => {
            position[0] += n;
        },
        moveY: (n: number) => {
            position[1] += n;
        },
        moveZ: (n: number) => {
            position[2] += n;
        },
    }
}

const radToDeg = 180 / Math.PI;


function mkEulerTransformable(): Transformable {
    const position: vec3 = vec3.create();
    let yaw: number = 0;
    let pitch: number = 0;
    let roll: number = 0;
    return {
        getTransform: () => {
            const rot = quat.fromEuler(quat.create(), radToDeg * pitch, radToDeg * yaw, radToDeg * roll)
            return mat4.fromRotationTranslation(mat4.create(), rot, position);
        },
        lookAt: (target: vec3) => {
            // TODO(@darzu): dz
        },
        pitch: (rad: number) => {
            pitch = clamp(pitch + rad, -Math.PI / 2, Math.PI / 2)
        },
        yaw: (rad: number) => {
            yaw += rad
        },
        roll: (rad: number) => {
            // roll = clamp(roll + rad, -Math.PI / 2, Math.PI / 2)
        },
        moveX: (n: number) => {
            position[0] += n;
        },
        moveY: (n: number) => {
            position[1] += n;
        },
        moveZ: (n: number) => {
            position[2] += n;
        },
    }
}

async function init(canvasRef: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    if (!canvasRef === null) return;
    const context = canvasRef.getContext('gpupresent')!;

    const swapChainFormat = 'bgra8unorm';

    const swapChain = context.configureSwapChain({
        device,
        format: swapChainFormat,
    });

    /*
    tracking meshes:
        add to vertex & index buffers
            add current vertex count to as triangle offset
        resize buffers if needed
            nahh.. fixed size, max count
        track current number of vertices

    */
    let numVerts = 0;
    let numTris = 0;

    const verticesBuffer = device.createBuffer({
        size: maxNumVerts * vertByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });

    const indexBuffer = device.createBuffer({
        size: maxNumTri * triByteSize,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });

    const modelUniBufferSize = mat4ByteSize * maxNumModels;
    const modelUniBuffer = device.createBuffer({
        size: modelUniBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // GPUDepthStencilStateDescriptor

    // Create the depth texture for rendering/sampling the shadow map.
    const shadowDepthTextureDesc: GPUTextureDescriptor = {
        size: {
            width: shadowDepthTextureSize,
            height: shadowDepthTextureSize,
            // TODO(@darzu): deprecated
            // depth: 1,
        },
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
        format: 'depth32float',
    }
    const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
    const shadowDepthTextureView = shadowDepthTexture.createView();

    // // Create some common descriptors used for both the shadow pipeline
    // // and the color rendering pipeline.
    // const vertexBuffers: Iterable<GPUVertexBufferLayout> = [
    //     {
    //     arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
    //     attributes: [
    //         {
    //         // position
    //         shaderLocation: 0,
    //         offset: 0,
    //         format: 'float32x3',
    //         },
    //         {
    //         // normal
    //         shaderLocation: 1,
    //         offset: Float32Array.BYTES_PER_ELEMENT * 3,
    //         format: 'float32x3',
    //         },
    //     ],
    //     },
    // ];

    // TODO(@darzu): createBindGroupLayout

    // TODO(@darzu): trying per-face data, but this actually ended up being "per instance" data
    const maxNumInstances = 1000;
    const instanceByteSize = Float32Array.BYTES_PER_ELEMENT * 3/*color*/
    const instanceDataBuffer = device.createBuffer({
        size: maxNumInstances * instanceByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    {
        const instMap = new Float32Array(instanceDataBuffer.getMappedRange())
        for (let i = 0; i < maxNumInstances; i++) {
            const off = i * instanceByteSize
            // TODO(@darzu): colors
            instMap[off + 0] = Math.random()
            instMap[off + 1] = Math.random()
            instMap[off + 2] = Math.random()
        }
        instanceDataBuffer.unmap();
    }

    const pipeline = device.createRenderPipeline({
        vertex: {
            module: device.createShaderModule({
                code: basicVertWGSL,
            }),
            entryPoint: 'main',
            buffers: [
                {
                    arrayStride: vertByteSize,
                    attributes: [
                        {
                            // position
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3',
                        },
                        {
                            // color
                            shaderLocation: 1,
                            offset: 4 * 3,
                            format: 'float32x3',
                        },
                        // {
                        //     // normals
                        //     shaderLocation: 1,
                        //     offset: 0,
                        //     format: 'float32x3',
                        // },
                        // {
                        //     // uv
                        //     shaderLocation: 1,
                        //     offset: cubeUVOffset,
                        //     format: 'float32x2',
                        // },
                    ],
                },
                {
                    // per-instance data
                    stepMode: "instance",
                    arrayStride: instanceByteSize,
                    attributes: [
                        {
                            // color
                            shaderLocation: 2,
                            offset: 0,
                            format: 'float32x3',
                        },
                    ],
                },
            ],
        },
        fragment: {
            module: device.createShaderModule({
                code: vertexPositionColorWGSL,
            }),
            entryPoint: 'main',
            targets: [
                {
                    format: swapChainFormat,
                },
            ],
        },
        primitive: {
            topology: 'triangle-list',

            // Backface culling since the cube is solid piece of geometry.
            // Faces pointing away from the camera will be occluded by faces
            // pointing toward the camera.
            cullMode: 'back',
            // frontFace: 'ccw', // TODO(dz):
        },

        // Enable depth testing so that the fragment closest to the camera
        // is rendered in front.
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        },
        multisample: {
            count: sampleCount,
        },
    });

    const depthTexture = device.createTexture({
        size: { width: canvasRef.width, height: canvasRef.width },
        format: 'depth24plus',
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const sharedUniBufferSize = 4 * 16; // 4x4 matrix
    const sharedUniBuffer = device.createBuffer({
        size: sharedUniBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sharedUniBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: sharedUniBuffer,
                },
            },
        ],
    });

    // Declare swapchain image handles
    let colorTexture: GPUTexture = device.createTexture({
        size: {
            width: canvasRef.width,
            height: canvasRef.height,
        },
        sampleCount,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });;
    let colorTextureView: GPUTextureView = colorTexture.createView();

    const colorAtt: GPURenderPassColorAttachmentNew = {
        view: colorTextureView,
        resolveTarget: swapChain.getCurrentTexture().createView(),
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        storeOp: 'store',
    };
    const renderPassDescriptor = {
        colorAttachments: [colorAtt],
        depthStencilAttachment: {
            view: depthTexture.createView(),

            depthLoadValue: 1.0,
            depthStoreOp: 'store',
            stencilLoadValue: 0,
            stencilStoreOp: 'store',
        },
    } as const;

    const meshes: Mesh[] = []
    {
        const vertsMap = new Float32Array(verticesBuffer.getMappedRange())
        const indMap = new Uint16Array(indexBuffer.getMappedRange());

        function addMesh(m: MeshModel): Mesh {
            // TODO(@darzu): temporary
            m = unshareVertices(m);

            if (numVerts + m.pos.length > maxNumVerts)
                throw "Too many vertices!"
            if (numTris + m.tri.length > maxNumTri)
                throw "Too many triangles!"

            // add to vertex and index buffers
            addMeshToBuffers(m, vertsMap, numVerts, indMap, numTris, false);

            // create transformation matrix
            // TODO(@darzu): real transforms
            const trans = mat4.create() as Float32Array;
            mat4.translate(trans, trans, vec3.fromValues(
                4 * meshes.length, // TODO
                0, 0));

            // save the transform matrix to the buffer
            const uniOffset = meshes.length * modelUniByteSize;
            device.queue.writeBuffer(
                modelUniBuffer,
                uniOffset,
                trans.buffer,
                trans.byteOffset,
                trans.byteLength
            );

            // creating binding group
            const modelUniBindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: modelUniBuffer,
                            offset: uniOffset, // TODO(@darzu): different offsets per model
                        },
                    },
                ],
            });

            // create the result
            const res: Mesh = {
                vertNumOffset: numVerts, // TODO(@darzu): 
                indicesNumOffset: numTris * 3, // TODO(@darzu): 
                modelUniByteOffset: uniOffset,
                transform: trans,
                model: m,
                binding: modelUniBindGroup,
            }
            numVerts += m.pos.length;
            numTris += m.tri.length;
            return res;
        }

        {
            // TODO(@darzu): add meshes!
            meshes.push(addMesh(PLANE))
            meshes.push(addMesh(CUBE))
            meshes.push(addMesh(CUBE))
            meshes.push(addMesh(CUBE))
            meshes.push(addMesh(CUBE))
            meshes.push(addMesh(CUBE))
        }

        indexBuffer.unmap();
        verticesBuffer.unmap();
    }


    const aspect = Math.abs(canvasRef.width / canvasRef.height);
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

    function getTransformationMatrix() {
        const viewMatrix = mat4.create();
        const now = Date.now() / 1000;
        const yaw = Math.sin(now);
        const pitch = Math.cos(now);
        mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -40));
        mat4.rotate(
            viewMatrix,
            viewMatrix,
            1,
            vec3.fromValues(yaw, pitch, 0)
        );

        const viewProj = mat4.create();
        mat4.multiply(viewProj, projectionMatrix, viewMatrix);

        return viewProj as Float32Array;
    }

    function applyMeshTransform(m: Mesh) {
        // save the transform matrix to the buffer
        device.queue.writeBuffer(
            modelUniBuffer,
            m.modelUniByteOffset,
            (m.transform as Float32Array).buffer,
            (m.transform as Float32Array).byteOffset,
            (m.transform as Float32Array).byteLength
        );
    }

    const cameraPos = mkEulerTransformable();
    // cameraPos.yaw(Math.PI)
    cameraPos.moveZ(40)
    cameraPos.moveY(5)
    cameraPos.moveX(5)
    // // cameraPos.lookAt([0, 0, 0])

    // console.log(cameraPos.getTransform())

    // register key stuff
    window.addEventListener('keydown', function (event: KeyboardEvent) {
        onKeyDown(event);
    }, false);
    window.addEventListener('keyup', function (event: KeyboardEvent) {
        onKeyUp(event);
    }, false);
    window.addEventListener('mousemove', function (event: MouseEvent) {
        onmousemove(event);
    }, false);

    const pressedKeys: { [keycode: string]: boolean } = {}
    function onKeyDown(ev: KeyboardEvent) {
        const k = ev.key.toLowerCase();
        if (pressedKeys[k] === undefined)
            console.log(`new key: ${k}`)
        pressedKeys[k] = true
    }
    function onKeyUp(ev: KeyboardEvent) {
        pressedKeys[ev.key.toLowerCase()] = false
    }
    let mouseDeltaX = 0;
    let mouseDeltaY = 0;
    function onmousemove(ev: MouseEvent) {
        mouseDeltaX += ev.movementX
        mouseDeltaY += ev.movementY
    }

    function scaleTranslate(out: mat4, a: mat4, s: vec3): mat4 {
        out[12] = a[12] * s[0]
        out[13] = a[13] * s[1]
        out[14] = a[14] * s[2]
        return out;
    }

    function controlTransformable(t: Transformable) {
        // keys
        if (pressedKeys['w'])
            t.moveZ(-1)
        if (pressedKeys['s'])
            t.moveZ(1)
        if (pressedKeys['a'])
            t.moveX(-1)
        if (pressedKeys['d'])
            t.moveX(1)
        if (pressedKeys['shift'])
            t.moveY(1)
        if (pressedKeys['c'])
            t.moveY(-1)
        if (pressedKeys['q'])
            t.roll(0.1)
        if (pressedKeys['e'])
            t.roll(-0.1)
        if (pressedKeys['r']) {
            // TODO(@darzu): 
        }
        // mouse
        if (mouseDeltaX !== 0)
            t.yaw(-mouseDeltaX * 0.01);
        if (mouseDeltaY !== 0)
            t.pitch(-mouseDeltaY * 0.01);
    }

    const m2 = meshes[4]
    const m2t = mkAffineTransformable();
    m2.transform = m2t.getTransform();
    applyMeshTransform(m2)

    function frame(time: number) {
        // Sample is no longer the active page.
        if (!canvasRef) return;

        // update model positions
        // TODO(@darzu): real movement
        mat4.translate(meshes[1].transform, meshes[1].transform, [0.1, 0, 0])
        applyMeshTransform(meshes[1])
        mat4.translate(meshes[2].transform, meshes[2].transform, [0.0, 0.2, 0])
        applyMeshTransform(meshes[2])
        mat4.translate(meshes[3].transform, meshes[3].transform, [0.0, 0, 0.3])
        applyMeshTransform(meshes[3])

        controlTransformable(cameraPos);
        // controlTransformable(m2t);

        m2.transform = m2t.getTransform();
        applyMeshTransform(m2)

        // reset accummulated mouse delta
        mouseDeltaX = 0;
        mouseDeltaY = 0;

        function getViewProj() {
            const viewProj = mat4.create();
            const viewMatrix = cameraPos.getTransform()

            mat4.invert(viewMatrix, viewMatrix);

            mat4.multiply(viewProj, projectionMatrix, viewMatrix);
            return viewProj as Float32Array;
        }

        const transformationMatrix = getViewProj();
        // const transformationMatrix = getTransformationMatrix();
        // console.dir(transformationMatrix)
        device.queue.writeBuffer(
            sharedUniBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
        );


        // Acquire next image from swapchain
        colorTexture = swapChain.getCurrentTexture();
        colorTextureView = colorTexture.createView();
        renderPassDescriptor.colorAttachments[0].resolveTarget = colorTextureView;

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, sharedUniBindGroup);
        passEncoder.setVertexBuffer(0, verticesBuffer);
        passEncoder.setVertexBuffer(1, instanceDataBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        // TODO(@darzu): one draw call per mesh?
        for (let m of meshes) {
            // TODO(@darzu): set bind group
            passEncoder.setBindGroup(1, m.binding);
            passEncoder.drawIndexed(m.model.tri.length * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        }
        // passEncoder.drawIndexed(numTris * 3);
        // passEncoder.draw(CUBE.pos.length, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
};

// Attach to html
let canvas = document.getElementById('my_Canvas') as HTMLCanvasElement;
await init(canvas)

// TODO: vertex, index, normals
// {
//     // Create the model vertex buffer.
//     const vertexBuffer = device.createBuffer({
//         size: mesh.positions.length * 3 * 2 * Float32Array.BYTES_PER_ELEMENT,
//         usage: GPUBufferUsage.VERTEX,
//         mappedAtCreation: true,
//     });
//     {
//         const mapping = new Float32Array(vertexBuffer.getMappedRange());
//         for (let i = 0; i < mesh.positions.length; ++i) {
//         mapping.set(mesh.positions[i], 6 * i);
//         mapping.set(mesh.normals[i], 6 * i + 3);
//         }
//         vertexBuffer.unmap();
//     }