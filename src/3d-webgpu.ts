import { mat4, vec3, quat } from './ext/gl-matrix.js';
import { clamp } from './math.js';
import { createMeshMemoryPool, CUBE, mat4ByteSize, Mesh, MeshMemoryPoolOptions, MeshModel, PLANE, triByteSize } from './3d/mesh.js';
// import * as RAPIER from './ext/@dimforge/rapier3d/rapier.js';

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


const GRASS: MeshModel = {
    pos: [
        [+0.2, 0, 0],
        [-0.2, 0, 0],
        [0, 2, 0],
    ],
    tri: [
        [0, 1, 2],
        [2, 1, 0],
    ],
    colors: [
        [0.2, 0.6, 0.2],
        [0.2, 0.5, 0.2],
    ],
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

// const maxNumVerts = 1000;
// const maxNumTri = 1000;
// const maxNumModels = 100;


const sampleCount = 4;

interface Transformable {
    getTransform: () => mat4;
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

function mkEulerTransformable(): Transformable {
    // yaw with respect to absolute
    // pitch with respect to yaw
    // translate with respect to yaw and pitch

    let yaw: number = 0;
    let pitch: number = 0;
    let roll: number = 0;

    const rotation = quat.create();
    const position = vec3.create();

    return {
        getTransform: () => {
            // return mat4.clone(transform);
            // const rot = quat.fromEuler(quat.create(), radToDeg * pitch, radToDeg * yaw, radToDeg * roll)
            return mat4.fromRotationTranslation(mat4.create(), rotation, position);
        },
        pitch: (rad: number) => {
            pitch = clamp(pitch + rad, -Math.PI / 2, Math.PI / 2)
            quat.fromEuler(rotation, pitch, yaw, roll)
        },
        yaw: (rad: number) => {
            yaw += rad
            quat.fromEuler(rotation, pitch, yaw, roll)
        },
        roll: (rad: number) => {
            // roll = clamp(roll + rad, -Math.PI / 2, Math.PI / 2)
            // console.log(transform);
        },
        moveX: (n: number) => {
            vec3.add(position, position, vec3.transformQuat(vec3.create(), [n, 0, 0], rotation))
        },
        moveY: (n: number) => {
            vec3.add(position, position, vec3.transformQuat(vec3.create(), [0, n, 0], rotation))
        },
        moveZ: (n: number) => {
            vec3.add(position, position, vec3.transformQuat(vec3.create(), [0, 0, n], rotation))
        },
    }
}

// TODO(@darzu): add meshes back
// {
//     // TODO(@darzu): add meshes!
//     meshes.push(addMesh(PLANE))
//     meshes.push(addMesh(CUBE))
//     meshes.push(addMesh(CUBE))
//     meshes.push(addMesh(CUBE))
//     meshes.push(addMesh(CUBE))
//     meshes.push(addMesh(CUBE))
//     meshes.push(addMesh(GRASS))
// }

async function init(canvasRef: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    if (!canvasRef === null) return;
    const context = canvasRef.getContext('gpupresent')!;

    // TODO(@darzu): physics?
    // console.dir(RAPIER)

    // canvas.requestFullscreen({
    //     navigationUI: "hide"
    // })
    let cursorLocked = false
    canvas.onclick = (ev) => {
        if (!cursorLocked)
            canvas.requestPointerLock();
        cursorLocked = true
    }

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
    // TODO(@darzu): handle this in the mesh pool ?
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

    const vertElStride = (3/*pos*/ + 3/*color*/)
    const defaultMeshPoolOpts: MeshMemoryPoolOptions = {
        vertByteSize: Float32Array.BYTES_PER_ELEMENT * vertElStride,
        maxVerts: 1000,
        maxTris: 1000,
        maxMeshes: 100,
        meshUniByteSize: Math.ceil(mat4ByteSize / 256) * 256, // align to 256,
    }

    const meshPool = createMeshMemoryPool(defaultMeshPoolOpts, device);

    const pipeline = device.createRenderPipeline({
        vertex: {
            module: device.createShaderModule({
                code: basicVertWGSL,
            }),
            entryPoint: 'main',
            buffers: [
                {
                    // TODO(@darzu): the buffer index should be connected to the pool probably?
                    arrayStride: defaultMeshPoolOpts.vertByteSize,
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

    meshPool.doUpdate(pipeline, [
        PLANE,
        CUBE,
        CUBE,
        CUBE,
        CUBE,
        CUBE,
        GRASS,
    ])

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

    const cameraPos = mkAffineTransformable();
    // cameraPos.yaw(Math.PI)
    cameraPos.pitch(-Math.PI / 4)
    // cameraPos.moveZ(40)
    // cameraPos.moveY(5)
    // cameraPos.moveX(5)
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

    function controlPlayer(t: Transformable) {
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
            // t.roll(0.1)
        if (pressedKeys['e'])
            // t.roll(-0.1)
        if (pressedKeys['r']) {
            // TODO(@darzu): 
        }
        // mouse
        if (mouseDeltaX !== 0)
            t.yaw(-mouseDeltaX * 0.01);
        // if (mouseDeltaY !== 0)
        //     t.pitch(-mouseDeltaY * 0.01);
    }

    function cameraFollow(camera: Transformable, player: Transformable) {
        if (mouseDeltaY !== 0)
            camera.pitch(-mouseDeltaY * 0.01);
    }

    const playerM = meshPool._meshes[4]
    const playerT = mkAffineTransformable();
    playerM.transform = playerT.getTransform();
    meshPool.applyMeshTransform(playerM)

    function frame(time: number) {
        // Sample is no longer the active page.
        if (!canvasRef) return;

        // update model positions
        // TODO(@darzu): real movement
        mat4.translate(meshPool._meshes[1].transform, meshPool._meshes[1].transform, [0.1, 0, 0])
        meshPool.applyMeshTransform(meshPool._meshes[1])
        mat4.translate(meshPool._meshes[2].transform, meshPool._meshes[2].transform, [0.0, 0.2, 0])
        meshPool.applyMeshTransform(meshPool._meshes[2])
        mat4.translate(meshPool._meshes[3].transform, meshPool._meshes[3].transform, [0.0, 0, 0.3])
        meshPool.applyMeshTransform(meshPool._meshes[3])

        // controlTransformable(cameraPos);
        controlPlayer(playerT);
        cameraFollow(cameraPos, playerT);
        // controlTransformable(m2t);

        playerM.transform = playerT.getTransform();
        meshPool.applyMeshTransform(playerM)

        // reset accummulated mouse delta
        mouseDeltaX = 0;
        mouseDeltaY = 0;

        function getViewProj() {
            const viewProj = mat4.create();
            const cam = cameraPos.getTransform()
            const player = playerT.getTransform()

            const viewMatrix = mat4.create()
            mat4.multiply(viewMatrix, viewMatrix, player)
            mat4.multiply(viewMatrix, viewMatrix, cam)
            mat4.translate(viewMatrix, viewMatrix, [0, 0, 10])

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
        passEncoder.setVertexBuffer(0, meshPool._vertBuffer);
        passEncoder.setVertexBuffer(1, instanceDataBuffer);
        passEncoder.setIndexBuffer(meshPool._indexBuffer, 'uint16');
        // TODO(@darzu): one draw call per mesh?
        for (let m of meshPool._meshes) {
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