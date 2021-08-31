import { mat4, vec3, vec4, quat } from './ext/gl-matrix.js';
import { align, clamp, jitter } from './math.js';
import { addTriToBuffers, createMeshMemoryPool, CUBE, bytesPerFloat as bytesPerFloat, bytesPerMat4 as bytesPerMat4, Mesh, MeshMemoryPool, MeshMemoryPoolOptions, MeshModel, PLANE, bytesPerTri, bytesPerVec3 } from './3d/mesh.js';
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

// FLAGS
const RENDER_GRASS = false;

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
    update: (target: vec3) => void,
    // TODO(@darzu): getAABB
}

interface GrassTileOpts {
    bladeW: number,
    bladeH: number
    spacing: number,
    tileSize: number,
    maxBladeDraw: number,
}
interface GrassTilesetOpts {
    bladeW: number,
    bladeH: number
    spacing: number,
    tileSize: number,
    tilesPerSide: number,
}

function createGrassTile(opts: GrassTileOpts, grassMeshPool: MeshMemoryPool): Mesh {
    const { spacing, tileSize: size, bladeW, bladeH } = opts;

    // TODO(@darzu): debug coloring
    const [r, g, b] = [Math.random(), Math.random(), Math.random()];
    // console.log(r, g, b) // TODO(@darzu): 

    const prevNumTris = grassMeshPool._numTris;
    const prevNumVerts = grassMeshPool._numVerts;

    let i = 0;
    for (let xi = 0.0; xi < size; xi += spacing) {
        for (let zi = 0.0; zi < size; zi += spacing) {

            const x = xi + jitter(spacing)
            const z = zi + jitter(spacing)

            const w = bladeW + jitter(0.05)

            const rot = jitter(Math.PI * 0.5)

            const x1 = x + Math.cos(rot) * w
            const z1 = z + Math.sin(rot) * w
            const x2 = x + Math.cos(rot + Math.PI) * w
            const z2 = z + Math.sin(rot + Math.PI) * w
            const x3 = x + jitter(0.7)
            const z3 = z + jitter(0.7)
            const x4 = x3 + jitter(w * 0.5)
            const z4 = z3 + jitter(w * 0.5)

            const y1 = 0; //-bladeH;
            const y2 = 0;
            const y3 = bladeH + jitter(1)
            const y4 = y3 * (0.9 + jitter(0.1))

            // TODO(@darzu): disable for debug coloring
            // const r = 0.2 + jitter(0.02)
            // const g = 0.5 + jitter(0.2)
            // const b = 0.2 + jitter(0.02)

            const p1: vec3 = [x1, y1, z1];
            const p2: vec3 = [x2, y2, z2];
            const p3: vec3 = [x3, y3, z3];
            const p4: vec3 = [x4, y4, z4];

            const norm1 = vec3.cross(vec3.create(), [x2 - x1, y2 - y1, z2 - z1], [x3 - x1, y3 - y1, z3 - z1])
            vec3.normalize(norm1, norm1);

            addTriToBuffers(
                [p1, p2, p3],
                [0, 1, 2],
                norm1,
                [
                    // TODO(@darzu): use proper darkening
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

            // const norm2 = vec3.cross(vec3.create(), [x3 - x1, y3 - y1, z3 - z1], [x4 - x1, y4 - y1, z4 - z1])
            // vec3.normalize(norm2, norm2);

            // addTriToBuffers(
            //     [p1, p3, p4],
            //     [0, 1, 2],
            //     norm2,
            //     [
            //         [r * 0.5, g * 0.5, b * 0.5],
            //         [r, g, b],
            //         [r, g, b],
            //     ],
            //     [0.0, 1.0, 1.0],
            //     grassMeshPool._vertsMap(),
            //     grassMeshPool._numVerts,
            //     vertElStride,
            //     grassMeshPool._indMap(),
            //     grassMeshPool._numTris,
            //     true);

            // grassMeshPool._numTris += 1;
            // grassMeshPool._numVerts += 3;

            // i++;
        }
    }

    // TODO(@darzu): compute correct offsets
    const grassMesh: Mesh = {
        vertNumOffset: prevNumVerts,
        indicesNumOffset: prevNumTris * 3,
        modelUniByteOffset: grassMeshPool._opts.meshUniByteSize * grassMeshPool._meshes.length,
        triCount: i,

        // used and updated elsewhere
        transform: mat4.create(),
        maxDraw: opts.maxBladeDraw,

        // TODO(@darzu): what're the implications of this?
        shadowCaster: false,

        // not applicable
        // TODO(@darzu): make this optional?
        model: null as unknown as MeshModel,
    };

    // TODO(@darzu): do here?
    grassMeshPool.applyMeshMaxDraw(grassMesh)


    grassMeshPool._meshes.push(grassMesh);

    return grassMesh;
}

interface GrassTileset {
    pool: MeshMemoryPool,
    tiles: Mesh[],
    update: (target: vec3) => void,
}

function createGrassTileset(opts: GrassTilesetOpts, device: GPUDevice): GrassTileset {
    // create grass field
    const { spacing, tileSize, tilesPerSide } = opts;
    const grassPerTile = (tileSize / spacing) ** 2;
    const tileCount = tilesPerSide ** 2;
    const totalGrass = grassPerTile * tileCount;
    // const totalGrassTris = totalGrass * 1;
    // TODO(@darzu): GRASS FORMAT
    const totalGrassTris = totalGrass * 2;
    const pool = createMeshMemoryPool({
        vertByteSize: bytesPerFloat * vertElStride,
        maxVerts: align(totalGrassTris * 3, 4),
        maxTris: align(totalGrassTris, 4),
        maxMeshes: tileCount,
        // TODO(@darzu): MESH FORMAT
        meshUniByteSize: align(
            bytesPerMat4 // transform
            + bytesPerFloat // max draw distance
            , 256),
        backfaceCulling: false,
        usesIndices: false,
    }, device);

    pool._map();

    const maxBladeDraw = ((tilesPerSide - 1) / 2) * tileSize
    const tileOpts: GrassTileOpts = {
        ...opts,
        maxBladeDraw
    }

    for (let xi = 0; xi < tilesPerSide; xi++) {
        for (let zi = 0; zi < tilesPerSide; zi++) {
            const x = xi * tileSize;
            const z = zi * tileSize;
            // TODO(@darzu): 
            // console.log(`(${xi}, ${zi})`);
            const tile = createGrassTile(tileOpts, pool);
            mat4.translate(tile.transform, tile.transform, [x, 0, z])
            pool.applyMeshTransform(tile)
            // TODO(@darzu): 

            // const uniOffset = _meshes.length * meshUniByteSize;
            // device.queue.writeBuffer(
            //     _meshUniBuffer,
            //     uniOffset,
            //     trans.buffer,
            //     trans.byteOffset,
            //     trans.byteLength
            // );
        }
    }

    pool._unmap();

    const tiles = pool._meshes;

    // handle grass tile movement
    function update(target: vec3) {
        const [tx, _, tz] = target;

        // compute the N closest centers
        const txi = tx / opts.tileSize;
        const nearestXIs = nearestIntegers(txi, opts.tilesPerSide)
        const tzi = tz / opts.tileSize;
        const nearestZIs = nearestIntegers(tzi, opts.tilesPerSide)
        const nearestIs: [number, number][] = []
        for (let xi of nearestXIs)
            for (let zi of nearestZIs)
                nearestIs.push([xi, zi])

        // compare with current positions
        const occupied: [number, number][] = []
        const toMoveInds: number[] = []
        const tilePoses: vec3[] = tiles.map(t => getPositionFromTransform(t.transform))
        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i]
            const [x, _, z] = tilePoses[i]
            const xi = Math.floor((x + 0.5) / opts.tileSize)
            const zi = Math.floor((z + 0.5) / opts.tileSize)
            let shouldMove = true;
            for (let [xi2, zi2] of nearestIs) {
                if (xi2 === xi && zi2 === zi) {
                    occupied.push([xi2, zi2])
                    shouldMove = false;
                    break;
                }
            }
            if (shouldMove)
                toMoveInds.push(i)
        }

        // move those that don't match
        for (let i of toMoveInds) {
            const t = tiles[i]
            for (let [xi1, zi1] of nearestIs) {
                const isOpen = !occupied.some(([xi2, zi2]) => xi2 === xi1 && zi2 === zi1)
                if (!isOpen)
                    continue;
                // do move
                occupied.push([xi1, zi1])
                const targetPos: vec3 = [xi1 * opts.tileSize, 0, zi1 * opts.tileSize]
                const move = vec3.subtract(vec3.create(), targetPos, tilePoses[i])
                mat4.translate(t.transform, t.transform, move)
                // console.log(`moving (${tilePoses[i][0]}, ${tilePoses[i][1]}, ${tilePoses[i][2]}) to (${targetPos[0]}, ${targetPos[1]}, ${targetPos[2]}) via (${move[0]}, ${move[1]}, ${move[2]})`)
                pool.applyMeshTransform(t)
                break;
            }
        }
    }

    return {
        pool,
        tiles,
        update,
    }
}

