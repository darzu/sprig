import { CameraDef } from "../camera/camera.js";
import { EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { max } from "../utils/math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import {
  CyRenderPipelinePtr,
  CyCompPipelinePtr,
  CY,
  linearSamplerPtr,
} from "../render/gpu-registry.js";
import { cloneMesh } from "../meshes/mesh.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  litTexturePtr,
  mainDepthTex,
  canvasTexturePtr,
} from "../render/pipelines/std-scene.js";
import { uintToVec3unorm } from "../utils/utils-3d.js";
import { AssetsDef } from "../meshes/assets.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { createGhost } from "./ghost.js";
import { PointLightDef } from "../render/lights.js";

export async function initCubeGame(em: EntityManager) {
  const res = await em.whenResources(
    AssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );
  res.camera.fov = Math.PI * 0.5;

  let renderPipelinesPtrs: CyRenderPipelinePtr[] = [
    cubeRenderPipeline,
    cubePost,
  ];
  let computePipelinesPtrs: CyCompPipelinePtr[] = [
    // ...
  ];
  res.renderer.pipelines = [...computePipelinesPtrs, ...renderPipelinesPtrs];

  const e = createGhost();
  vec3.copy(e.position, [0, 1, -1.2]);
  quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, e.rotation);
  e.controllable.sprintMul = 3;

  // TODO(@darzu): this shouldn't be necessary
  const m2 = cloneMesh(res.assets.cube.mesh);
  em.ensureComponentOn(e, RenderableConstructDef, m2);

  {
    // auto-gen; use dbg.saveCamera() to update
    vec3.copy(e.position, [3.29, 1.69, -1.37]);
    quat.copy(e.rotation, [0.0, -0.95, 0.0, -0.31]);
    vec3.copy(e.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    e.cameraFollow.yawOffset = 0.0;
    e.cameraFollow.pitchOffset = -0.267;
  }

  const box = em.new();
  const boxM = cloneMesh(res.assets.cube.mesh);
  const sIdMax = max(boxM.surfaceIds);
  boxM.colors = boxM.surfaceIds.map((_, i) => uintToVec3unorm(i, sIdMax));
  // boxM.colors = boxM.surfaceIds.map((_, i) => [0.1, i / 12, 0.1]);
  // console.dir(boxM.colors);
  em.ensureComponentOn(box, RenderableConstructDef, boxM);
  // em.ensureComponentOn(box, ColorDef, [0.1, 0.4, 0.1]);
  em.ensureComponentOn(box, PositionDef, V(0, 0, 3));
  em.ensureComponentOn(box, RotationDef);
  em.ensureComponentOn(box, AngularVelocityDef, V(0, 0.001, 0.001));
  em.ensureComponentOn(box, WorldFrameDef);
  em.ensureComponentOn(box, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.cube.aabb,
  });
}

const cubeRenderPipeline = CY.createRenderPipeline("cubeRender", {
  globals: [sceneBufPtr],
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "once",
      // defaultColor: [0.0, 0.0, 0.0, 1.0],
      defaultColor: vec4.clone([0.1, 0.1, 0.1, 1.0]),
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
  ],
  depthStencil: mainDepthTex,
  shader: () =>
    `
struct VertexOutput {
    @location(0) @interpolate(flat) color : vec3<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;

    output.position = 
      scene.cameraViewProjMatrix 
      * meshUni.transform 
      * vec4<f32>(input.position, 1.0);

    output.color = input.color + meshUni.tint;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

    var out: FragOut;
    out.color = vec4(input.color, 1.0);

    return out;
}
`,
});

// TODO(@darzu): rg32uint "uint"
// rg16uint "uint"

const cubePost = CY.createRenderPipeline("cubePost", {
  globals: [
    { ptr: litTexturePtr, alias: "colorTex" },
    { ptr: linearSamplerPtr, alias: "samp" },
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [canvasTexturePtr],
  shader: () => {
    return `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  let xs = vec2(-1.0, 1.0);
  let ys = vec2(-1.0, 1.0);
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.x),
    vec2<f32>(xs.y, ys.y),
    vec2<f32>(xs.x, ys.y),
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.y),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@fragment
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(colorTex, samp, fragUV);

  // vignette
  let edgeDistV = fragUV - 0.5;
  let edgeDist = 1.0 - dot(edgeDistV, edgeDistV) * 0.5;
  color *= edgeDist;
  
  return color;
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
