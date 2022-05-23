import { vec3, mat4 } from "../gl-matrix.js";
import { computeTriangleNormal } from "../utils-3d.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { MeshHandle } from "./mesh-pool.js";
import { Mesh, getAABBFromMesh } from "./mesh.js";

export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;

// TODO:
//  [x] pipeline attachements / outputs
//        use case: two cameras
//  [x] mesh pool handle enable/disable
//  [x] textures and samplers as resources
//  [x] resource ping-ponging for cloth texs and boids
//  [x] shader VertexInput struct auto gen
//  [x] debug view of the depth buffer
//  [ ] shadows
//  [x] debug view of any texture
//  [x] dynamic resizing texture based on canvas size
//  [x] split screen
//  [ ] re-enable anti aliasing
//  [x] ECS integration w/ custom gpu data
//  [ ] general usable particle system
//  [x] split *ptr CY.register from webgpu impl
//  [ ] webgl impl
//  [ ] multiple pipeline outputs
//  [ ] deferred rendering
//  [ ] re-enable line renderer
//  [x] pass in pipelines from game

export const VertexStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    uv: "vec2<f32>",
  },
  {
    isCompact: true,
    serializer: ({ position, color, normal, uv }, _, offsets_32, views) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      views.f32.set(uv, offsets_32[3]);
    },
  }
);
export type VertexTS = CyToTS<typeof VertexStruct.desc>;

export const SceneStruct = createCyStruct(
  {
    cameraViewProjMatrix: "mat4x4<f32>",
    light1Dir: "vec3<f32>",
    light2Dir: "vec3<f32>",
    light3Dir: "vec3<f32>",
    cameraPos: "vec3<f32>",
    playerPos: "vec2<f32>",
    time: "f32",
  },
  {
    isUniform: true,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.cameraViewProjMatrix, offsets_32[0]);
      views.f32.set(data.light1Dir, offsets_32[1]);
      views.f32.set(data.light2Dir, offsets_32[2]);
      views.f32.set(data.light3Dir, offsets_32[3]);
      views.f32.set(data.cameraPos, offsets_32[4]);
      views.f32.set(data.playerPos, offsets_32[5]);
      views.f32[offsets_32[6]] = data.time;
    },
  }
);
export type SceneTS = CyToTS<typeof SceneStruct.desc>;

export function setupScene(): SceneTS {
  // create a directional light and compute it's projection (for shadows) and direction
  const worldOrigin = vec3.fromValues(0, 0, 0);
  const D = 50;
  const light1Pos = vec3.fromValues(D, D * 2, D);
  const light2Pos = vec3.fromValues(-D, D * 1, D);
  const light3Pos = vec3.fromValues(0, D * 0.5, -D);
  const light1Dir = vec3.subtract(vec3.create(), worldOrigin, light1Pos);
  vec3.normalize(light1Dir, light1Dir);
  const light2Dir = vec3.subtract(vec3.create(), worldOrigin, light2Pos);
  vec3.normalize(light2Dir, light2Dir);
  const light3Dir = vec3.subtract(vec3.create(), worldOrigin, light3Pos);
  vec3.normalize(light3Dir, light3Dir);

  return {
    cameraViewProjMatrix: mat4.create(), // updated later
    light1Dir,
    light2Dir,
    light3Dir,
    cameraPos: vec3.create(), // updated later
    playerPos: [0, 0], // updated later
    time: 0, // updated later
  };
}

export const MeshUniformStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    aabbMin: "vec3<f32>",
    aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.aabbMin, offsets_32[1]);
      views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[3]);
    },
  }
);
export type MeshUniformTS = CyToTS<typeof MeshUniformStruct.desc>;

// TODO(@darzu): IMPL
export type MeshHandleStd = MeshHandle<typeof MeshUniformStruct.desc>;

export const sceneBufPtr = CY.createSingleton("scene", {
  struct: SceneStruct,
  init: setupScene,
});

const meshVertsPtr = CY.createArray("meshVertsBuf", {
  struct: VertexStruct,
  init: () => MAX_VERTICES,
});

const meshTriIndsPtr = CY.createIdxBuf("meshTriIndsBuf", {
  init: () => MAX_VERTICES,
});

