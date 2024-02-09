import { ColorDef, TintsDef, applyTints } from "../../color/color-ecs.js";
import { EM } from "../../ecs/entity-manager.js";
import { Phase } from "../../ecs/sys-phase.js";
import { mat4 } from "../../matrix/gl-matrix.js";
import { V3 } from "../../matrix/sprig-matrix.js";
import { CY, comparisonSamplerPtr } from "../gpu-registry.js";
import { CyToTS, createCyStruct } from "../gpu-struct.js";
import { pointLightsPtr } from "../lights.js";
import { MAX_INDICES } from "../mesh-pool.js";
import { DEFAULT_MASK, JFA_PRE_PASS_MASK } from "../pipeline-masks.js";
import {
  RenderableDef,
  RendererWorldFrameDef,
  RendererDef,
} from "../renderer-ecs.js";
import { oceanPoolPtr } from "./std-ocean.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  unlitTexturePtr,
  mainDepthTex,
  litTexturePtr,
  computeVertsData,
  VertexStruct,
  surfacesTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

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

export const PointsUniStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    tint: "vec3<f32>",
    id: "u32",
    flags: "u32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.tint, offsets_32[1]);
      views.u32[offsets_32[2]] = d.id;
      views.u32[offsets_32[3]] = d.flags;
    },
  }
);

export const FLAG_BACKFACE = 0b1;

export type PointsUniTS = CyToTS<typeof PointsUniStruct.desc>;

export const LineRenderDataDef = EM.defineNonupdatableComponent(
  "lineRenderData",
  (r: PointsUniTS) => r
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const lineMeshPoolPtr = CY.createMeshPool("lineMeshPool", {
  computeVertsData,
  vertsStruct: VertexStruct,
  unisStruct: PointsUniStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: LineRenderDataDef,
  prim: "line",
});

export const PointRenderDataDef = EM.defineNonupdatableComponent(
  "pointRenderData",
  (r: PointsUniTS) => r
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const pointMeshPoolPtr = CY.createMeshPool("pointMeshPool", {
  computeVertsData,
  vertsStruct: VertexStruct,
  unisStruct: PointsUniStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: PointRenderDataDef,
  prim: "point",
});

export const xpPointMaskTex = CY.createTexture("xpPointMask", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba8unorm",
});
export const xpPointLitTex = CY.createTexture("xpPointLit", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba8unorm",
});

const voronoiPointLine = {
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
      ptr: xpPointMaskTex,
      clear: "once",
    },
    {
      ptr: xpPointLitTex,
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

export const stdLinePrepassPipe = CY.createRenderPipeline(
  "stdLinePrepassPipe",
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
    shader: "std-point-pre",
    meshOpt: {
      meshMask: JFA_PRE_PASS_MASK,
      pool: lineMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "line-list",
  }
);
export const stdPointPrepassPipe = CY.createRenderPipeline(
  "stdPointPrepassPipe",
  {
    ...stdLinePrepassPipe,
    meshOpt: {
      meshMask: JFA_PRE_PASS_MASK,
      pool: pointMeshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    topology: "point-list",
  }
);

export const stdLinesRender = CY.createRenderPipeline("stdLinesRender", {
  ...voronoiPointLine,
  meshOpt: {
    pool: lineMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "line-list",
  // fragOverrides: {
  //   backface: false, // TODO(@darzu): can this be a bool??
  // },
  shader: (s) => {
    return `
    const backface = false;
    ${s["std-point"].code}
    `;
  },
});

EM.addEagerInit([LineRenderDataDef], [], [], () => {
  EM.addSystem(
    "updateLineRenderData",
    Phase.RENDER_PRE_DRAW,
    [RenderableDef, LineRenderDataDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      const pool = res.renderer.renderer.getCyResource(lineMeshPoolPtr)!;
      for (let o of objs) {
        // console.log("updateLineRenderData: " + o.id);

        // color / tint
        if (ColorDef.isOn(o)) {
          V3.copy(o.lineRenderData.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.lineRenderData.tint);
        }

        // transform
        mat4.copy(o.lineRenderData.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.lineRenderData);
      }
    }
  );
});

export const stdPointsRender = CY.createRenderPipeline("stdPointsRender", {
  ...voronoiPointLine,
  meshOpt: {
    pool: pointMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "point-list",
  shader: (s) => {
    return `
    const backface = true;
    ${s["std-point"].code}
    `;
  },
});

EM.addEagerInit([PointRenderDataDef], [], [], () => {
  EM.addSystem(
    "updatePointRenderData",
    Phase.RENDER_PRE_DRAW,
    [RenderableDef, PointRenderDataDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      const pool = res.renderer.renderer.getCyResource(pointMeshPoolPtr)!;
      for (let o of objs) {
        // console.log("updatePointRenderData: " + o.id);

        // color / tint
        if (ColorDef.isOn(o)) {
          V3.copy(o.pointRenderData.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.pointRenderData.tint);
        }

        // id
        // TODO(@darzu): set at construct time?
        // o.pointRenderData.id = o.renderable.meshHandle.mId;

        // transform
        mat4.copy(o.pointRenderData.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.pointRenderData);
      }
    }
  );
});
