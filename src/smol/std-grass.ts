import { ColorDef, TintsDef, applyTints } from "../color-ecs.js";
import { EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import {
  comparisonSamplerPtr,
  CY,
  linearSamplerPtr,
} from "../render/gpu-registry.js";
import { createCyStruct, CyToTS } from "../render/gpu-struct.js";
import { pointLightsPtr } from "../render/lights.js";
import { MAX_INDICES, MeshHandle } from "../render/mesh-pool.js";
import { Mesh } from "../render/mesh.js";
import {
  sceneBufPtr,
  litTexturePtr,
  surfacesTexturePtr,
  mainDepthTex,
  worldNormsAndFresTexPtr,
  unlitTexturePtr,
} from "../render/pipelines/std-scene.js";
import { shadowDepthTextures } from "../render/pipelines/std-shadow.js";
import {
  RenderableDef,
  RendererDef,
  RendererWorldFrameDef,
} from "../render/renderer-ecs.js";
import { mat4, V, vec3 } from "../sprig-matrix.js";
import { assertDbg } from "../util.js";
import { computeTriangleNormal } from "../utils-3d.js";
import { GrassMapTexPtr } from "./grass-map.js";

const MAX_GRASS_VERTS = MAX_INDICES;
const MAX_GRASS_MESHES = 500;

// TODO(@darzu): change
export const GrassVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
    normal: "vec3<f32>",
    surfaceId: "u32",
  },
  {
    isCompact: true,
    serializer: ({ position, normal, surfaceId }, _, offsets_32, views) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(normal, offsets_32[1]);
      views.u32[offsets_32[2]] = surfaceId;
    },
  }
);
export type GrassVertTS = CyToTS<typeof GrassVertStruct.desc>;

export const GrassUniStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    // TODO(@darzu): what is this for?
    // aabbMin: "vec3<f32>",
    // aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
    id: "u32",
    spawnDist: "f32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      // views.f32.set(d.aabbMin, offsets_32[1]);
      // views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[1]);
      views.u32[offsets_32[2]] = d.id;
      views.f32[offsets_32[3]] = d.spawnDist;
    },
  }
);
export type GrassUniTS = CyToTS<typeof GrassUniStruct.desc>;
export type GrassMeshHandle = MeshHandle;

function createEmptyVertexTS(): GrassVertTS {
  return {
    position: vec3.create(),
    // color: vec3.create(),
    // tangent: m.tangents ? m.tangents[i] : [1.0, 0.0, 0.0],
    normal: vec3.create(),
    // uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
    surfaceId: 0,
  };
}

const tempVertsData: GrassVertTS[] = [];
function computeGrassVertsData(
  m: Mesh,
  startIdx: number,
  count: number
): GrassVertTS[] {
  assertDbg(0 <= startIdx && startIdx + count <= m.pos.length);

  // TODO(@darzu): use resizeArray?
  while (tempVertsData.length < count)
    tempVertsData.push(createEmptyVertexTS());

  for (let vi = startIdx; vi < startIdx + count; vi++) {
    const dIdx = vi - startIdx;
    // NOTE: assignment is fine since this better not be used without being re-assigned
    tempVertsData[dIdx].position = m.pos[vi];
    // TODO(@darzu): UVs and other properties?
  }
  // NOTE: for per-face data (e.g. color and surface IDs), first all the quads then tris
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    const provVi = triInd[0];
    // is triangle relevant to changed vertices?
    if (provVi < startIdx || startIdx + count <= provVi) return;

    const dIdx = provVi - startIdx;
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    // TODO(@darzu): what to do about normals. If we're modifying verts, they need to recompute. But it might be in the mesh.
    computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]],
      tempVertsData[dIdx].normal
    );
    const faceIdx = i + m.quad.length; // quads first
    // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
    // tempVertsData[dIdx].color = m.colors[faceIdx];
    tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
  });

  m.quad.forEach((quadInd, i) => {
    // set provoking vertex data
    const provVi = quadInd[0];
    // is quad relevant to changed vertices?
    if (provVi < startIdx || startIdx + count <= provVi) return;

    const dIdx = provVi - startIdx;
    computeTriangleNormal(
      m.pos[quadInd[0]],
      m.pos[quadInd[1]],
      m.pos[quadInd[2]],
      tempVertsData[dIdx].normal
    );
    const faceIdx = i; // quads first
    // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
    // tempVertsData[dIdx].color = m.colors[faceIdx];
    tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
  });

  return tempVertsData;
}

