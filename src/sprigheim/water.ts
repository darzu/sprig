
/*
WATER

Approach:
    mesh defining surface of water
    different LODs of that mesh
    vertices displaced using displacement map
*/

const ENABLE_WATER = false;

import { computeTriangleNormal } from "../3d-util.js";
import { mat4, vec3 } from "../ext/gl-matrix.js";
import { createMeshPoolBuilder_WebGPU, MeshHandle, MeshPool, MeshPool_WebGPU, MeshUniform, Vertex } from "./mesh-pool.js";

export interface WaterSystem {
    getMeshPools: () => MeshPool_WebGPU[],
}

export function createWaterSystem(device: GPUDevice): WaterSystem {
    if (!ENABLE_WATER)
        return { getMeshPools: () => [] }

    const mapXSize = 100;
    const mapZSize = 100;
    const mapArea = mapXSize * mapZSize;

    const idx = (xi: number, zi: number) => zi * mapXSize + xi

    const map = new Float32Array(mapXSize * mapZSize);
    for (let x = 0; x < mapXSize; x++) {
        for (let z = 0; z < mapZSize; z++) {
            const i = idx(x, z)
            map[i] = 0; // Math.sin(x * 0.5) + Math.cos(z) // TODO(@darzu): 
            // map[i] = Math.random() * 2 + x * 0.02 + z * 0.04 - 10 // TODO(@darzu):
        }
    }

    const builder = createMeshPoolBuilder_WebGPU(device, {
        maxMeshes: 1,
        maxTris: mapArea * 2,
        maxVerts: mapArea * 2,
    })

    // const idx = (xi: number, zi: number) => clamp(zi, 0, mapZSize - 1) * mapXSize + clamp(xi, 0, mapXSize - 1)

    const color1: vec3 = [0.1, 0.3, 0.5]
    const color2: vec3 = color1
    // const color2: vec3 = [0.1, 0.5, 0.3]
    // const color: vec3 = [Math.random(), Math.random(), Math.random()]

    const spacing = 1.0;
    const maxHeight = 10.0; // TODO(@darzu): compute?

    for (let xi = 0; xi < mapXSize; xi++) {
        for (let zi = 0; zi < mapZSize; zi++) {

            let y = map[idx(xi, zi)];
            let yX0 = map[idx(xi - 1, zi)];
            let yX2 = map[idx(xi + 1, zi)];
            let yZ0 = map[idx(xi, zi - 1)];
            let yZ2 = map[idx(xi, zi + 1)];

            const x = xi * spacing;
            const z = zi * spacing;

            const p0: vec3 = [x, y, z]
            const p1: vec3 = [x - 1, yX0, z]
            const p2: vec3 = [x, yZ0, z - 1]

            const norm1 = computeTriangleNormal(p0, p2, p1);

            const p3: vec3 = [x + 1, yX2, z]
            const p4: vec3 = [x, yZ2, z + 1]

            const norm2 = computeTriangleNormal(p0, p4, p3);

            // TODO(@darzu): compute normal
            const kind = Vertex.Kind.water;

            const vOff = builder.numVerts * Vertex.ByteSize;
            // builder.verticesMap.set(vertexData, vOff)
            Vertex.Serialize(builder.verticesMap, vOff, [x, y, z], color1, norm1, kind)
            Vertex.Serialize(builder.verticesMap, vOff + Vertex.ByteSize, [x, y, z], color2, norm2, kind)

            builder.numVerts += 2;
            // builder.numVerts += 1;

            // const vertexData = [
            //     ...[xi, y, zi], ...color, ...[0, 1, 0],
            //     ...[xi + 1, y, zi], ...color, ...[0, 1, 0],
            //     ...[xi, y, zi + 1], ...color, ...[0, 1, 0],
            // ]
            // const vOff = builder.numVerts * vertElStride;
            // builder.verticesMap.set(vertexData, vOff)

            // const iOff = builder.numTris * 3;
            // // builder.indicesMap.set([2, 1, 0], iOff)
            // builder.indicesMap.set([2 + builder.numVerts, 1 + builder.numVerts, 0 + builder.numVerts], iOff)

            // builder.numVerts += 3;
        }
    }

    for (let xi = 1; xi < mapXSize - 1; xi++) {
        for (let zi = 1; zi < mapZSize - 1; zi++) {
            let i0 = idx(xi, zi) * 2;
            let i1 = idx(xi - 1, zi) * 2;
            let i2 = idx(xi, zi - 1) * 2;

            builder.indicesMap.set([i0, i1, i2], builder.numTris * 3)
            builder.numTris += 1;

            let i3 = idx(xi, zi) * 2 + 1;
            let i4 = idx(xi + 1, zi) * 2 + 1;
            let i5 = idx(xi, zi + 1) * 2 + 1;

            builder.indicesMap.set([i3, i4, i5], builder.numTris * 3)
            builder.numTris += 1;
        }
    }

    const prevNumVerts = 0;
    const prevNumTris = 0;
    const waterMesh: MeshHandle = {
        vertNumOffset: prevNumVerts,
        indicesNumOffset: prevNumTris * 3,
        modelUniByteOffset: MeshUniform.ByteSizeAligned * builder.allMeshes.length,
        numTris: builder.numTris,

        // used and updated elsewhere
        transform: mat4.create(),
        aabbMin: vec3.fromValues(0, 0, 0),
        aabbMax: vec3.fromValues(mapXSize * spacing, maxHeight, mapZSize * spacing),

        pool: builder.poolHandle,
        // TODO(@darzu):
        // maxDraw: opts.maxBladeDraw,

        // TODO(@darzu): what're the implications of this?
        // shadowCaster: true,

        // not applicable
        // TODO(@darzu): make this optional?
        model: undefined,
    };
    console.dir(waterMesh)
    builder.allMeshes.push(waterMesh)

    // builder.addMesh(CUBE)

    const pool = builder.finish();

    // initial position
    mat4.translate(waterMesh.transform, waterMesh.transform, [-(mapXSize * spacing) * 0.5, -4, -(mapZSize * spacing) * 0.5])

    // TODO(@darzu): these could be done while the builder has mapped buffers
    pool.allMeshes.forEach(m => pool.updateUniform(m));
    // pool.allMeshes.forEach(m => meshApplyMinMaxPos(m));

    const water: WaterSystem = {
        getMeshPools: () => [pool]
    };

    return water;
}