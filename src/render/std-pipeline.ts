import { vec3, mat4 } from "../gl-matrix.js";
import { computeTriangleNormal } from "../utils-3d.js";
import { createRenderTextureToQuad } from "./gpu-helper.js";
import { comparisonSamplerPtr, CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { MeshHandle } from "./mesh-pool.js";
import { Mesh, getAABBFromMesh } from "./mesh.js";
import {
  canvasDepthTex,
  mainTexturePtr,
  meshPoolPtr,
  normalsTexturePtr,
  pointLightsPtr,
  sceneBufPtr,
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
    pointLightsPtr,
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
      defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
    {
      ptr: normalsTexturePtr,
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
    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
}

@stage(fragment)
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = input.normal;
    // let normal = -normalize(cross(dpdx(input.worldPos.xyz), dpdy(input.worldPos.xyz)));

    let shadowVis : f32 = textureSampleCompare(
      shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);

    var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    for (var i: u32 = 0u; i < scene.pointLights; i++) {
        let light = pointLights.ms[i];
        let toLight = light.position - input.worldPos.xyz;
        let distance = length(toLight);
        let attenuation = 1.0 / (light.constant + light.linear * distance +
                                 light.quadratic * distance * distance);
        let angle = clamp(dot(normalize(toLight), input.normal), 0.0, 1.0);
        lightingColor = lightingColor + (light.ambient * attenuation) + (light.diffuse * angle * attenuation);
    }

    let resultColor = input.color * lightingColor;

    let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));

    let fogDensity: f32 = 0.02;
    let fogGradient: f32 = 1.5;
    // let fogDist: f32 = 0.1;
    let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
    // output.fogVisibility = 0.9;
    let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);


    let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);

    var out: FragOut;
    out.color = vec4<f32>(finalColor, 1.0);
    out.normal = vec4<f32>(input.normal, 1.0);

    return out;
    // return vec4<f32>(finalColor, 1.0);
    // return vec4<f32>(input.color, 1.0);
}
`,
});

export const { pipeline: normalDbg } = createRenderTextureToQuad(
  "normalDbg",
  normalsTexturePtr,
  0.1,
  0.9,
  0.1,
  0.9
);
