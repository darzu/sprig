import { mat4, vec3, vec4, quat } from './ext/gl-matrix.js';
import { clamp } from './math.js';
import { addTriToBuffers, createMeshMemoryPool, CUBE, mat4ByteSize, Mesh, MeshMemoryPool, MeshMemoryPoolOptions, MeshModel, PLANE, triByteSize, vec3ByteSize } from './3d/mesh.js';
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

// TODO(@darzu): VERTEX FORMAT
const vertElStride = (3/*pos*/ + 3/*color*/ + 3/*normal*/ + 1/*swayHeight*/)


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


function jitter(radius: number): number {
    return (Math.random() - 0.5) * radius * 2
}

function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}


// TODO(@darzu): grass tiles
/*
simple:
    grid of tiles, all the same amount of grass
    move to center around the player
    each tile level can be totaly independent
    more levels can be added/removed

can this be done with ECS?
    "on player change tile, level X"
*/

interface GrassSystem {
    getGrassPools: () => MeshMemoryPool[],
    // TODO(@darzu): getAABB
}

interface GrassTileOpts {
    bladeW: number,
    bladeH: number
    spacing: number,
    size: number,
}
interface GrassTilesetOpts {
    count: number,
}

function createGrassTile(opts: GrassTileOpts, grassMeshPool: MeshMemoryPool): Mesh {
    const { spacing, size, bladeW, bladeH } = opts;

    let i = 0;
    for (let xi = 0.0; xi < size; xi += spacing) {
        for (let zi = 0.0; zi < size; zi += spacing) {

            const x = xi + jitter(0.5)
            const z = zi + jitter(0.5)

            const w = bladeW + jitter(0.05)

            const rot = jitter(Math.PI * 0.5)

            const x1 = x + Math.cos(rot) * w
            const z1 = z + Math.sin(rot) * w
            const x2 = x + Math.cos(rot + Math.PI) * w
            const z2 = z + Math.sin(rot + Math.PI) * w
            const x3 = x + jitter(0.7)
            const z3 = z + jitter(0.7)

            const y = bladeH + jitter(1)

            const r = 0.2 + jitter(0.02)
            const g = 0.5 + jitter(0.2)
            const b = 0.2 + jitter(0.02)

            const p0: vec3 = [x1, 0, z1];
            const p1: vec3 = [x2, 0, z2];
            const p2: vec3 = [x3, y, z3];

            const norm = vec3.cross(vec3.create(), [x2 - x1, 0, z2 - z1], [x3 - x1, y, z3 - z1])
            vec3.normalize(norm, norm);

            // const x = xi * spacing + jitter(0.5);
            // const z = zi * spacing + jitter(0.5);

            // TODO(@darzu): turn off back-face culling
            addTriToBuffers(
                [p0, p1, p2],
                [0, 1, 2],
                norm,
                [
                    [r * 0.5, g * 0.5, b * 0.5],
                    [r * 0.5, g * 0.5, b * 0.5],
                    [r, g, b],
                ],
                [0, 0, 1.0],
                grassMeshPool._vertsMap(),
                grassMeshPool._numVerts,
                vertElStride,
                grassMeshPool._indMap(),
                grassMeshPool._numTris,
                true);

            grassMeshPool._numTris += 1;
            grassMeshPool._numVerts += 3;

            i++;
        }
    }
    console.log(`Grass triangles: ${i}`)

    // TODO(@darzu): compute correct offsets
    const grassMesh: Mesh = {
        vertNumOffset: 0,
        indicesNumOffset: 0,
        modelUniByteOffset: 0,
        triCount: i,

        // used and updated elsewhere
        transform: mat4.create(),

        // not applicable
        // TODO(@darzu): make this optional?
        model: null as unknown as MeshModel,
    };

    grassMeshPool._meshes.push(grassMesh);

    return grassMesh;
}

