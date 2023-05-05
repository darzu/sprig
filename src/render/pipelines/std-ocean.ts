import { ColorDef, TintsDef, applyTints } from "../../color/color-ecs.js";
import { EM, EntityW } from "../../ecs/entity-manager.js";
import { onInit } from "../../init.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../../matrix/sprig-matrix.js";
import { assert } from "../../utils/util.js";
import { computeTriangleNormal } from "../../utils/utils-3d.js";
import { comparisonSamplerPtr, CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { pointLightsPtr } from "../lights.js";
import { MAX_INDICES, MeshHandle } from "../mesh-pool.js";
import { getAABBFromMesh, Mesh } from "../../meshes/mesh.js";
import {
  RenderableDef,
  RendererDef,
  RendererWorldFrameDef,
} from "../renderer-ecs.js";
import { GPUBufferUsage } from "../webgpu-hacks.js";
import {
  sceneBufPtr,
  litTexturePtr,
  mainDepthTex,
  surfacesTexturePtr,
  worldNormsAndFresTexPtr,
  unlitTexturePtr,
  positionsTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

const MAX_OCEAN_VERTS = MAX_INDICES;
const MAX_OCEAN_MESHES = 1;

// TODO(@darzu): change
export const OceanVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
    // TODO(@darzu): PERF. don't need per-vertex color..
    color: "vec3<f32>",
    normal: "vec3<f32>",
    // tangent towards +u
    // TODO(@darzu): should be able to reconstruct?
    tangent: "vec3<f32>",
    uv: "vec2<f32>",
    // TODO(@darzu): shouldn't need surface
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

const MAX_GERSTNER_WAVES = 12;

export const GerstnerWaveStruct = createCyStruct(
  {
    D: "vec2<f32>",
    Q: "f32",
    A: "f32",
    w: "f32",
    phi: "f32",
    // used to reduce this wave's normal contribution, otherwise small detailed waves dominate
    // TODO(@darzu): is this a hack?
    normalWeight: "f32",
    // TODO(@darzu): HACK! solve alignment issues--shouldn't need manual padding
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
    color: V(1.0, 0.0, 1.0), // per-face; changed below
    tangent: m.tangents![i],
    normal: m.normals![i],
    uv: m.uvs ? m.uvs[i] : vec2.fromValues(0.0, 0.0),
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

export const RenderDataOceanDef = EM.defineComponent(
  "renderDataOcean",
  (r: OceanUniTS) => r
);
export const oceanPoolPtr = CY.createMeshPool("oceanPool", {
  computeVertsData: computeOceanVertsData,
  // TODO(@darzu): per-mesh unis should maybe be optional? I don't think
  //     the ocean needs them
  computeUniData: computeOceanUniData,
  unisStruct: OceanUniStruct,
  vertsStruct: OceanVertStruct,
  maxMeshes: MAX_OCEAN_MESHES,
  maxSets: 1,
  setMaxTris: MAX_OCEAN_VERTS * 2,
  setMaxLines: MAX_OCEAN_VERTS, // TODO(@darzu): don't need ??!
  setMaxVerts: MAX_OCEAN_VERTS,
  // TODO(@darzu): this dataDef is v weird
  dataDef: RenderDataOceanDef,
});

export const renderOceanPipe = CY.createRenderPipeline("oceanRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    gerstnerWavesPtr,
    pointLightsPtr,

    // { ptr: oceanJfa.sdfTex, alias: "sdf" },
  ],
  // TODO(@darzu): for perf, maybe do backface culling
  cullMode: "back",
  meshOpt: {
    pool: oceanPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: unlitTexturePtr,
      clear: "never",
      // clear: "always",
    },
    {
      ptr: worldNormsAndFresTexPtr,
      clear: "never",
      // clear: "always",
    },
    {
      ptr: positionsTexturePtr,
      clear: "never",
      // clear: "always",
    },
    {
      ptr: surfacesTexturePtr,
      clear: "never",
      // clear: "always",
    },
  ],
  depthStencil: mainDepthTex,
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-gerstner"].code}
  ${shaderSet["std-ocean"].code}
  `,
});

// export const RenderDataOceanDef = EM.defineComponent(
//   "renderDataOcean",
//   (r: OceanUniTS) => r
// );

onInit((em) => {
  em.registerSystem(
    [RenderableDef, RenderDataOceanDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      const pool = res.renderer.renderer.getCyResource(oceanPoolPtr)!;
      for (let o of objs) {
        // color / tint
        if (ColorDef.isOn(o)) {
          vec3.copy(o.renderDataOcean.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.renderDataOcean.tint);
        }

        // id
        o.renderDataOcean.id = o.renderable.meshHandle.mId;

        // transform
        mat4.copy(o.renderDataOcean.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.renderDataOcean);
      }
    },
    "updateOceanRenderData"
  );
  em.requireSystem("updateOceanRenderData");
  em.addConstraint(["updateOceanRenderData", "after", "renderList"]);
  em.addConstraint(["updateOceanRenderData", "before", "stepRenderer"]);
});
