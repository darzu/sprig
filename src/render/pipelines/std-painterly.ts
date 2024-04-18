import { ColorDef, TintsDef, applyTints } from "../../color/color-ecs.js";
import { EM } from "../../ecs/entity-manager.js";
import { Phase } from "../../ecs/sys-phase.js";
import { V3, mat4 } from "../../matrix/sprig-matrix.js";
import {
  CY,
  comparisonSamplerPtr,
  nearestSamplerPtr,
} from "../gpu-registry.js";
import { CyToTS, createCyStruct } from "../gpu-struct.js";
import { pointLightsPtr } from "../lights.js";
import { MAX_INDICES } from "../mesh-pool.js";
import { PAINTERLY_JFA_PRE_PASS_MASK } from "../pipeline-masks.js";
import {
  RenderableDef,
  RendererWorldFrameDef,
  RendererDef,
} from "../renderer-ecs.js";
import {
  sceneBufPtr,
  mainDepthTex,
  computeVertsData,
  VertexStruct,
  surfacesTexturePtr,
  canvasTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";
import { createJfaPipelines } from "./std-jump-flood.js";
import { fullQuad } from "../gpu-helper.js";

/*
(Possible) Advantages of points (and maybe lines):
  Different authoring than triangles; easier to describe an organice tree w/ points perhaps
  Possibly easier to get point cloud from SDF created objects
  Useful for debugging?
  Good for particles?

Ideas: JFA sizing based on perspective/distance?

Maybe use another JFA to calc "distance until occluded" and then smooth out the radius of that point
*/

const MAX_MESHES = 1000;
const MAX_VERTICES = MAX_INDICES;

export const PainterlyUniStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    tint: "vec3<f32>",
    id: "u32",
    flags: "u32",
    size: "f32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.tint, offsets_32[1]);
      views.u32[offsets_32[2]] = d.id;
      views.u32[offsets_32[3]] = d.flags;
      views.f32[offsets_32[4]] = d.size;
    },
    create: () => ({
      transform: mat4.create(),
      tint: V3.mk(),
      id: 0,
      flags: 0,
      size: 1,
    }),
  }
);

export const FLAG_BACKFACE_CULL = 0b1;

export type PainterlyUniTS = CyToTS<typeof PainterlyUniStruct.desc>;

export const PainterlyUniDef = EM.defineNonupdatableComponent(
  "painterlyUni",
  (r: Partial<PainterlyUniTS>) => PainterlyUniStruct.fromPartial(r)
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const painterlyLineMeshPoolPtr = CY.createMeshPool(
  "painterlyLineMeshPool",
  {
    computeVertsData,
    vertsStruct: VertexStruct,
    unisStruct: PainterlyUniStruct,
    maxMeshes: MAX_MESHES,
    maxSets: 5,
    setMaxPrims: MAX_VERTICES,
    setMaxVerts: MAX_VERTICES,
    dataDef: PainterlyUniDef,
    prim: "line",
  }
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const painterlyPointMeshPoolPtr = CY.createMeshPool(
  "painterlyPointMeshPool",
  {
    computeVertsData,
    vertsStruct: VertexStruct,
    unisStruct: PainterlyUniStruct,
    maxMeshes: MAX_MESHES,
    maxSets: 5,
    setMaxPrims: MAX_VERTICES,
    setMaxVerts: MAX_VERTICES,
    dataDef: PainterlyUniDef,
    prim: "point",
  }
);

export const painterlyJfaMaskTex = CY.createTexture("painterlyJfaMask", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  // format: "rgba8unorm",
  format: "rg16float", // TODO(@darzu): PERF. Should probably be able to get away with 1 8bit unorm for size.. maybe 16
});
export const painterlyLitTex = CY.createTexture("painterlyLit", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba8unorm",
});

const painterlyMainPass = {
  globals: [
    sceneBufPtr,
    pointLightsPtr,
    { ptr: shadowDepthTextures, alias: "shadowMap" },
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
  ],
  cullMode: "back",
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: painterlyJfaMaskTex,
      clear: "once",
    },
    {
      ptr: painterlyLitTex,
      clear: "once",
    },
    // // TODO(@darzu): remove one
    // {
    //   ptr: litTexturePtr,
    //   clear: "never",
    //   blend: {
    //     color: {
    //       srcFactor: "src-alpha",
    //       dstFactor: "one-minus-src-alpha",
    //       operation: "add",
    //     },
    //     alpha: {
    //       srcFactor: "constant",
    //       dstFactor: "zero",
    //       operation: "add",
    //     },
    //   },
    // },
    // { ptr: surfacesTexturePtr, clear: "once" },
  ],
  depthStencil: mainDepthTex,
  depthCompare: "always",
  // depthCompare: "less-equal",
} as const;