function nearestIntegers(target: number, numInts: number): number[] {
    const maxIntDist = (numInts - 1) / 2;
    const minInt = Math.floor(target - maxIntDist);
    const maxInt = Math.floor(target + maxIntDist);
    const nearestInts: number[] = [];
    for (let xi = minInt; xi <= maxInt; xi++)
        nearestInts.push(xi)
    if (nearestInts.length !== numInts) {
        console.error(`Too many (!=${numInts}) 'NEAREST' integers [${nearestInts.join(',')}] found to: ${target}`)
    }
    return nearestInts;
}

function initGrassSystem(device: GPUDevice): GrassSystem {
    if (!RENDER_GRASS) {
        return {
            getGrassPools: () => [],
            update: () => { },
        }
    }

    // TODO(@darzu): try upside down triangles
    const lod1Opts: GrassTilesetOpts = {
        // tile
        // bladeW: 0.2,
        bladeW: 0.2,
        // bladeH: 3,
        bladeH: 1.6,
        // bladeH: 1.5,
        // bladeH: 1.7,
        // TODO(@darzu): debugging
        // spacing: 1,
        // tileSize: 4,
        spacing: 0.25,
        tileSize: 16,
        // tileSize: 10,
        // tileset
        tilesPerSide: 5,
    }
    const lod0Opts: GrassTilesetOpts = {
        ...lod1Opts,
        bladeH: lod1Opts.bladeH * 0.8,
        spacing: lod1Opts.spacing * 0.5,
        tileSize: lod1Opts.tileSize * 0.5,
    }
    const lod2Opts: GrassTilesetOpts = {
        ...lod1Opts,
        bladeH: lod1Opts.bladeH * 1.4,
        spacing: lod1Opts.spacing * 2,
        tileSize: lod1Opts.tileSize * 2,
    }
    const lod3Opts: GrassTilesetOpts = {
        ...lod1Opts,
        bladeH: lod1Opts.bladeH * 1.6,
        spacing: lod1Opts.spacing * 4,
        tileSize: lod1Opts.tileSize * 4,
    }
    const lod4Opts: GrassTilesetOpts = {
        ...lod1Opts,
        tilesPerSide: 8,
        bladeH: lod1Opts.bladeH * 1.8,
        spacing: lod1Opts.spacing * 8,
        tileSize: lod1Opts.tileSize * 8,
    }

    const lodDebug: GrassTilesetOpts = {
        bladeW: 0.4,
        bladeH: 2,
        spacing: 1,
        tileSize: 4,
        tilesPerSide: 5,
    }

    // TODO(@darzu): debugging
    // const lodOpts = [lodDebug]
    const lodOpts = [
        lod0Opts,
        lod1Opts,
        // lod1Opts,
        lod2Opts,
        lod3Opts,
        lod4Opts
    ]

    const tilesets = lodOpts.map(opts => createGrassTileset(opts, device))

    function updateAll(target: vec3) {
        tilesets.forEach(t => t.update(target))
    }

    const triCount = tilesets.map(s => s.pool._numTris).reduce((p, n) => p + n, 0)
    console.log(`Creating grass system with ${(triCount / 1000).toFixed(0)}k triangles.`);

    const res: GrassSystem = {
        getGrassPools: () => tilesets.map(t => t.pool),
        update: updateAll,
    }
    return res;
}

