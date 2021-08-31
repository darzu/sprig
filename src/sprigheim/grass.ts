import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align, jitter } from "../math.js";
import { createMeshPoolBuilder, meshApplyUniformData, MeshHandle, MeshPool, MeshPoolBuilder } from "./mesh-pool.js";
import { getPositionFromTransform, meshUniByteSizeAligned, setVertexData, vertByteSize, VertexData, VertexKind } from "./sprig-main.js";

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

function createGrassTile(opts: GrassTileOpts, builder: MeshPoolBuilder): MeshHandle {
    const { spacing, tileSize: size, bladeW, bladeH } = opts;
    console.log("createGrassTile")

    const [r, g, b] = [Math.random(), Math.random(), Math.random()];

    const prevNumTris = builder.numTris;
    const prevNumVerts = builder.numVerts;

    let i = 0;
    for (let xi = 0.0; xi < size; xi += spacing) {
        for (let zi = 0.0; zi < size; zi += spacing) {

            const vertexData1: VertexData = [[xi, 0, zi], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData2: VertexData = [[xi, 0, zi + spacing], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData3: VertexData = [[xi + spacing, 0, zi], [r, g, b], [0, 1, 0], VertexKind.normal]

            const vOff = builder.numVerts * vertByteSize;
            setVertexData(builder.verticesMap, vertexData1, vOff)
            setVertexData(builder.verticesMap, vertexData2, vOff + vertByteSize)
            setVertexData(builder.verticesMap, vertexData3, vOff + vertByteSize * 2)

            const iOff = builder.numTris * 3;
            builder.indicesMap.set([2 + builder.numVerts, 1 + builder.numVerts, 0 + builder.numVerts], iOff)

            builder.numTris += 1;
            builder.numVerts += 3;

            i++;
            continue;
        }
    }

    // TODO(@darzu): compute correct offsets
    const grassMesh: MeshHandle = {
        vertNumOffset: prevNumVerts,
        indicesNumOffset: prevNumTris * 3,
        modelUniByteOffset: meshUniByteSizeAligned * builder.allMeshes.length,
        numTris: i,

        // used and updated elsewhere
        transform: mat4.create(),
        modelMin: vec3.fromValues(-spacing, 0, -spacing),
        modelMax: vec3.fromValues(size * spacing, bladeH * 2, size * spacing),

        pool: builder.poolHandle,
        model: undefined,
    };


    builder.allMeshes.push(grassMesh);

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
    const totalGrassTris = totalGrass * 1;
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
            const tile = createGrassTile(tileOpts, builder);
            mat4.translate(tile.transform, tile.transform, [x, 0, z])
        }
    }

    const pool = builder.finish();

    const tiles = builder.allMeshes;

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
                meshApplyUniformData(t)
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

export function initGrassSystem(device: GPUDevice): GrassSystem {
    if (!RENDER_GRASS) {
        return {
            getGrassPools: () => [],
            update: () => { },
        }
    }

    // TODO(@darzu): try upside down triangles
    const lod1Opts: GrassTilesetOpts = {
        bladeW: 0.2,
        bladeH: 1.8,
        spacing: 0.25,
        tileSize: 16,
        tilesPerSide: 5,
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

    const tilesets = lodOpts.map(opts => createGrassTileset(opts, device))

    function updateAll(target: vec3) {
        tilesets.forEach(t => t.update(target))
    }

    const numTris = tilesets.map(s => s.pool.numTris).reduce((p, n) => p + n, 0)
    console.log(`Creating grass system with ${(numTris / 1000).toFixed(0)}k triangles.`);

    const res: GrassSystem = {
        getGrassPools: () => tilesets.map(t => t.pool),
        update: updateAll,
    }
    return res;
}
