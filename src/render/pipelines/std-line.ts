import { ColorDef, TintsDef, applyTints } from "../../color/color-ecs.js";
import { EM } from "../../ecs/entity-manager.js";
import { Phase } from "../../ecs/sys-phase.js";
import { V3, mat4 } from "../../matrix/sprig-matrix.js";
import { CY } from "../gpu-registry.js";
import { CyToTS, createCyStruct } from "../gpu-struct.js";
import { MAX_INDICES } from "../mesh-pool.js";
import {
  RenderableDef,
  RendererWorldFrameDef,
  RendererDef,
} from "../renderer-ecs.js";
import {
  sceneBufPtr,
  mainDepthTex,
  litTexturePtr,
  computeVertsData,
  VertexStruct,
} from "./std-scene.js";

const MAX_MESHES = 1000;
const MAX_VERTICES = MAX_INDICES;

export const LineUniStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    tint: "vec3<f32>",
    // id: "u32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.tint, offsets_32[1]);
      // views.u32[offsets_32[2]] = d.id;
    },
    create: () => ({
      transform: mat4.create(),
      tint: V3.mk(),
      // id: 0,
    }),
  }
);

export type LineUniTS = CyToTS<typeof LineUniStruct.desc>;

export const LineUniDef = EM.defineNonupdatableComponent(
  "lineUni",
  (r: Partial<LineUniTS>) => LineUniStruct.fromPartial(r)
);

// TODO(@darzu): PERF. could probably save perf by using custom vertex data
export const lineMeshPoolPtr = CY.createMeshPool("lineMeshPool", {
  computeVertsData,
  vertsStruct: VertexStruct,
  unisStruct: LineUniStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: LineUniDef,
  prim: "line",
});
export const pointMeshPoolPtr = CY.createMeshPool("pointMeshPool", {
  computeVertsData,
  vertsStruct: VertexStruct,
  unisStruct: LineUniStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  setMaxPrims: MAX_VERTICES,
  setMaxVerts: MAX_VERTICES,
  dataDef: LineUniDef,
  prim: "point",
});

export const linePipe = CY.createRenderPipeline("linePipe", {
  globals: [sceneBufPtr],
  cullMode: "none",
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
    },
  ],
  // depthStencil: mainDepthTex,
  shader: "std-line",
  meshOpt: {
    pool: lineMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "line-list",
});
export const pointPipe = CY.createRenderPipeline("pointPipe", {
  ...linePipe,
  meshOpt: {
    pool: pointMeshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  topology: "point-list",
});

EM.addEagerInit([LineUniDef], [], [], () => {
  EM.addSystem(
    "updateLineUni",
    Phase.RENDER_PRE_DRAW,
    [RenderableDef, LineUniDef, RendererWorldFrameDef],
    [RendererDef],
    (objs, res) => {
      for (let o of objs) {
        const pool = o.renderable.meshHandle.pool;
        // console.log("lineUni: " + o.id);

        // color / tint
        if (ColorDef.isOn(o)) {
          V3.copy(o.lineUni.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.lineUni.tint);
        }

        // transform
        mat4.copy(o.lineUni.transform, o.rendererWorldFrame.transform);

        pool.updateUniform(o.renderable.meshHandle, o.lineUni);
      }
    }
  );
});
