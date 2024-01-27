import {
  ColorDef,
  TintsDef,
  applyTints,
  AlphaDef,
} from "../../color/color-ecs.js";
import { DeadDef, DeletedDef } from "../../ecs/delete.js";
import { EM, EntityW } from "../../ecs/entity-manager.js";
import { Phase } from "../../ecs/sys-phase.js";
import { V3, vec4, mat4, V } from "../../matrix/sprig-matrix.js";
import { tempVec3 } from "../../matrix/temp-pool.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { ALPHA_MASK } from "../pipeline-masks.js";
import {
  RenderableDef,
  RendererDef,
  RendererWorldFrameDef,
} from "../renderer-ecs.js";
import {
  mainDepthTex,
  meshPoolPtr,
  worldNormsAndFresTexPtr,
  positionsTexturePtr,
  sceneBufPtr,
  surfacesTexturePtr,
  RenderDataStdDef,
  unlitTexturePtr,
} from "./std-scene.js";

// TODO:
//  [x] pipeline attachements / outputs
//        use case: two cameras
//  [x] mesh pool handle enable/disable
//  [x] textures and samplers as resources
//  [x] resource ping-ponging for cloth texs and boids
//  [x] shader VertexInput struct auto gen
//  [x] debug view of the depth buffer
//  [x] shadows
//  [x] debug view of any texture
//  [x] dynamic resizing texture based on canvas size
//  [x] split screen
//  [ ] re-enable anti aliasing
//  [x] ECS integration w/ custom gpu data
//  [ ] general usable particle system
//  [x] split *ptr CY.register from webgpu impl
//  [-] webgl impl
//  [x] multiple pipeline outputs
//  [ ] deferred rendering
//  [ ] re-enable line renderer
//  [x] pass in pipelines from game
//  [x] light source: scene rendered with multiple point sources
//      [x] light sailing