function createGrassTileset(opts: GrassTileOpts & GrassTilesetOpts, device: GPUDevice): MeshMemoryPool {
    // create grass field
    const { spacing, size } = opts;
    const grassPerTile = (size / spacing) ** 2;
    const totalGrass = grassPerTile * opts.count;
    const grassMeshPool = createMeshMemoryPool({
        vertByteSize: Float32Array.BYTES_PER_ELEMENT * vertElStride,
        maxVerts: align(totalGrass * 3, 4),
        maxTris: align(totalGrass, 4),
        maxMeshes: opts.count,
        meshUniByteSize: align(mat4ByteSize, 256), // align to 256,
        backfaceCulling: false,
        usesIndices: false,
    }, device);

    grassMeshPool._map();

    const tile = createGrassTile(opts, grassMeshPool);
    grassMeshPool.applyMeshTransform(tile)

    grassMeshPool._unmap();

    // TODO(@darzu): update transform

    // const trans = mat4.create() as Float32Array;
    // const uniOffset = 0;
    // device.queue.writeBuffer(
    //     grassMeshPool._meshUniBuffer,
    //     uniOffset,
    //     trans.buffer,
    //     trans.byteOffset,
    //     trans.byteLength
    // );

    return grassMeshPool
}

function initGrassSystem(device: GPUDevice): GrassSystem {

    const tilesetPool = createGrassTileset({
        // tile
        bladeW: 0.1,
        bladeH: 1.7,
        spacing: 0.25,
        size: 10,
        // tileset
        count: 4
    }, device);


    const res: GrassSystem = {
        getGrassPools: () => [tilesetPool]
    }
    return res;
}