export const painterlyLinePrepass = CY.createRenderPipeline(
  "painterlyLinePrepass",
  {
    globals: [sceneBufPtr],
    cullMode: "none",
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    output: [
      {
        ptr: surfacesTexturePtr,
        clear: "never",
      },
    ],
    depthStencil: mainDepthTex,
    shader: "std-painterly-prepass",
    meshOpt: {
      meshMask: PAINTERLY_JFA_PRE_PASS_MASK,
      pool: painterlyLineMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "line-list",
  }
);
export const painterlyPointPrepass = CY.createRenderPipeline(
  "painterlyPointPrepass",
  {
    ...painterlyLinePrepass,
    meshOpt: {
      meshMask: PAINTERLY_JFA_PRE_PASS_MASK,
      pool: painterlyPointMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "point-list",
  }
);

export const painterlyLineMainPass = CY.createRenderPipeline(
  "painterlyLineMainPipe",
  {
    ...painterlyMainPass,
    meshOpt: {
      pool: painterlyLineMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "line-list",
    shader: (s) =>
      `
    ${s["std-painterly-main"].code}
    `,
  }
);

export const painterlyPointMainPass = CY.createRenderPipeline(
  "painterlyPointMainPipe",
  {
    ...painterlyMainPass,
    meshOpt: {
      pool: painterlyPointMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "point-list",
    shader: (s) =>
      `
    ${s["std-painterly-main"].code}
    `,
  }
);

EM.addEagerInit([PainterlyUniDef], [], [], () => {
  EM.addSystem(
    "updatePainterlyUni",
    Phase.RENDER_PRE_DRAW,
    [RenderableDef, PainterlyUniDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      for (let o of objs) {
        const pool = o.renderable.meshHandle.pool;
        // console.log("painterlyUni: " + o.id);

        // color / tint
        if (ColorDef.isOn(o)) {
          V3.copy(o.painterlyUni.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.painterlyUni.tint);
        }

        // id
        // TODO(@darzu): set at construct time?
        // o.painterlyUni.id = o.renderable.meshHandle.mId;

        // transform
        mat4.copy(o.painterlyUni.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.painterlyUni);
      }
    }
  );
});

export const painterlyJfa = createJfaPipelines({
  name: "painterlyJfa",
  maskTex: painterlyJfaMaskTex,
  maskMode: "interior",
  maxDist: 64,
  sizeToCanvas: true,
  stepAscending: true,
  shader: (shaders) => `
    ${shaders["std-helpers"].code}
    ${shaders["std-screen-quad-vert"].code}
    ${shaders["std-painterly-jfa"].code}
  `,
  shaderExtraGlobals: [
    { ptr: painterlyJfaMaskTex, alias: "maskTex" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
    { ptr: mainDepthTex, alias: "depthTex" },
    sceneBufPtr,
  ],
});

// TODO(@darzu): PERF! As of right now, tHis is super expensive. Like ~20ms sometimes :/
export const painterlyDeferredPipe = CY.createRenderPipeline(
  "painterlyDeferredPipe",
  {
    globals: [
      // { ptr: linearSamplerPtr, alias: "samp" },
      { ptr: nearestSamplerPtr, alias: "samp" },
      { ptr: painterlyJfa.voronoiTex, alias: "voronoiTex" },
      { ptr: painterlyLitTex, alias: "colorTex" },
      { ptr: fullQuad, alias: "quad" },
      sceneBufPtr,
    ],
    meshOpt: {
      vertexCount: 6,
      stepMode: "single-draw",
    },
    output: [
      {
        ptr: canvasTexturePtr,
        clear: "once",
      },
    ],
    shader: (shaderSet) => `
  ${shaderSet["std-helpers"].code}
  ${shaderSet["std-screen-quad-vert"].code}
  ${shaderSet["std-painterly-deferred"].code}
  `,
    shaderFragmentEntry: "frag_main",
    shaderVertexEntry: "vert_main",
  }
);