export const stdRenderPipeline = CY.createRenderPipeline("stdMeshRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    // TODO(@darzu): object-specific SDFs?
    // TODO(@darzu): REMOVE HARD-CODED DEPENDENCY ON OCEAN SDF!
    // { ptr: oceanJfa.sdfTex, alias: "sdf" },
    pointLightsPtr,
    // { ptr: oceanJfa._inputMaskTex, alias: "sdf" },
    // { ptr: oceanJfa._uvMaskTex, alias: "sdf" },
    // TODO(@darzu): support textures
    // { ptr: clothTexPtr0, access: "read", alias: "clothTex" },
  ],
  // TODO(@darzu): hack for ld52
  cullMode: "back",
  // cullMode: "none",
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: unlitTexturePtr,
      clear: "once",
      // defaultColor: [0.0, 0.0, 0.0, 1.0],
      // defaultColor: [0.1, 0.1, 0.1, 1.0],
      // defaultColor: [0.15, 0.15, 0.6, 1.0],
      defaultColor: V(0.015, 0.015, 0.015, 1.0),
      // defaultColor: [...vec3.clone(ENDESGA16.white), 1.0] as vec4,
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
    {
      ptr: worldNormsAndFresTexPtr,
      clear: "once",
      defaultColor: V(0, 0, 0, 0),
    },
    {
      ptr: positionsTexturePtr,
      clear: "once",
      defaultColor: V(0, 0, 0, 0),
    },
    {
      ptr: surfacesTexturePtr,
      clear: "once",
      defaultColor: V(0, 0, 0, 0),
    },
  ],
  depthStencil: mainDepthTex,
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-mesh"].code}
  `,
});

const _lastMeshHandleTransform = new Map<number, mat4>();
const _lastMeshHandleHidden = new Map<number, boolean>();

EM.addEagerInit([RenderDataStdDef], [], [], () => {
  const renderObjs: EntityW<
    [
      typeof RendererWorldFrameDef,
      typeof RenderableDef,
      typeof RenderDataStdDef
    ]
  >[] = [];
  // TODO(@darzu): de-dupe w/ renderList and renderListDeadHidden
  EM.addSystem(
    "stdRenderListDeadHidden",
    Phase.RENDER_PRE_DRAW,
    [RendererWorldFrameDef, RenderableDef, RenderDataStdDef, DeadDef],
    [],
    (objs, _) => {
      for (let o of objs)
        if (o.renderable.enabled && o.renderable.hidden && !DeletedDef.isOn(o))
          renderObjs.push(o);
    }
  );
  EM.addSystem(
    "stdRenderList",
    Phase.RENDER_PRE_DRAW,
    [RendererWorldFrameDef, RenderableDef, RenderDataStdDef],
    [],
    (objs, _) => {
      for (let o of objs)
        if (o.renderable.enabled && !DeletedDef.isOn(o)) renderObjs.push(o);
    }
  );
  EM.addSystem(
    "stdRenderableDataUpdate",
    Phase.RENDER_PRE_DRAW,
    null,
    [RendererDef],
    (_, res) => {
      for (let o of renderObjs) {
        if (updateStdRenderData(o)) {
          o.renderable.meshHandle.pool.updateUniform(
            o.renderable.meshHandle,
            o.renderDataStd
          );
        }
      }
      renderObjs.length = 0;
    }
  );

  // EM.addConstraint(["stdRenderListDeadHidden", "after", "renderList"]);
  // EM.addConstraint(["stdRenderListDeadHidden", "before", "stdRenderList"]);
  // EM.addConstraint(["stdRenderList", "before", "stdRenderableDataUpdate"]);
  // EM.addConstraint(["stdRenderableDataUpdate", "before", "stepRenderer"]);
});

function updateStdRenderData(
  o: EntityW<
    [
      typeof RenderableDef,
      typeof RenderDataStdDef,
      typeof RendererWorldFrameDef
    ]
  >
): boolean {
  if (o.renderable.hidden) {
    // TODO(@darzu): hidden stuff is a bit wierd
    mat4.fromScaling(V3.ZEROS, o.renderDataStd.transform);
  }

  let tintChange = false;
  if (!o.renderable.hidden) {
    // color / tint
    let prevTint = V3.copy(tempVec3(), o.renderDataStd.tint);
    if (ColorDef.isOn(o)) V3.copy(o.renderDataStd.tint, o.color);
    if (TintsDef.isOn(o)) applyTints(o.tints, o.renderDataStd.tint);
    if (V3.sqrDist(prevTint, o.renderDataStd.tint) > 0.01) tintChange = true;

    // apha
    if (AlphaDef.isOn(o)) {
      if (o.renderDataStd.alpha !== o.alpha) tintChange = true;
      o.renderDataStd.alpha = o.alpha;
      // TODO(@darzu): MASK HACK! it's also in renderable construct?!
      o.renderable.meshHandle.mask = ALPHA_MASK;
    }
  }

  let lastHidden = _lastMeshHandleHidden.get(o.renderable.meshHandle.mId);
  let hiddenChanged = lastHidden !== o.renderable.hidden;
  _lastMeshHandleHidden.set(o.renderable.meshHandle.mId, o.renderable.hidden);

  // TODO(@darzu): actually we only set this at creation now so that
  //  it's overridable for gameplay
  // id
  // o.renderDataStd.id = o.renderable.meshHandle.mId;

  // transform
  // TODO(@darzu): hACK! ONLY UPDATE UNIFORM IF WE"VE MOVED/SCALED/ROT OR COLOR CHANGED OR HIDDEN CHANGED
  // TODO(@darzu): probably the less hacky way to do this is require uniforms provide a
  //    hash function
  let lastTran = _lastMeshHandleTransform.get(o.renderable.meshHandle.mId);
  const thisTran = o.rendererWorldFrame.transform;
  if (
    hiddenChanged ||
    tintChange ||
    !lastTran ||
    !mat4.equals(lastTran, thisTran)
    // vec3.sqrDist(lastTran, thisTran) > 0.01
  ) {
    if (!o.renderable.hidden)
      mat4.copy(o.renderDataStd.transform, o.rendererWorldFrame.transform);

    if (!lastTran) {
      lastTran = mat4.create();
      _lastMeshHandleTransform.set(o.renderable.meshHandle.mId, lastTran);
    }
    mat4.copy(lastTran, thisTran);
    return true;
  }
  return false;
}
