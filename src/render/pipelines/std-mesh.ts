import {
  ColorDef,
  TintsDef,
  applyTints,
  AlphaDef,
} from "../../color/color-ecs.js";
import { DeadDef, DeletedDef } from "../../ecs/delete.js";
import { EntityW } from "../../ecs/em-entities.js";
import { EM } from "../../ecs/ecs.js";
import { Phase } from "../../ecs/sys-phase.js";
import { V3, V4, mat4, V } from "../../matrix/sprig-matrix.js";
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

// export const BACKGROUND_COLOR = V(0.015, 0.015, 0.015, 1.0);
export const BACKGROUND_COLOR = V(0.03, 0.03, 0.03, 1.0);

function gammaCorrect(c: V3 | V4): V3 {
  const g = 1.0 / 2.2;
  return V(Math.pow(c[0], g), Math.pow(c[1], g), Math.pow(c[2], g));
}
function toCssColor(c: V3 | V4): string {
  const r = (c[0] * 100).toFixed(1);
  const g = (c[1] * 100).toFixed(1);
  const b = (c[2] * 100).toFixed(1);
  return `rgb(${r}%,${g}%,${b}%)`;
}
const __assumedAmbient: V4.InputT = [0.2, 0.2, 0.2, 1.0];
// TODO(@darzu): HACK. Alas, this doesn't match what the background color actually is in e.g. ship-arena.
//  idk where there difference in the light calculation happens..
// console.log("background:");
// console.log(
//   toCssColor(gammaCorrect(V4.mul(BACKGROUND_COLOR, __assumedAmbient)))
// );
// console.log(toCssColor(BACKGROUND_COLOR));

export const stdMeshPipe = CY.createRenderPipeline("stdMeshRender", {
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
      defaultColor: BACKGROUND_COLOR,
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
  // depthCompare: ,
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
    // TODO(@darzu): allow configurable tint change sensativity
    const prevTint = o.renderDataStd.tint;
    const newTint = V3.zero(V3.tmp());
    if (ColorDef.isOn(o)) V3.copy(newTint, o.color);
    if (TintsDef.isOn(o)) applyTints(o.tints, newTint);
    if (V3.sqrDist(prevTint, newTint) > 0.001) {
      tintChange = true;
      V3.copy(o.renderDataStd.tint, newTint);
    }

    // apha
    if (AlphaDef.isOn(o)) {
      if (o.renderDataStd.alpha !== o.alpha) tintChange = true;
      o.renderDataStd.alpha = o.alpha;
      // TODO(@darzu): ALPHA MASK HACK! it's also in renderable construct?!
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
  // TODO(@darzu): HACK! ONLY UPDATE UNIFORM IF WE"VE MOVED/SCALED/ROT OR COLOR CHANGED OR HIDDEN CHANGED
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