export function computeGrassUniData(m: Mesh): GrassUniTS {
  // TODO(@darzu): change
  // const { min, max } = getAABBFromMesh(m);
  const uni: GrassUniTS = {
    transform: mat4.create(),
    // aabbMin: min,
    // aabbMax: max,
    spawnDist: 20.0, // set elsewhere
    tint: vec3.create(),
    id: 0,
  };
  return uni;
}

export const RenderDataGrassDef = EM.defineComponent(
  "renderDataGrass",
  (r: GrassUniTS) => r
);
export const grassPoolPtr = CY.createMeshPool("grassPool", {
  computeVertsData: computeGrassVertsData,
  // TODO(@darzu): per-mesh unis should maybe be optional? I don't think
  //     the grass needs them
  computeUniData: computeGrassUniData,
  vertsStruct: GrassVertStruct,
  unisStruct: GrassUniStruct,
  maxMeshes: MAX_GRASS_MESHES,
  maxSets: 1,
  setMaxTris: MAX_GRASS_VERTS,
  setMaxLines: 0, // TODO(@darzu): don't need these
  setMaxVerts: MAX_GRASS_VERTS,
  // TODO(@darzu): this dataDef is v weird
  dataDef: RenderDataGrassDef,
});

export const GrassCutTexPtr = CY.createTexture("grassCut", {
  size: [1024, 512],
  // TODO(@darzu): we want the smaller format
  format: "r32float",
  // format: "r8unorm",
});

export const renderGrassPipe = CY.createRenderPipeline("grassRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    ...shadowDepthTextures.map((tex, i) => ({
      ptr: tex,
      alias: `shadowMap${i}`,
    })),
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    // gerstnerWavesPtr,
    pointLightsPtr,
    GrassCutTexPtr,
    GrassMapTexPtr,
    // { ptr: grassJfa.sdfTex, alias: "sdf" },
  ],
  // TODO(@darzu): for perf, maybe do backface culling
  cullMode: "none",
  meshOpt: {
    pool: grassPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: unlitTexturePtr,
      clear: "never",
    },
    {
      ptr: worldNormsAndFresTexPtr,
      clear: "never",
      defaultColor: V(0, 0, 0, 0),
    },
    {
      ptr: surfacesTexturePtr,
      clear: "never",
    },
  ],
  depthStencil: mainDepthTex,
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-grass"].code}
  `,
});

const _lastTilePos = new Map<number, vec3>();

onInit((em) => {
  em.registerSystem(
    [RenderableDef, RenderDataGrassDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      const pool = res.renderer.renderer.getCyResource(grassPoolPtr)!;
      for (let o of objs) {
        let lastPos = _lastTilePos.get(o.id);
        if (!lastPos) {
          lastPos = V(Infinity, Infinity, Infinity);
          _lastTilePos.set(o.id, lastPos);
        }
        const newPos = mat4.getTranslation(o.rendererWorldFrame.transform);
        if (vec3.sqrDist(lastPos, newPos) < 0.01) {
          continue;
        }
        vec3.copy(lastPos, newPos);

        // TODO(@darzu): do we need all this for grass?
        // color / tint
        if (ColorDef.isOn(o)) {
          vec3.copy(o.renderDataGrass.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.renderDataGrass.tint);
        }
        // id
        // o.renderDataGrass.id = o.renderable.meshHandle.mId;
        // transform
        mat4.copy(o.renderDataGrass.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.renderDataGrass);
      }
    },
    "updateGrassRenderData"
  );
  em.requireSystem("updateGrassRenderData");
  em.addConstraint(["updateGrassRenderData", "after", "renderList"]);
  em.addConstraint(["updateGrassRenderData", "before", "stepRenderer"]);
});
