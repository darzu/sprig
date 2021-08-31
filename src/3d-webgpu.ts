import { mat4, vec3, quat } from './ext/gl-matrix.js';
import { clamp } from './math.js';
import { createMeshMemoryPool, CUBE, mat4ByteSize, Mesh, MeshMemoryPoolOptions, MeshModel, PLANE, triByteSize } from './3d/mesh.js';
import { createMeshRenderer } from './3d/mesh-renderer.js';
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

    const vertElStride = (3/*pos*/ + 3/*color*/)
    const defaultMeshPoolOpts: MeshMemoryPoolOptions = {
        vertByteSize: Float32Array.BYTES_PER_ELEMENT * vertElStride,
        maxVerts: 1000,
        maxTris: 1000,
        maxMeshes: 100,
        meshUniByteSize: Math.ceil(mat4ByteSize / 256) * 256, // align to 256,
    }
    const meshPool = createMeshMemoryPool(defaultMeshPoolOpts, device);

    // TODO(@darzu): 
    const meshRenderer = createMeshRenderer(meshPool, device, context, canvasRef.width, canvasRef.height);

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

    /*
    tracking meshes:
        add to vertex & index buffers
            add current vertex count to as triangle offset
        resize buffers if needed
            nahh.. fixed size, max count
        track current number of vertices

    */

    // GPUDepthStencilStateDescriptor


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

    meshPool.addMeshes([
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

    const bundle = meshRenderer.createRenderBundle();

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
            meshRenderer.sharedUniBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
        );

        const commandEncoder = device.createCommandEncoder();
        meshRenderer.renderBundle(commandEncoder, bundle);
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