async function init(canvasRef: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    if (!canvasRef === null) return;
    const context = canvasRef.getContext('gpupresent')!;

    // dynamic resize:
    function resize() {
        canvasRef.width = window.innerWidth;
        canvasRef.style.width = `${window.innerWidth}px`;
        canvasRef.height = window.innerHeight;
        canvasRef.style.height = `${window.innerHeight}px`;
    }
    window.onresize = function () {
        resize();
    }
    resize();

    // TODO(@darzu): VERTEX FORMAT
    const meshPool = createMeshMemoryPool({
        vertByteSize: Float32Array.BYTES_PER_ELEMENT * vertElStride,
        maxVerts: 100000,
        maxTris: 100000,
        maxMeshes: 10000,
        meshUniByteSize: Math.ceil(mat4ByteSize / 256) * 256, // align to 256,
        backfaceCulling: true,
        usesIndices: true,
    }, device);

    // TODO(@darzu): 
    const meshRenderer = createMeshRenderer(
        meshPool._opts.meshUniByteSize, meshPool._opts.vertByteSize, device, context);

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

    meshPool._map()

    meshPool.addMeshes([
        PLANE
    ])
    const planeHandle = meshPool._meshes[meshPool._meshes.length - 1] // TODO(@darzu): hack
    mat4.scale(planeHandle.transform, planeHandle.transform, [10, 10, 10]);
    meshPool.applyMeshTransform(planeHandle);

    meshPool.addMeshes([
        CUBE,
        CUBE,
        CUBE,
        CUBE,
        CUBE,
    ])

    // create a field of cubes
    {
        const grayCube: MeshModel = { ...CUBE, colors: CUBE.colors.map(c => [0.3, 0.3, 0.3]) }
        const spread = 2;
        const spacing = 2;
        const boxHandles: Mesh[] = []
        for (let x = -spread; x < spread; x++) {
            for (let y = -spread; y < spread; y++) {
                for (let z = -spread; z < spread; z++) {
                    meshPool.addMeshes([grayCube])
                    const handle = meshPool._meshes[meshPool._meshes.length - 1] // TODO(@darzu): hack
                    mat4.translate(handle.transform, handle.transform, [x * spacing, (y + spread + 1.5) * spacing, (z - spread * 1.5) * spacing])
                    mat4.rotateX(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    mat4.rotateY(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    mat4.rotateZ(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    meshPool.applyMeshTransform(handle);
                    boxHandles.push(handle)
                }
            }
        }
    }

    meshPool._unmap();

    const grassSystem = initGrassSystem(device);

    const aspect = Math.abs(canvasRef.width / canvasRef.height);
    const projectionMatrix = mat4.create();
    const viewDistance = 1000.0;
    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, viewDistance);

    const cameraPos = mkAffineTransformable();
    cameraPos.pitch(-Math.PI / 4)

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
        const speed = 0.2;
        if (pressedKeys['w'])
            t.moveZ(-speed)
        if (pressedKeys['s'])
            t.moveZ(speed)
        if (pressedKeys['a'])
            t.moveX(-speed)
        if (pressedKeys['d'])
            t.moveX(speed)
        if (pressedKeys['shift'])
            t.moveY(speed)
        if (pressedKeys['c'])
            t.moveY(-speed)
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

    // write light source
    {
        const upVector = vec3.fromValues(0, 1, 0);
        const origin = vec3.fromValues(0, 0, 0);
        const lightPosition = vec3.fromValues(50, 100, -100);
        const lightViewMatrix = mat4.create();
        mat4.lookAt(lightViewMatrix, lightPosition, origin, upVector);

        const lightProjectionMatrix = mat4.create();
        {
            const left = -80;
            const right = 80;
            const bottom = -80;
            const top = 80;
            const near = -200;
            const far = 300;
            mat4.ortho(lightProjectionMatrix, left, right, bottom, top, near, far);
        }
        const lightViewProjMatrix = mat4.create();
        mat4.multiply(lightViewProjMatrix, lightProjectionMatrix, lightViewMatrix);
        const lightMatrixData = lightViewProjMatrix as Float32Array;
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            mat4ByteSize * 1, // second matrix
            lightMatrixData.buffer,
            lightMatrixData.byteOffset,
            lightMatrixData.byteLength
        );

        const lightData = lightPosition as Float32Array;
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            mat4ByteSize * 2, // third matrix
            lightData.buffer,
            lightData.byteOffset,
            lightData.byteLength
        );
    }

    meshRenderer.rebuildBundles([meshPool, ...grassSystem.getGrassPools()]);

    let debugDiv = document.getElementById('debug_div') as HTMLDivElement;

    let previousFrameTime = 0;
    let avgJsTime = 0
    let avgFrameTime = 0

    function frame(time: number) {
        // meshPool.postRender()

        const start = performance.now();

        const frameTime = previousFrameTime ? time - previousFrameTime : 0;
        previousFrameTime = time;

        // meshPool.postRender()

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

        // writting time to shared buffer
        const sharedTime = new Float32Array(1);
        sharedTime[0] = Math.floor(time); // TODO(@darzu):         
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            mat4ByteSize * 2 + vec3ByteSize * 1, // TODO(@darzu): getting these offsets is a pain
            sharedTime.buffer,
            sharedTime.byteOffset,
            sharedTime.byteLength
        );
        // TODO(@darzu): SCENE FORMAT
        const displacer = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], playerT.getTransform()) as Float32Array;
        // console.log(`(${displacer[0]}, ${displacer[1]}, ${displacer[2]})`);
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            mat4ByteSize * 2 + vec3ByteSize * 1 + Float32Array.BYTES_PER_ELEMENT * 1,
            displacer.buffer,
            displacer.byteOffset,
            displacer.byteLength - 4
        );

        // meshPool.preRender()
        const canvasWidth = canvasRef.clientWidth;
        const canvasHeight = canvasRef.clientHeight;

        const commandEncoder = device.createCommandEncoder();
        meshRenderer.render(commandEncoder, [meshPool, ...grassSystem.getGrassPools()], canvasWidth, canvasHeight);
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);

        const jsTime = performance.now() - start;

        const avgWeight = 0.05
        avgJsTime = avgJsTime ? (1 - avgWeight) * avgJsTime + avgWeight * jsTime : jsTime
        avgFrameTime = avgFrameTime ? (1 - avgWeight) * avgFrameTime + avgWeight * frameTime : frameTime

        const avgFPS = 1000 / avgFrameTime;

        // TODO(@darzu): 
        debugDiv.innerText = `js: ${avgJsTime.toFixed(2)}ms, frame: ${avgFrameTime.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)}`
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