function getPositionFromTransform(t: mat4): vec3 {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos
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
        vertByteSize: bytesPerFloat * vertElStride,
        maxVerts: 100000,
        maxTris: 100000,
        maxMeshes: 10000,
        // TODO(@darzu): MESH FORMAT
        meshUniByteSize: align(
            bytesPerMat4 // transform
            + bytesPerFloat // max draw distance
            , 256),
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

    const [planeHandle] = meshPool.addMeshes([
        PLANE
    ], true)
    const planeSize = 1000;
    mat4.scale(planeHandle.transform, planeHandle.transform, [planeSize, planeSize, planeSize]);
    meshPool.applyMeshTransform(planeHandle);

    meshPool.addMeshes([
        CUBE,
        CUBE,
        CUBE,
    ], true)

    const playerCubeModel: MeshModel = { ...CUBE, colors: CUBE.colors.map(c => [0.0, 0.3, 0.3]) }
    const [playerM] = meshPool.addMeshes([playerCubeModel], true)

    // create a field of cubes
    function createGarbageCube(pos: vec3)
    {
        const color: vec3 = [0.3 + jitter(0.05), 0.3 + jitter(0.05), 0.3 + jitter(0.05)];
        const grayCube: MeshModel = {
            ...CUBE,
            colors: CUBE.colors.map(c => color),
        }
        const spread = 2;
        const spacing = 2;
        const boxHandles: Mesh[] = []
        for (let x = -spread; x < spread; x++) {
            for (let y = -spread; y < spread; y++) {
                for (let z = -spread; z < spread; z++) {
                    meshPool.addMeshes([grayCube], true)
                    const handle = meshPool._meshes[meshPool._meshes.length - 1] // TODO(@darzu): hack
                    mat4.translate(handle.transform, handle.transform, pos)
                    mat4.translate(handle.transform, handle.transform, [x * spacing, (y + spread + 1.5) * spacing, (z - spread * 1.5) * spacing])
                    mat4.rotateX(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    mat4.rotateY(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    mat4.rotateZ(handle.transform, handle.transform, Math.random() * 2 * Math.PI)
                    meshPool.applyMeshTransform(handle);
                    boxHandles.push(handle)
                }
            }
        }
        return boxHandles;
    }
    createGarbageCube([0, 3, 0])
    createGarbageCube([20, 2, 0])
    createGarbageCube([0, 7, 20])
    createGarbageCube([-10, -5, -10])

    // light cube
    const cubeSize = 10;
    const lightCubeModel: MeshModel = {
        ...CUBE,
        pos: CUBE.pos.map(([x, y, z]) => [x * cubeSize, y * cubeSize, z * cubeSize]),
        colors: CUBE.colors.map(c => [0.9, 0.9, 0.3]),
    }
    const [lightCube] = meshPool.addMeshes([
        lightCubeModel,
    ], false)

    meshPool._unmap();

    const grassSystem = initGrassSystem(device);

    const aspect = Math.abs(canvasRef.width / canvasRef.height);
    const projectionMatrix = mat4.create();
    const viewDistance = 10000.0;
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
        const speed = pressedKeys[' '] ? 1.0 : 0.2;
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


    const playerT = mkAffineTransformable();
    playerM.transform = playerT.getTransform();
    meshPool.applyMeshTransform(playerM)

    let playerPos = getPositionFromTransform(playerM.transform);

    // write light source
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
    let sunOffset = 0;
    let lastTimeMs = 0;
    function updateLight(timeMs: number) {
        const timeDelta = timeMs - lastTimeMs;
        lastTimeMs = timeMs;

        if (pressedKeys['l']) {
            return;
        }

        sunOffset += timeDelta

        const upVector = vec3.fromValues(0, 1, 0);
        const origin = vec3.fromValues(0, 0, 0);
        const sunSpeed = 0.0004;
        const lightX = Math.cos((sunOffset) * sunSpeed) * 100
        const lightY = Math.sin((sunOffset) * sunSpeed) * 100
        const isNight = lightY < 0;
        if (isNight) {
            sunOffset += 50;
        }

        const lightPosition = vec3.fromValues(lightX, lightY, 0);
        // const lightPosition = vec3.fromValues(50, 100, -100);
        const lightViewMatrix = mat4.create();
        mat4.lookAt(lightViewMatrix, lightPosition, origin, upVector);
        // mat4.translate(lightViewMatrix, lightViewMatrix, playerPos)

        const lightViewProjMatrix = mat4.create();
        mat4.multiply(lightViewProjMatrix, lightProjectionMatrix, lightViewMatrix);
        const lightMatrixData = lightViewProjMatrix as Float32Array;
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            bytesPerMat4 * 1, // second matrix
            lightMatrixData.buffer,
            lightMatrixData.byteOffset,
            lightMatrixData.byteLength
        );

        const lightData = lightPosition as Float32Array;
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            bytesPerMat4 * 2, // third matrix
            lightData.buffer,
            lightData.byteOffset,
            lightData.byteLength
        );

        // light cube
        mat4.translate(lightCube.transform, mat4.create(), lightPosition)
        meshPool.applyMeshTransform(lightCube)
    }

    meshRenderer.rebuildBundles([meshPool, ...grassSystem.getGrassPools()]);

    let debugDiv = document.getElementById('debug_div') as HTMLDivElement;

    let previousFrameTime = 0;
    let avgJsTimeMs = 0
    let avgFrameTimeMs = 0

    function frame(timeMs: number) {
        // meshPool.postRender()

        const start = performance.now();

        const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
        previousFrameTime = timeMs;

        // meshPool.postRender()

        // Sample is no longer the active page.
        if (!canvasRef) return;

        playerPos = getPositionFromTransform(playerM.transform);

        updateLight(timeMs);

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
        meshPool.applyMeshTransform(playerM);

        // reset accummulated mouse delta
        mouseDeltaX = 0;
        mouseDeltaY = 0;

        grassSystem.update(playerPos)

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
        sharedTime[0] = Math.floor(timeMs); // TODO(@darzu):         
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            bytesPerMat4 * 2 + bytesPerVec3 * 1, // TODO(@darzu): getting these offsets is a pain
            sharedTime.buffer,
            sharedTime.byteOffset,
            sharedTime.byteLength
        );
        // TODO(@darzu): SCENE FORMAT
        const displacer = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], playerT.getTransform()) as Float32Array;
        // console.log(`(${displacer[0]}, ${displacer[1]}, ${displacer[2]})`);
        device.queue.writeBuffer(
            meshRenderer.sharedUniBuffer,
            bytesPerMat4 * 2 + bytesPerVec3 * 1 + bytesPerFloat * 1,
            displacer.buffer,
            displacer.byteOffset,
            displacer.byteLength - 4
        );

        // meshPool.preRender()
        const canvasWidth = canvasRef.clientWidth;
        const canvasHeight = canvasRef.clientHeight;

        const commandEncoder = device.createCommandEncoder();
        meshRenderer.render(commandEncoder, [
            meshPool,
            ...grassSystem.getGrassPools()], canvasWidth, canvasHeight);
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);

        const jsTime = performance.now() - start;

        // weighted average
        const avgWeight = 0.05
        avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
        avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs

        const avgFPS = 1000 / avgFrameTimeMs;

        // TODO(@darzu): triangle, vertex, pixel counts
        debugDiv.innerText = `js: ${avgJsTimeMs.toFixed(2)}ms, frame: ${avgFrameTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)}`
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
//         size: mesh.positions.length * 3 * 2 * float32ByteSize,
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