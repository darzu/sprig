import { mat4, vec3 } from "../../gl-matrix.js";
import { computeTriangleNormal } from "../../utils-3d.js";
import { CY } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { getAABBFromMesh, Mesh } from "../mesh.js";
import { sceneBufPtr, litTexturePtr, mainDepthTex } from "./std-scene.js";

const MAX_OCEAN_VERTS = 10000;
const MAX_OCEAN_MESHES = 1;

// TODO(@darzu): change
export const OceanVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    uv: "vec2<f32>",
    surfaceId: "u32",
  },
  {
    isCompact: true,
    serializer: (
      { position, color, normal, uv, surfaceId },
      _,
      offsets_32,
      views
    ) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      views.f32.set(uv, offsets_32[3]);
      views.u32[offsets_32[4]] = surfaceId;
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

const oceanVertsPtr = CY.createArray("oceanVertsBuf", {
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

function computeOceanVertsData(m: Mesh): OceanVertTS[] {
  // TODO(@darzu): change
  const vertsData: OceanVertTS[] = m.pos.map((pos, i) => ({
    position: pos,
    color: [1.0, 0.0, 1.0], // per-face; changed below
    normal: [1.0, 0.0, 0.0], // per-face; changed below
    uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
    surfaceId: 0, // per-face; changed below
  }));
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    const normal = computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]]
    );
    vertsData[triInd[0]].normal = normal;
    vertsData[triInd[0]].color = m.colors[i];
    vertsData[triInd[0]].surfaceId = m.surfaceIds[i];
  });
  m.quad.forEach((quadInd, i) => {
    // set provoking vertex data
    const normal = computeTriangleNormal(
      m.pos[quadInd[0]],
      m.pos[quadInd[1]],
      m.pos[quadInd[2]]
    );
    vertsData[quadInd[0]].normal = normal;
    // TODO(@darzu): this isn't right, colors and surfaceIds r being indexed by tris and quads
    vertsData[quadInd[0]].color = m.colors[i];
    vertsData[quadInd[0]].surfaceId = m.surfaceIds[i];
  });
  return vertsData;
}

function computeOceanUniData(m: Mesh): OceanUniTS {
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
    // { ptr: oceanJfa.sdfTex, alias: "sdf" },
  ],
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
  ],
  depthStencil: mainDepthTex,
  shader: "std-ocean",
});
