import { ColorDef, TintsDef, applyTints } from "../../color/color-ecs.js";
import { EM } from "../../ecs/entity-manager.js";
import { Phase } from "../../ecs/sys-phase.js";
import { mat4 } from "../../matrix/gl-matrix.js";
import { V3 } from "../../matrix/sprig-matrix.js";
import { CY } from "../gpu-registry.js";
import { MAX_INDICES } from "../mesh-pool.js";
import { DEFAULT_MASK } from "../pipeline-masks.js";
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
  computeUniData,
  VertexStruct,
  MeshUniformStruct,
  MeshUniformTS,
} from "./std-scene.js";

const MAX_MESHES = 1000;
const MAX_VERTICES = MAX_INDICES;

export const LineRenderDataDef = EM.defineNonupdatableComponent(
  "lineRenderData",
  (r: MeshUniformTS) => r
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const lineMeshPoolPtr = CY.createMeshPool("lineMeshPool", {
  computeVertsData,
  computeUniData,
  vertsStruct: VertexStruct,
  unisStruct: MeshUniformStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: LineRenderDataDef,
  prim: "line",
});

export const stdLinesRender = CY.createRenderPipeline("stdLinesRender", {
  globals: [sceneBufPtr],
  cullMode: "back",
  meshOpt: {
    pool: lineMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "line-list",
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
      blend: {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
        alpha: {
          srcFactor: "constant",
          dstFactor: "zero",
          operation: "add",
        },
      },
    },
  ],
  depthStencil: mainDepthTex,
  shader: "std-line",
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

        // id
        o.lineRenderData.id = o.renderable.meshHandle.mId;

        // transform
        mat4.copy(o.lineRenderData.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.lineRenderData);
      }
    }
  );
});

export const PointRenderDataDef = EM.defineNonupdatableComponent(
  "pointRenderData",
  (r: MeshUniformTS) => r
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const pointMeshPoolPtr = CY.createMeshPool("pointMeshPool", {
  computeVertsData,
  computeUniData,
  vertsStruct: VertexStruct,
  unisStruct: MeshUniformStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: PointRenderDataDef,
  prim: "point",
});

export const stdPointsRender = CY.createRenderPipeline("stdPointsRender", {
  globals: [sceneBufPtr],
  cullMode: "back",
  meshOpt: {
    pool: pointMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "point-list",
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
      blend: {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
        alpha: {
          srcFactor: "constant",
          dstFactor: "zero",
          operation: "add",
        },
      },
    },
  ],
  depthStencil: mainDepthTex,
  shader: "std-point",
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
        o.pointRenderData.id = o.renderable.meshHandle.mId;

        // transform
        mat4.copy(o.pointRenderData.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.pointRenderData);
      }
    }
  );
});
