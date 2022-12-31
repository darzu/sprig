import { mat4, vec3 } from "../../gl-matrix.js";
import { assert } from "../../util.js";
import { computeTriangleNormal } from "../../utils-3d.js";
import { comparisonSamplerPtr, CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { pointLightsPtr } from "../lights.js";
import { MeshHandle } from "../mesh-pool.js";
import { getAABBFromMesh, Mesh } from "../mesh.js";
import { GPUBufferUsage } from "../webgpu-hacks.js";
import {
  sceneBufPtr,
  litTexturePtr,
  mainDepthTex,
  surfacesTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

const MAX_OCEAN_VERTS = 10000;
const MAX_OCEAN_MESHES = 1;

// TODO(@darzu): change
export const OceanVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    // tangent towards +u
    tangent: "vec3<f32>",
    uv: "vec2<f32>",
    surfaceId: "u32",
  },
  {
    isCompact: true,
    serializer: (
      { position, color, normal, tangent, uv, surfaceId },
      _,
      offsets_32,
      views
    ) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      views.f32.set(tangent, offsets_32[3]);
      views.f32.set(uv, offsets_32[4]);
      views.u32[offsets_32[5]] = surfaceId;
    },
  }
);
export type OceanVertTS = CyToTS<typeof OceanVertStruct.desc>;

export const OceanUniStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    aabbMin: "vec3<f32>",
    aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
    id: "u32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.aabbMin, offsets_32[1]);
      views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[3]);
      views.u32[offsets_32[4]] = d.id;
    },
  }
);
export type OceanUniTS = CyToTS<typeof OceanUniStruct.desc>;
export type OceanMeshHandle = MeshHandle;

const MAX_GERSTNER_WAVES = 8;

export const GerstnerWaveStruct = createCyStruct(
  {
    D: "vec2<f32>",
    Q: "f32",
    A: "f32",
    w: "f32",
    phi: "f32",
    // TODO: solve alignment issues--shouldn't need manual padding
    padding1: "f32",
    padding2: "f32",
  },
  {
    isUniform: true,
    hackArray: true,
  }
);

export type GerstnerWaveTS = CyToTS<typeof GerstnerWaveStruct.desc>;

export const gerstnerWavesPtr = CY.createArray("gerstnerWave", {
  struct: GerstnerWaveStruct,
  init: MAX_GERSTNER_WAVES,
  forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

export const oceanVertsPtr = CY.createArray("oceanVertsBuf", {
  struct: OceanVertStruct,
  init: MAX_OCEAN_VERTS,
});

const oceanTriIndsPtr = CY.createIdxBuf("oceanTriIndsBuf", {
  init: () => MAX_OCEAN_VERTS * 3,
});

const oceanLineIndsPtr = CY.createIdxBuf("oceanLineIndsBuf", {
  init: () => MAX_OCEAN_VERTS * 2,
});

const oceanUnisPtr = CY.createArray("oceanUni", {
  struct: OceanUniStruct,
  init: MAX_OCEAN_MESHES,
});

// TODO(@darzu): de-duplicate with std-scene's computeVertsData
function computeOceanVertsData(
  m: Mesh,
  // TODO(@darzu): this isn't implemented right; needs to account for startIdx and count
  startIdx: number,
  count: number
): OceanVertTS[] {
  assert(!!m.normals, "ocean meshes assumed to have normals");
  assert(!!m.tangents, "ocean meshes assumed to have tangents");
  // TODO(@darzu): change
  const vertsData: OceanVertTS[] = m.pos.map((pos, i) => ({
    position: pos,
    color: [1.0, 0.0, 1.0], // per-face; changed below
    tangent: m.tangents![i],
    normal: m.normals![i],
    uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
    surfaceId: 0, // per-face; changed below
  }));
  // TODO: compute tangents here? right now tangents are wrong if we
  // update vertex positions on the CPU
  // TODO(@darzu): think about htis
  m.quad.forEach((quadInd, i) => {
    // TODO(@darzu): this isn't right, colors and surfaceIds r being indexed by tris and quads
    vertsData[quadInd[0]].color = m.colors[i];
    vertsData[quadInd[0]].surfaceId = m.surfaceIds[i];
  });
  return vertsData;
}

export function computeOceanUniData(m: Mesh): OceanUniTS {
  // TODO(@darzu): change
  const { min, max } = getAABBFromMesh(m);
  const uni: OceanUniTS = {
    transform: mat4.create(),
    aabbMin: min,
    aabbMax: max,
    tint: vec3.create(),
    id: 0,
  };
  return uni;
}

export const oceanPoolPtr = CY.createMeshPool("oceanPool", {
  computeVertsData: computeOceanVertsData,
  // TODO(@darzu): per-mesh unis should maybe be optional? I don't think
  //     the ocean needs them
  computeUniData: computeOceanUniData,
  vertsPtr: oceanVertsPtr,
  unisPtr: oceanUnisPtr,
  triIndsPtr: oceanTriIndsPtr,
  lineIndsPtr: oceanLineIndsPtr,
});

export const renderOceanPipe = CY.createRenderPipeline("oceanRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    ...shadowDepthTextures.map((tex, i) => ({
      ptr: tex,
      alias: `shadowMap${i}`,
    })),
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    gerstnerWavesPtr,
    pointLightsPtr,

    // { ptr: oceanJfa.sdfTex, alias: "sdf" },
  ],
  // TODO(@darzu): for perf, maybe do backface culling
  cullMode: "none",
  meshOpt: {
    pool: oceanPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
    },
    {
      ptr: surfacesTexturePtr,
      clear: "never",
    },
  ],
  depthStencil: mainDepthTex,
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-ocean"].code}
  `,
});
