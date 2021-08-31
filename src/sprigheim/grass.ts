import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align, jitter } from "../math.js";
import { createMeshPoolBuilder, meshApplyUniformData, MeshHandle, MeshPool, MeshPoolBuilder } from "./mesh-pool.js";
import { computeTriangleNormal, CUBE, getPositionFromTransform, Mesh, meshUniByteSizeAligned, setVertexData, vertByteSize, VertexData, VertexKind } from "./sprig-main.js";

const RENDER_GRASS = true;

export interface GrassSystem {
    getGrassPools: () => MeshPool[],
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

function addMesh(m: Mesh, builder: MeshPoolBuilder): MeshHandle {
    const vertNumOffset = builder.numVerts;
    const indicesNumOffset = builder.numTris * 3;

    const b = builder.buildMesh()
    m.pos.forEach((pos, i) => {
        b.addVertex([pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0], VertexKind.normal]);
    })
    m.tri.forEach((triInd, i) => {
        b.addTri(triInd);

        // set provoking vertex data
        const vOff = (vertNumOffset + triInd[0]) * vertByteSize
        const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
        setVertexData(builder.verticesMap, [m.pos[triInd[0]], m.colors[i], normal, VertexKind.normal], vOff)

        // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    })

    const transform = mat4.create() as Float32Array;

    const uniOffset = builder.allMeshes.length * meshUniByteSizeAligned;

    // const { min: modelMin, max: modelMax } = getAABBFromMesh(m);

    b.setUniform(transform);

    console.log(`uniOffset: ${uniOffset}`);

    // const res: MeshHandle = {
    //     vertNumOffset,
    //     indicesNumOffset,
    //     modelUniByteOffset: uniOffset,
    //     transform,
    //     modelMin,
    //     modelMax,
    //     numTris: m.tri.length,
    //     model: m,
    //     pool: builder.poolHandle,
    // }

    const res = b.finish()

    // builder.allMeshes.push(res)
    return res;
}

function createGrassTileMesh(opts: GrassTileOpts): Mesh {
    const { spacing, tileSize: size, bladeW, bladeH } = opts;

    const [r, g, b] = [Math.random(), Math.random(), Math.random()];

    const pos: vec3[] = []
    const tri: vec3[] = []
    const colors: vec3[] = []

    let i = 0;
    for (let xi = 0.0; xi < size; xi += spacing) {
        for (let zi = 0.0; zi < size; zi += spacing) {

            pos.push([xi, 0, zi])
            pos.push([xi, 0, zi + spacing])
            pos.push([xi + spacing, 0, zi])

            tri.push([0 + i * 3, 1 + i * 3, 2 + i * 3])

            colors.push([r, g, b])

            i++;
        }
    }

    return {
        pos, tri, colors,
        usesProvoking: true,
    }
}
function createGrassTile(opts: GrassTileOpts, builder: MeshPoolBuilder): MeshHandle {
    const { spacing, tileSize: size, bladeW, bladeH } = opts;
    // console.log("createGrassTile")

    const [r, g, b] = [Math.random(), Math.random(), Math.random()];

    const m = builder.buildMesh();

    let i = 0;
    for (let xi = 0.0; xi < size; xi += spacing) {
        for (let zi = 0.0; zi < size; zi += spacing) {

            const vertexData1: VertexData = [[xi, 0, zi], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData2: VertexData = [[xi, 0, zi + spacing], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData3: VertexData = [[xi + spacing, 0, zi], [r, g, b], [0, 1, 0], VertexKind.normal]

            m.addVertex(vertexData1)
            m.addVertex(vertexData2)
            m.addVertex(vertexData3)

            m.addTri([2 + i * 3, 1 + i * 3, 0 + i * 3])

            // const iOff = builder.numTris * 3;
            // builder.indicesMap.set([2 + builder.numVerts, 1 + builder.numVerts, 0 + builder.numVerts], iOff)

            // builder.numTris += 1;
            // builder.numVerts += 3;

            i++;
        }
    }

    // const uniOffset = builder.allMeshes.length * meshUniByteSizeAligned;

    // const modelMin = vec3.fromValues(-spacing, 0, -spacing);
    // const modelMax = vec3.fromValues(size * spacing, bladeH * 2, size * spacing);

    // const transform = mat4.create();
    // const f32Scratch = new Float32Array(4 * 4 + 4 + 4);
    // f32Scratch.set(transform, 0)
    // f32Scratch.set(modelMin, align(4 * 4, 4))
    // f32Scratch.set(modelMax, align(4 * 4 + 3, 4))
    // const u8Scratch = new Uint8Array(f32Scratch.buffer);

    // // console.dir({ floatBuff: f32Scratch })
    // builder.uniformMap.set(u8Scratch, uniOffset)

    // console.log(`uniOffset: ${uniOffset}`);

    // TODO(@darzu): compute correct offsets
    // const grassMesh: MeshHandle = {
    //     vertNumOffset,
    //     indicesNumOffset,
    //     modelUniByteOffset: uniOffset,
    //     numTris: i,

    //     // used and updated elsewhere
    //     transform,
    //     modelMin,
    //     modelMax,

    //     pool: builder.poolHandle,
    //     model: undefined,
    // };

    // // console.log(`tile has ${i} tris`);

    // builder.allMeshes.push(grassMesh);

    const grassMesh = m.finish()

    return grassMesh;
}

interface GrassTileset {
    pool: MeshPool,
    tiles: MeshHandle[],
    update: (target: vec3) => void,
}

function createGrassTileset(opts: GrassTilesetOpts, device: GPUDevice): GrassTileset {
    console.log("createGrassTileset")
    // create grass field
    const { spacing, tileSize, tilesPerSide } = opts;
    const grassPerTile = (tileSize / spacing) ** 2;
    const tileCount = tilesPerSide ** 2;
    const totalGrass = grassPerTile * tileCount;
    const totalGrassTris = totalGrass * 1 + 1000;
    const builder = createMeshPoolBuilder(device, {
        maxVerts: align(totalGrassTris * 3, 4),
        maxTris: align(totalGrassTris, 4),
        maxMeshes: tileCount,
    });

    const maxBladeDraw = ((tilesPerSide - 1) / 2) * tileSize
    const tileOpts: GrassTileOpts = {
        ...opts,
        maxBladeDraw
    }

    for (let xi = 0; xi < tilesPerSide; xi++) {
        for (let zi = 0; zi < tilesPerSide; zi++) {
            const x = xi * tileSize;
            const z = zi * tileSize;

            const color: vec3 = [Math.random(), Math.random(), Math.random()];
            const coloredCube: Mesh = { ...CUBE, colors: CUBE.colors.map(_ => color) }
            // TODO(@darzu): create the grass tile as a Mesh
            // const tile = addMesh(coloredCube, builder);
            // const tile = addMesh(createGrassTileMesh(tileOpts), builder);
            const tile = createGrassTile(tileOpts, builder);
            // builder.numTris += 1000;
            mat4.translate(tile.transform, tile.transform, [x, 0, z])
        }
    }

    const pool = builder.finish();

    const tiles = builder.allMeshes;

    // handle grass tile movement
    function update(target: vec3) {
        // const [tx, _, tz] = target;

        // // compute the N closest centers
        // const txi = tx / opts.tileSize;
        // const nearestXIs = nearestIntegers(txi, opts.tilesPerSide)
        // const tzi = tz / opts.tileSize;
        // const nearestZIs = nearestIntegers(tzi, opts.tilesPerSide)
        // const nearestIs: [number, number][] = []
        // for (let xi of nearestXIs)
        //     for (let zi of nearestZIs)
        //         nearestIs.push([xi, zi])

        // // compare with current positions
        // const occupied: [number, number][] = []
        // const toMoveInds: number[] = []
        // const tilePoses: vec3[] = tiles.map(t => getPositionFromTransform(t.transform))
        // for (let i = 0; i < tiles.length; i++) {
        //     const t = tiles[i]
        //     const [x, _, z] = tilePoses[i]
        //     const xi = Math.floor((x + 0.5) / opts.tileSize)
        //     const zi = Math.floor((z + 0.5) / opts.tileSize)
        //     let shouldMove = true;
        //     for (let [xi2, zi2] of nearestIs) {
        //         if (xi2 === xi && zi2 === zi) {
        //             occupied.push([xi2, zi2])
        //             shouldMove = false;
        //             break;
        //         }
        //     }
        //     if (shouldMove)
        //         toMoveInds.push(i)
        // }

        // // move those that don't match
        // for (let i of toMoveInds) {
        //     const t = tiles[i]
        //     for (let [xi1, zi1] of nearestIs) {
        //         const isOpen = !occupied.some(([xi2, zi2]) => xi2 === xi1 && zi2 === zi1)
        //         if (!isOpen)
        //             continue;
        //         // do move
        //         occupied.push([xi1, zi1])
        //         const targetPos: vec3 = [xi1 * opts.tileSize, 0, zi1 * opts.tileSize]
        //         const move = vec3.subtract(vec3.create(), targetPos, tilePoses[i])
        //         mat4.translate(t.transform, t.transform, move)
        //         // console.log(`moving (${tilePoses[i][0]}, ${tilePoses[i][1]}, ${tilePoses[i][2]}) to (${targetPos[0]}, ${targetPos[1]}, ${targetPos[2]}) via (${move[0]}, ${move[1]}, ${move[2]})`)
        //         // meshApplyUniformData(t)
        //         break;
        //     }
        // }

        let i = 0;
        for (let x = 0; x < tilesPerSide; x++) {
            for (let y = 0; y < tilesPerSide; y++) {
                // const move = vec3.subtract(vec3.create(), targetPos, tilePoses[i])
                const t = tiles[i]
                const move = vec3.fromValues(x * tileSize, 0, y * tileSize);
                mat4.translate(t.transform, mat4.create(), move)
                i++;
            }
        }

        for (let t of tiles) {
            meshApplyUniformData(t)
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

export function initGrassSystem(device: GPUDevice): GrassSystem {
    if (!RENDER_GRASS) {
        return {
            getGrassPools: () => [],
            update: () => { },
        }
    }

    const lodDebug: GrassTilesetOpts = {
        bladeW: 0.4,
        bladeH: 2,
        spacing: 0.5,
        tileSize: 4,
        tilesPerSide: 5,
    }

    // TODO(@darzu): debugging
    // const lodOpts = [lodDebug]
    const lodOpts = [
        lodDebug
    ]

    const tileset = createGrassTileset(lodDebug, device);
    // const tilesets = lodOpts.map(opts => createGrassTileset(opts, device))

    function updateAll(target: vec3) {
        tileset.update(target)
    }

    const numTris = tileset.pool.numTris;
    console.log(`Creating grass system with ${(numTris / 1000).toFixed(0)}k triangles.`);

    const res: GrassSystem = {
        getGrassPools: () => [tileset.pool],
        update: updateAll,
    }
    return res;
}