const meshLineIndsPtr = CY.createIdxBuf("meshLineIndsBuf", {
  init: () => MAX_VERTICES * 2,
});

const meshUnisPtr = CY.createArray("meshUni", {
  struct: MeshUniformStruct,
  init: () => MAX_MESHES,
});

export const meshPoolPtr = CY.createMeshPool("meshPool", {
  computeVertsData,
  computeUniData,
  vertsPtr: meshVertsPtr,
  unisPtr: meshUnisPtr,
  triIndsPtr: meshTriIndsPtr,
  lineIndsPtr: meshLineIndsPtr,
});

export function computeUniData(m: Mesh): MeshUniformTS {
  const { min, max } = getAABBFromMesh(m);
  const uni: MeshUniformTS = {
    transform: mat4.create(),
    aabbMin: min,
    aabbMax: max,
    tint: vec3.create(),
  };
  return uni;
}

export function computeVertsData(m: Mesh): VertexTS[] {
  const vertsData: VertexTS[] = m.pos.map((pos, i) => ({
    position: pos,
    color: [0.0, 0.0, 0.0],
    normal: [1.0, 0.0, 0.0],
    uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
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
  });
  return vertsData;
}

export const canvasDepthTex = CY.createDepthTexture("canvasDepth", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "depth24plus-stencil8",
  init: () => undefined,
});

export const canvasTexturePtr = CY.createTexture("canvasTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  // TODO(@darzu): safer way to grab this format?
  format: navigator.gpu?.getPreferredCanvasFormat() ?? "bgra8unorm",
  attachToCanvas: true,
  init: () => undefined,
  // TODO(@darzu): support anti-aliasing again
});

export const stdRenderPipeline = CY.createRenderPipeline("triRender", {
  globals: [
    sceneBufPtr,
    // TODO(@darzu): support textures
    // { ptr: clothTexPtr0, access: "read", alias: "clothTex" },
  ],
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: canvasTexturePtr,
      clear: "once",
      defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
  ],
  depthStencil: canvasDepthTex,
  shader: () =>
    `
struct VertexOutput {
    @location(0) @interpolate(flat) normal : vec3<f32>,
    @location(1) @interpolate(flat) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
};

@stage(vertex)
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let uv = input.uv;
    let color = input.color;
    let normal = input.normal;

    var output : VertexOutput;
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    // let uvInt: vec2<i32> = vec2<i32>(5, 5);
    // let uvInt: vec2<i32> = vec2<i32>(10, i32(uv.x + 5.0));
    let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
    // let texDisp = textureLoad(clothTex, uvInt, 0);

    let finalPos = worldPos;
    // let finalPos = vec4<f32>(worldPos.xy, worldPos.z + uv.x * 10.0, worldPos.w);
    // let finalPos = vec4<f32>(worldPos.xyz + texDisp.xyz, 1.0);

    output.worldPos = finalPos;
    output.position = scene.cameraViewProjMatrix * finalPos;
    output.normal = normalize(meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    // output.color = vec3<f32>(f32(uvInt.x), f32(uvInt.y), 1.0);
    // output.color = texDisp.rgb;
    // output.color = vec3(uv.xy, 1.0);
    output.color = color + meshUni.tint;
    return output;
}

@stage(fragment)
fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let normal = input.normal;
    // let normal = -normalize(cross(dpdx(input.worldPos.xyz), dpdy(input.worldPos.xyz)));
    let light1 : f32 = clamp(dot(-scene.light1Dir, normal), 0.0, 1.0);
    let light2 : f32 = clamp(dot(-scene.light2Dir, normal), 0.0, 1.0);
    let light3 : f32 = clamp(dot(-scene.light3Dir, normal), 0.0, 1.0);
    let resultColor: vec3<f32> = input.color 
      * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
    let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));

    let fogDensity: f32 = 0.02;
    let fogGradient: f32 = 1.5;
    // let fogDist: f32 = 0.1;
    let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
    // output.fogVisibility = 0.9;
    let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);

    let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);
    return vec4<f32>(finalColor, 1.0);
    // return vec4<f32>(input.color, 1.0);
}
`,
});
