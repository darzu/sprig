import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align, jitter } from "../math.js";
import { createMeshPoolBuilder, getPositionFromTransform, meshApplyUniformData, MeshHandle, MeshPool, MeshPoolBuilder, meshUniByteSizeAligned, setVertexData, vertByteSize, VertexData, VertexKind } from "./sprig_main.js";

const RENDER_GRASS = false;

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

    // TODO(@darzu): debug coloring
    const [r, g, b] = [Math.random(), Math.random(), Math.random()];
    // console.log(r, g, b) // TODO(@darzu): 

    const prevNumTris = builder.numTris;
    const prevNumVerts = builder.numVerts;

    // addTriToBuffers(
    //     [[0, 0, 0], [size, 0, 0], [0, 0, size]],
    //     [2, 1, 0],
    //     [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
    //     [[r, g, b], [r, g, b], [r, g, b]],
    //     [0, 0, 0], builder.verticesMap, builder.numVerts, vertElStride, builder.indicesMap, builder.numTris, true);

    // const vertexData = [
    //     ...[0, 0, 0], ...[0, 1, 0], ...[r, g, b],
    //     ...[size, 0, 0], ...[0, 1, 0], ...[r, g, b],
    //     ...[0, 0, size], ...[0, 1, 0], ...[r, g, b],
    // ]
    // const vOff = builder.numVerts * vertElStride;
    // console.log(vOff)
    // builder.verticesMap.set(vertexData, vOff)

    // const iOff = builder.numTris * 3;
    // console.log(iOff)
    // builder.indicesMap.set([2, 1, 0], iOff)

    // builder.numTris += 1;
    // builder.numVerts += 3;

    // const dbgMesh: MeshHandle = {
    //     vertNumOffset: prevNumVerts,
    //     indicesNumOffset: prevNumTris * 3,
    //     modelUniByteOffset: meshUniByteSizeAligned * builder.allMeshes.length,
    //     numTris: 1,

    //     // used and updated elsewhere
    //     transform: mat4.create(),

    //     pool: builder.poolHandle,
    //     // TODO(@darzu):
    //     // maxDraw: opts.maxBladeDraw,

    //     // TODO(@darzu): what're the implications of this?
    //     // shadowCaster: true,

    //     // not applicable
    //     // TODO(@darzu): make this optional?
    //     model: undefined,
    // };

    // builder.allMeshes.push(dbgMesh)

    // return dbgMesh

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
            // "make sure your diffuse colors are around 0.2, and no much brighter except for very special situations."
            // const r = (0.05 + jitter(0.02)) * 0.3
            // const g = (0.5 + jitter(0.2)) * 0.3
            // const b = (0.05 + jitter(0.02)) * 0.3

            const p1: vec3 = [x1, y1, z1];
            const p2: vec3 = [x2, y2, z2];
            const p3: vec3 = [x3, y3, z3];
            const p4: vec3 = [x4, y4, z4];

            // const norm3 = vec3.fromValues(0, 1, 0);
            const norm0 = vec3.cross(vec3.create(), [x2 - x1, y2 - y1, z2 - z1], [x3 - x1, y3 - y1, z3 - z1])
            vec3.normalize(norm0, norm0);
            // const norm3 = vec3.cross(vec3.create(), [x2 - x1, y2 - y1, z2 - z1], [x3 - x1, y3 - y1, z3 - z1])
            // const norm1 = vec3.subtract(vec3.create(), p1, p2)
            // const norm2 = vec3.subtract(vec3.create(), p2, p1)
            // vec3.normalize(norm1, norm1);
            // vec3.normalize(norm2, norm2);
            // vec3.normalize(norm3, norm3);

            const vertexData1: VertexData = [[0, 0, 0], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData2: VertexData = [[0, 0, size], [r, g, b], [0, 1, 0], VertexKind.normal]
            const vertexData3: VertexData = [[size, 0, 0], [r, g, b], [0, 1, 0], VertexKind.normal]

            const vOff = builder.numVerts * vertByteSize;
            setVertexData(builder.verticesMap, vertexData1, vOff)
            setVertexData(builder.verticesMap, vertexData2, vOff + vertByteSize)
            setVertexData(builder.verticesMap, vertexData3, vOff + vertByteSize * 2)
            // builder.verticesMap.set(vertexData, vOff)

            const iOff = builder.numTris * 3;
            builder.indicesMap.set([2 + builder.numVerts, 1 + builder.numVerts, 0 + builder.numVerts], iOff)

            builder.numTris += 1;
            builder.numVerts += 3;

            i++;
            continue;

            // addTriToBuffers(
            //     [p1, p2, p3],
            //     [0, 1, 2],
            //     // [norm1, norm2, norm3],
            //     [norm0, norm0, norm0],
            //     [
            //         // TODO(@darzu): use proper darkening
            //         // [r * 0.5, g * 0.5, b * 0.5],
            //         // [r * 0.5, g * 0.5, b * 0.5],
            //         [r, g, b],
            //         [r, g, b],
            //         [r, g, b],
            //     ],
            //     [0, 0, 1.0],
            //     builder.verticesMap,
            //     builder.numVerts,
            //     vertElStride,
            //     builder.indicesMap,
            //     builder.numTris,
            //     true);

            // builder.numTris += 1;
            // builder.numVerts += 3;

            // i++;

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
            //     grassMeshPool.verticesMap,
            //     grassMeshPool.numVerts,
            //     vertElStride,
            //     grassMeshPool.indicesMap,
            //     grassMeshPool.numTris,
            //     true);

            // grassMeshPool.numTris += 1;
            // grassMeshPool.numVerts += 3;

            // i++;
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
        // TODO(@darzu):
        // maxDraw: opts.maxBladeDraw,

        // TODO(@darzu): what're the implications of this?
        // shadowCaster: true,

        // not applicable
        // TODO(@darzu): make this optional?
        model: undefined,
    };

    // TODO(@darzu): do here?
    // builder.applyMeshMaxDraw(grassMesh)


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
    // TODO(@darzu): GRASS FORMAT
    // const totalGrassTris = totalGrass * 2;
    const builder = createMeshPoolBuilder(device, {
        maxVerts: align(totalGrassTris * 3, 4),
        maxTris: align(totalGrassTris, 4),
        maxMeshes: tileCount,
        // backfaceCulling: false,
        // usesIndices: false,
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
            // TODO(@darzu): 
            // console.log(`(${xi}, ${zi})`);
            const tile = createGrassTile(tileOpts, builder);
            mat4.translate(tile.transform, tile.transform, [x, 0, z])
            // gpuBufferWriteMeshTransform(tile)
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
        // tile
        // bladeW: 0.2,
        bladeW: 0.2,
        // bladeH: 3,
        // bladeH: 1.6,
        // bladeH: 1.5,
        bladeH: 1.8,
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
    const lod5Opts: GrassTilesetOpts = {
        ...lod1Opts,
        tilesPerSide: 8,
        bladeW: lod1Opts.bladeW * 2,
        bladeH: lod1Opts.bladeH * 2,
        spacing: lod1Opts.spacing * 32,
        tileSize: lod1Opts.tileSize * 32,
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
        // lod0Opts,
        // lod1Opts,
        // lod2Opts,
        // lod3Opts,
        // lod4Opts,
        // lod5Opts,
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

export function addTriToBuffers(
    triPos: [vec3, vec3, vec3],
    triInd: vec3,
    triNorms: [vec3, vec3, vec3],
    triColors: [vec3, vec3, vec3],
    triSwayHeights: vec3,
    verts: Float32Array, prevNumVerts: number, vertElStride: number,
    indices: Uint16Array | null, prevNumTri: number, shiftIndices = false): void {
    const vOff = prevNumVerts * vertElStride
    const iOff = prevNumTri * 3
    const indShift = shiftIndices ? prevNumVerts : 0;
    if (indices) {
        indices[iOff + 0] = triInd[0] + indShift
        indices[iOff + 1] = triInd[1] + indShift
        indices[iOff + 2] = triInd[2] + indShift
    }

    const vertexData = [
        ...triPos[0], ...triNorms[0], ...triColors[0],
        ...triPos[1], ...triNorms[1], ...triColors[1],
        ...triPos[2], ...triNorms[2], ...triColors[2],
    ]
    verts.set(vertexData, vOff)

    // // set per-face vertex data
    // // position
    // verts[vOff + 0 * vertElStride + 0] = triPos[0][0]
    // verts[vOff + 0 * vertElStride + 1] = triPos[0][1]
    // verts[vOff + 0 * vertElStride + 2] = triPos[0][2]
    // verts[vOff + 1 * vertElStride + 0] = triPos[1][0]
    // verts[vOff + 1 * vertElStride + 1] = triPos[1][1]
    // verts[vOff + 1 * vertElStride + 2] = triPos[1][2]
    // verts[vOff + 2 * vertElStride + 0] = triPos[2][0]
    // verts[vOff + 2 * vertElStride + 1] = triPos[2][1]
    // verts[vOff + 2 * vertElStride + 2] = triPos[2][2]
    // // color
    // const [r1, g1, b1] = triColors[0]
    // const [r2, g2, b2] = triColors[1]
    // const [r3, g3, b3] = triColors[2]
    // verts[vOff + 0 * vertElStride + 3] = r1
    // verts[vOff + 0 * vertElStride + 4] = g1
    // verts[vOff + 0 * vertElStride + 5] = b1
    // verts[vOff + 1 * vertElStride + 3] = r2
    // verts[vOff + 1 * vertElStride + 4] = g2
    // verts[vOff + 1 * vertElStride + 5] = b2
    // verts[vOff + 2 * vertElStride + 3] = r3
    // verts[vOff + 2 * vertElStride + 4] = g3
    // verts[vOff + 2 * vertElStride + 5] = b3
    // // normals
    // const [nx1, ny1, nz1] = triNorms[0]
    // verts[vOff + 0 * vertElStride + 6] = nx1
    // verts[vOff + 0 * vertElStride + 7] = ny1
    // verts[vOff + 0 * vertElStride + 8] = nz1
    // const [nx2, ny2, nz2] = triNorms[1]
    // verts[vOff + 1 * vertElStride + 6] = nx2
    // verts[vOff + 1 * vertElStride + 7] = ny2
    // verts[vOff + 1 * vertElStride + 8] = nz2
    // const [nx3, ny3, nz3] = triNorms[2]
    // verts[vOff + 2 * vertElStride + 6] = nx3
    // verts[vOff + 2 * vertElStride + 7] = ny3
    // verts[vOff + 2 * vertElStride + 8] = nz3
    // // sway height
    // const [y0, y1, y2] = triSwayHeights
    // verts[vOff + 0 * vertElStride + 9] = y0
    // verts[vOff + 1 * vertElStride + 9] = y1
    // verts[vOff + 2 * vertElStride + 9] = y2
}