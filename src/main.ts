import { mat4, vec3 } from './gl-matrix.js';

// Defines shaders in WGSL for the shadow and regular rendering pipelines. Likely you'll want
// these in external files but they've been inlined for redistribution convenience.
const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
    };
`;
const vertexShader = shaderSceneStruct + `
    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
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
const fragmentShader = shaderSceneStruct + `
    [[group(0), binding(0)]] var<uniform> scene : Scene;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
    };

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// useful constants
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const vertsPerTri = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * vertsPerTri;
const linesPerTri = 6;
const bytesPerWireTri = Uint16Array.BYTES_PER_ELEMENT * linesPerTri;

// render pipeline parameters
const antiAliasSampleCount = 4;
let presentationFormat: GPUTextureFormat = 'bgra8unorm';
const depthStencilFormat = 'depth24plus-stencil8';
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
function checkCanvasResize(device: GPUDevice, context: GPUPresentationContext, canvasWidth: number, canvasHeight: number) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const newWidth = canvasWidth * devicePixelRatio;
    const newHeight = canvasHeight * devicePixelRatio;
    if (lastWidth === newWidth && lastHeight === newHeight)
        return;

    if (depthTexture) depthTexture.destroy();
    if (colorTexture) colorTexture.destroy();

    const newSize = [newWidth, newHeight] as const;

    context.configure({
        device: device,
        format: presentationFormat,
        size: newSize,
    });

    depthTexture = device.createTexture({
        size: newSize,
        format: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthTextureView = depthTexture.createView();

    colorTexture = device.createTexture({
        size: newSize,
        sampleCount: antiAliasSampleCount,
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    colorTextureView = colorTexture.createView();

    lastWidth = newWidth;
    lastHeight = newHeight;

    aspectRatio = Math.abs(newWidth / newHeight);
}

// defines the geometry and coloring of a mesh
interface Mesh {
    pos: vec3[];
    tri: vec3[];
    colors: vec3[];  // colors per triangle in r,g,b float [0-1] format
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
    return { ...input, pos, tri }
}

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need
// to track offsets into those buffers so we can make modifications and form draw calls.
interface MeshHandle {
    // handles into the buffers
    vertNumOffset: number,
    triIndicesNumOffset: number,
    modelUniByteOffset: number,
    triCount: number,
    // data
    transform: mat4,
    model: Mesh,
}

// define our meshes (ideally these would be imported from a standard format)
const CUBE: Mesh = unshareProvokingVertices({
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
    ]
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

// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
const vertexDataFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' }, // normals
];
// these help us pack and use vertices in that format
const vertElStride = (3/*pos*/ + 3/*color*/ + 3/*normal*/)
const vertByteSize = bytesPerFloat * vertElStride;

// define the format of our models' uniform buffer
const meshUniByteSizeExact =
    bytesPerMat4 // transform
    + bytesPerFloat // max draw distance;
const meshUniByteSizeAligned = align(meshUniByteSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the format of our scene's uniform data
const sceneUniBufferSizeExact =
    bytesPerMat4 * 2 // camera and light projection
    + bytesPerVec3 * 1 // light pos
const sceneUniBufferSizeAligned = align(sceneUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the limits of our vertex, index, and uniform buffers
const maxMeshes = 100;
const maxTris = maxMeshes * 100;
const maxVerts = maxTris * vertsPerTri;

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
function attachToCanvas(canvasRef: HTMLCanvasElement, device: GPUDevice, context: GPUPresentationContext): RenderFrameFn {
    // log our estimated space usage stats
    console.log(`Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`);
    console.log(`   ${(maxVerts * vertByteSize / 1024).toFixed(1)} KB for verts`);
    console.log(`   ${(maxTris * bytesPerTri / 1024).toFixed(1)} KB for indices`);
    console.log(`   ${(maxMeshes * meshUniByteSizeAligned / 1024).toFixed(1)} KB for other object data`);
    const unusedBytesPerModel = 256 - meshUniByteSizeExact % 256
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(unusedBytesPerModel * maxMeshes / 1024).toFixed(1)} KB total waste)`);
    const totalReservedBytes = maxVerts * vertByteSize + maxTris * bytesPerTri + maxMeshes * meshUniByteSizeAligned;
    console.log(`Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(1)} KB`);

    // create our mesh buffers (vertex, index, uniform)
    const verticesBuffer = device.createBuffer({
        size: maxVerts * vertByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    const triIndicesBuffer = device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });
    const lineIndicesBuffer = device.createBuffer({
        size: maxTris * bytesPerWireTri,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });
    const _meshUniBuffer = device.createBuffer({
        size: meshUniByteSizeAligned * maxMeshes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // create our scene's uniform buffer
    const sceneUniBuffer = device.createBuffer({
        size: sceneUniBufferSizeAligned,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // utilities for the device queue
    function gpuBufferWriteMeshTransform(m: MeshHandle) {
        device.queue.writeBuffer(_meshUniBuffer, m.modelUniByteOffset, (m.transform as Float32Array).buffer);
    }

    // let's create meshes for our scene and store their data in the vertex, index, and uniform buffers
    let ground: MeshHandle;
    let player: MeshHandle;
    let randomCubes: MeshHandle[] = [];
    const allMeshHandles: MeshHandle[] = [];
    {
        // to modify buffers, we need to map them into JS space; we'll need to unmap later
        let verticesMap = new Float32Array(verticesBuffer.getMappedRange())
        let triIndicesMap = new Uint16Array(triIndicesBuffer.getMappedRange());
        let lineIndicesMap = new Uint16Array(lineIndicesBuffer.getMappedRange());

        // add our meshes to the vertex and index buffers
        let numVerts = 0;
        let numTris = 0;
        function addMesh(m: Mesh): MeshHandle {
            if (verticesMap === null)
                throw "Use preRender() and postRender() functions"
            if (numVerts + m.pos.length > maxVerts)
                throw "Too many vertices!"
            if (numTris + m.tri.length > maxTris)
                throw "Too many triangles!"

            const vertNumOffset = numVerts;
            const triIndicesNumOffset = numTris * vertsPerTri;

            m.pos.forEach((pos, i) => {
                const vOff = (numVerts) * vertElStride
                verticesMap.set([...pos, ...[0, 0, 0], ...[0, 0, 0]], vOff)
                numVerts += 1;
            })

            m.tri.forEach((triInd, i) => {
                const provokingVertOffset = (vertNumOffset + triInd[0]) * vertElStride
                const iOff = (numTris) * vertsPerTri
                if (triIndicesMap) {
                    // update indices
                    triIndicesMap[iOff + 0] = triInd[0]
                    triIndicesMap[iOff + 1] = triInd[1]
                    triIndicesMap[iOff + 2] = triInd[2]
                }
                // set provoking vertex
                const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
                verticesMap.set([...m.pos[triInd[0]], ...m.colors[i], ...normal], provokingVertOffset)
                numTris += 1;
            })

            const transform = mat4.create() as Float32Array;

            const uniOffset = allMeshHandles.length * meshUniByteSizeAligned;
            device.queue.writeBuffer(_meshUniBuffer, uniOffset, transform.buffer);

            const res: MeshHandle = {
                vertNumOffset,
                triIndicesNumOffset: triIndicesNumOffset,
                modelUniByteOffset: uniOffset,
                transform,
                triCount: m.tri.length,
                model: m,
            }

            allMeshHandles.push(res)
            return res;
        }

        ground = addMesh(PLANE); // ground plane
        player = addMesh(CUBE); // player movable cube
        for (let i = 0; i < 10; i++) {
            // create cubes with random colors
            const color: vec3 = [Math.random(), Math.random(), Math.random()];
            const coloredCube: Mesh = { ...CUBE, colors: CUBE.colors.map(_ => color) }
            randomCubes.push(addMesh(coloredCube))
        }

        // compute the wireframe indices from the triangle indices
        // TODO(@darzu): 
        let lineIdx = 0
        for (let i = 0; i < triIndicesMap.length; i += 3) {
            const a = triIndicesMap[i + 0]
            const b = triIndicesMap[i + 1]
            const c = triIndicesMap[i + 2]

            lineIndicesMap[lineIdx + 0] = a
            lineIndicesMap[lineIdx + 1] = b
            lineIndicesMap[lineIdx + 2] = a
            lineIndicesMap[lineIdx + 3] = c
            lineIndicesMap[lineIdx + 4] = b
            lineIndicesMap[lineIdx + 5] = c
            lineIdx += 6
        }

        // unmap the buffers so the GPU can use them
        verticesBuffer.unmap()
        triIndicesBuffer.unmap()
        lineIndicesBuffer.unmap()
    }

    // place the ground
    mat4.translate(ground.transform, ground.transform, [0, -3, -8])
    mat4.scale(ground.transform, ground.transform, [10, 10, 10])
    gpuBufferWriteMeshTransform(ground);

    // initialize our cubes; each will have a random axis of rotation
    const randomCubesAxis: vec3[] = []
    for (let m of randomCubes) {
        // place and rotate cubes randomly
        mat4.translate(m.transform, m.transform, [Math.random() * 20 - 10, Math.random() * 5, -Math.random() * 10 - 5])
        const axis: vec3 = vec3.normalize(vec3.create(), [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        randomCubesAxis.push(axis)
        gpuBufferWriteMeshTransform(m);
    }

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
    gpuBufferWriteMeshTransform(player)

    // write the light data to the scene uniform buffer
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 1, (lightViewProjMatrix as Float32Array).buffer);
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 2, (lightDir as Float32Array).buffer);

    // setup a binding for our per-mesh uniforms
    const modelUniBindGroupLayout = device.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: meshUniByteSizeAligned },
        }],
    });
    const modelUniBindGroup = device.createBindGroup({
        layout: modelUniBindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: _meshUniBuffer, size: meshUniByteSizeAligned, },
        }],
    });

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const prim_triList: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: 'ccw',
    };
    const prim_lineList: GPUPrimitiveState = {
        topology: 'line-list',
    };

    // define the resource bindings for the mesh rendering pipeline
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
    });
    const renderSceneUniBindGroup = device.createBindGroup({
        layout: renderSceneUniBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: sceneUniBuffer } },
        ],
    });

    // setup our pipeline which renders meshes to the canvas
    const renderPipelineDesc_solid: GPURenderPipelineDescriptor = {
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
            targets: [{ format: presentationFormat }],
        },
        primitive: prim_triList,
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: depthStencilFormat,
        },
        multisample: {
            count: antiAliasSampleCount,
        },
    };
    const renderPipeline_solid = device.createRenderPipeline(renderPipelineDesc_solid);

    // create our wireframe pipeline
    const renderPipelineDesc_wire: GPURenderPipelineDescriptor = {
        ...renderPipelineDesc_solid,
        primitive: prim_lineList,
    };
    const renderPipeline_wire = device.createRenderPipeline(renderPipelineDesc_wire);

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const bundleEnc_solid = device.createRenderBundleEncoder({
        colorFormats: [presentationFormat],
        depthStencilFormat: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
    });
    bundleEnc_solid.setPipeline(renderPipeline_solid);
    bundleEnc_solid.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc_solid.setVertexBuffer(0, verticesBuffer);
    bundleEnc_solid.setIndexBuffer(triIndicesBuffer, 'uint16');
    for (let m of allMeshHandles) {
        bundleEnc_solid.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        bundleEnc_solid.drawIndexed(m.triCount * vertsPerTri, undefined, m.triIndicesNumOffset, m.vertNumOffset);
    }
    let bundle_solid = bundleEnc_solid.finish()

    // same thing for our wireframe view
    const bundleEnc_wire = device.createRenderBundleEncoder({
        colorFormats: [presentationFormat],
        depthStencilFormat: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
    });
    bundleEnc_wire.setPipeline(renderPipeline_wire);
    bundleEnc_wire.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc_wire.setVertexBuffer(0, verticesBuffer);
    bundleEnc_wire.setIndexBuffer(lineIndicesBuffer, 'uint16');
    for (let m of allMeshHandles) {
        bundleEnc_wire.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        bundleEnc_wire.drawIndexed(m.triCount * linesPerTri, undefined, m.triIndicesNumOffset, m.vertNumOffset);
    }
    let bundle_wire = bundleEnc_wire.finish()

    // initialize performance metrics
    let debugDiv = document.getElementById('debug-div') as HTMLDivElement;
    let previousFrameTime = 0;
    let avgJsTimeMs = 0
    let avgFrameTimeMs = 0

    // controls for this demo
    const controlsStr = `controls: WASD, shift/c, mouse, spacebar, 1&2: solid/wireframe`

    let isWireframe = false;

    // our main game loop
    function renderFrame(timeMs: number) {
        // track performance metrics
        const start = performance.now();
        const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
        previousFrameTime = timeMs;

        // resize (if necessary)
        checkCanvasResize(device, context, canvasRef.width, canvasRef.height);

        // process inputs and move the player & camera
        const playerSpeed = pressedKeys[' '] ? 1.0 : 0.2; // spacebar boosts speed
        if (pressedKeys['w']) moveZ(player.transform, -playerSpeed) // forward
        if (pressedKeys['s']) moveZ(player.transform, playerSpeed) // backward
        if (pressedKeys['a']) moveX(player.transform, -playerSpeed) // left
        if (pressedKeys['d']) moveX(player.transform, playerSpeed) // right
        if (pressedKeys['shift']) moveY(player.transform, playerSpeed) // up
        if (pressedKeys['c']) moveY(player.transform, -playerSpeed) // down
        if (pressedKeys['1']) isWireframe = false
        if (pressedKeys['2']) isWireframe = true
        const { x: mouseX, y: mouseY } = takeAccumulatedMouseMovement();
        yaw(player.transform, -mouseX * 0.01);
        pitch(cameraOffset, -mouseY * 0.01);

        // apply the players movement by writting to the model uniform buffer
        gpuBufferWriteMeshTransform(player);

        // rotate the random cubes
        for (let i = 0; i < randomCubes.length; i++) {
            const m = randomCubes[i]
            const axis = randomCubesAxis[i]
            mat4.rotate(m.transform, m.transform, Math.PI * 0.01, axis);
            gpuBufferWriteMeshTransform(m);
        }

        // calculate and write our view and project matrices
        const viewMatrix = mat4.create()
        mat4.multiply(viewMatrix, viewMatrix, player.transform)
        mat4.multiply(viewMatrix, viewMatrix, cameraOffset)
        mat4.translate(viewMatrix, viewMatrix, [0, 0, 10]) // TODO(@darzu): can this be merged into the camera offset?
        mat4.invert(viewMatrix, viewMatrix);
        const projectionMatrix = mat4.perspective(mat4.create(), (2 * Math.PI) / 5, aspectRatio, 1, 10000.0/*view distance*/);
        const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix) as Float32Array
        device.queue.writeBuffer(sceneUniBuffer, 0, viewProj.buffer);

        // start collecting our render commands for this frame
        const commandEncoder = device.createCommandEncoder();

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
        if (isWireframe)
            renderPassEncoder.executeBundles([bundle_wire]);
        else
            renderPassEncoder.executeBundles([bundle_solid]);
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
function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}
function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
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

async function main() {
    const start = performance.now();

    // attach to HTML canvas 
    let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    const context = canvasRef.getContext('webgpu') as any as GPUPresentationContext;
    presentationFormat = context.getPreferredFormat(adapter!);

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
    const renderFrame = attachToCanvas(canvasRef, device, context);
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