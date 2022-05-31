import { createRenderTextureToQuad } from "./gpu-helper.js";
import { comparisonSamplerPtr, CY } from "./gpu-registry.js";
import {
  canvasDepthTex,
  mainTexturePtr,
  meshPoolPtr,
  normalsTexturePtr,
  positionsTexturePtr,
  sceneBufPtr,
  surfacesTexturePtr,
} from "./std-scene.js";
import { shadowDepthTexture } from "./std-shadow.js";

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
//  [ ] light source: scene rendered with multiple point sources
//      - light sailing
//

export const stdRenderPipeline = CY.createRenderPipeline("triRender", {
  globals: [
    sceneBufPtr,
    { ptr: shadowDepthTexture, alias: "shadowMap" },
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
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
      ptr: mainTexturePtr,
      clear: "once",
      // defaultColor: [0.0, 0.0, 0.0, 1.0],
      defaultColor: [0.1, 0.1, 0.1, 1.0],
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
    {
      ptr: normalsTexturePtr,
      clear: "once",
      defaultColor: [0, 0, 0, 0],
    },
    {
      ptr: positionsTexturePtr,
      clear: "once",
      defaultColor: [0, 0, 0, 0],
    },
    {
      ptr: surfacesTexturePtr,
      clear: "once",
      defaultColor: [0, 0, 0, 0],
    },
  ],
  depthStencil: canvasDepthTex,
  shader: () =>
    `
struct VertexOutput {
    @location(0) @interpolate(flat) normal : vec3<f32>,
    @location(1) @interpolate(flat) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) shadowPos: vec3<f32>,
    @location(4) @interpolate(flat) surface: u32,
    @location(5) @interpolate(flat) id: u32,
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

     // XY is in (-1, 1) space, Z is in (0, 1) space
    let posFromLight : vec4<f32> = scene.lightViewProjMatrix * worldPos;
    // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
    output.shadowPos = vec3<f32>(
        posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
        posFromLight.z
    );

    output.worldPos = finalPos;
    output.position = scene.cameraViewProjMatrix * finalPos;
    output.normal = normalize(meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    // output.color = vec3<f32>(f32(uvInt.x), f32(uvInt.y), 1.0);
    // output.color = texDisp.rgb;
    // output.color = vec3(uv.xy, 1.0);
    output.color = color + meshUni.tint;

    // TODO: better surface info
    // 2 4 8 16 32 64 128 256 512 1024 2048 4096
    // output.surface.r = f32(((input.surfaceId << 16u) >> 16u)) / f32((1u << 16u));
    // output.surface.g = f32(((input.surfaceId << 0u) >> 16u)) / f32((1u << 16u));
    // output.surface.r = f32(((input.surfaceId << 24u) >> 24u)) / f32((1u << 12u));
    // output.surface.g = f32(((input.surfaceId << 12u) >> 24u)) / f32((1u << 12u));
    // output.surface.b = f32(((input.surfaceId << 0u) >> 24u)) / f32((1u << 12u));
    // output.surface.b = 1.0;
    // obj id on alpha
    // let maxS3 = f32(scene.maxSurfaceId / 3u);
    // // output.surface.r = f32((input.surfaceId + 0u) % (scene.maxSurfaceId / 3u)) / maxS3;
    // // output.surface.g = f32((input.surfaceId + 1u) % (scene.maxSurfaceId / 3u)) / maxS3;
    // // output.surface.b = f32((input.surfaceId + 2u) % (scene.maxSurfaceId / 3u)) / maxS3;
    // output.surface.r = f32(((input.surfaceId & 1u) >> 0u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);
    // output.surface.g = f32(((input.surfaceId & 2u) >> 1u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);
    // output.surface.b = f32(((input.surfaceId & 4u) >> 2u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);
    // // output.surface.g = 0.4;
    // // output.surface.b = 0.4;
    // // output.surface = vec4(f32(input.surfaceId) / f32(scene.maxSurfaceId));
    // output.surface.a = 1.0;
    output.surface = input.surfaceId;
    output.id = meshUni.id;

    // output.color = input.color; // DBG

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) position: vec4<f32>,
  @location(3) surface: vec2<u32>,
}

@stage(fragment)
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = input.normal;
    // let normal = -normalize(cross(dpdx(input.worldPos.xyz), dpdy(input.worldPos.xyz)));

    let shadowVis : f32 = textureSampleCompare(
      shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);

    let light1 : f32 = clamp(dot(-scene.light1Dir, normal), 0.0, 1.0);
    let light2 : f32 = clamp(dot(-scene.light2Dir, normal), 0.0, 1.0);
    let light3 : f32 = clamp(dot(-scene.light3Dir, normal), 0.0, 1.0);
    let resultColor: vec3<f32> = input.color 
      * (shadowVis * light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
    let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));

    let fogDensity: f32 = 0.02;
    let fogGradient: f32 = 1.5;
    // let fogDist: f32 = 0.1;
    let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
    // output.fogVisibility = 0.9;
    let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);


    let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    // let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    // let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);
    let finalColor: vec3<f32> = gammaCorrected;

    var out: FragOut;
    out.color = vec4<f32>(finalColor, 1.0);
    out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 1.0)).xyz), 1.0);
    out.position = input.worldPos;
    out.surface.r = input.surface;
    out.surface.g = input.id;
    // out.color = vec4(input.color, 1.0);
    // out.color = input.surface;

    return out;
    // return vec4<f32>(finalColor, 1.0);
    // return vec4<f32>(input.color, 1.0);
}
`,
});

export const { pipeline: normalDbg } = createRenderTextureToQuad(
  "normalDbg",
  normalsTexturePtr,
  0.2,
  0.8,
  0.2,
  0.8
);

export const { pipeline: positionDbg } = createRenderTextureToQuad(
  "positionDbg",
  positionsTexturePtr,
  0.2,
  0.8,
  -0.8,
  -0.2
);

// TODO(@darzu): rg32uint "uint"
// rg16uint "uint"
