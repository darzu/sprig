import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align, jitter } from "../math.js";
import { createMeshPoolBuilder, MeshHandle, MeshPool, MeshPoolBuilder } from "./mesh-pool.js";
import { getPositionFromTransform, VertexKind } from "./sprig-main.js";

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

    // TODO(@darzu): debug coloring
    const [r, g, b] = [Math.random(), Math.random(), Math.random()];

    const m = builder.buildMesh();

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

            const norm0 = vec3.cross(vec3.create(), [x2 - x1, y2 - y1, z2 - z1], [x3 - x1, y3 - y1, z3 - z1])
            vec3.normalize(norm0, norm0);

            m.addVertex(p1, [r, g, b], norm0, VertexKind.normal)
            m.addVertex(p2, [r, g, b], norm0, VertexKind.normal)
            m.addVertex(p3, [r, g, b], norm0, VertexKind.normal)
            m.addTri([2 + i * 3, 1 + i * 3, 0 + i * 3])

            i++;
            continue;
        }
    }

    const aabbMin: vec3 = vec3.fromValues(-spacing, 0, -spacing);
    const aabbMax: vec3 = vec3.fromValues(size + spacing, bladeH * 2, size + spacing);

    m.setUniform(mat4.create(), aabbMin, aabbMax);

    const grassMesh = m.finish();

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
            builder.updateUniform(tile);
        }
    }

    const pool = builder.finish();

    const tiles = pool.allMeshes;

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
                pool.updateUniform(t)
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
    const start = performance.now()

    // TODO(@darzu): try upside down triangles
    const lod1Opts: GrassTilesetOpts = {
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
        // lodDebug
        // lod0Opts,
        lod1Opts,
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
    console.log(`Created grass system with ${(numTris / 1000).toFixed(0)}k triangles in ${(performance.now() - start).toFixed(0)}ms.`);

    const res: GrassSystem = {
        getGrassPools: () => tilesets.map(t => t.pool),
        update: updateAll,
    }
    return res;
}
