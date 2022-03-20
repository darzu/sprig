import { align, bytesPerFloat, bytesPerMat4, bytesPerVec3 } from "./main.js";


// TODO(@darzu): REFERENCE
const vertexShaderForFS = `
    [[block]] struct Scene {
        time : f32;
    };

    struct VertexOutput {
        [[builtin(position)]] position: vec4<f32>;
        [[location(0)]] coordinate: vec2<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;

    [[stage(vertex)]]
    fn main([[location(0)]] position : vec2<f32>) -> VertexOutput {
        // TODO:
        var output: VertexOutput;
        output.position = vec4<f32>(position, 0.0, 1.0);
        output.coordinate = position * 0.5 + 0.5;
        return output;
    }
`;
const fragmentShaderForFS = `
    struct VertexOutput {
        [[builtin(position)]] position: vec4<f32>;
        [[location(0)]] coordinate: vec2<f32>;
    };

    [[stage(fragment)]]
    fn main(
        input: VertexOutput
    ) -> [[location(0)]] vec4<f32> {
        // let r = input.position.x / 2048.0; /// (2048.0 * 2.0); // * 0.5 + 0.5;
        let r = input.coordinate.x; // * 0.5 + 0.5;
        let g = input.coordinate.y; // 0.0; //position.y;
        let b = 0.0;
        return vec4<f32>(r, g, b, 1.0);
     }
`;


const shaderSceneStruct = `
  struct Scene {
      cameraViewProjMatrix : mat4x4<f32>;
      lightViewProjMatrix : mat4x4<f32>;
      lightDir : vec3<f32>;
  };
  `;
const texVertShader =
  shaderSceneStruct +
  `

  @group(0) @binding(0) var<uniform> scene : Scene;

  @stage(vertex)
  fn main(@builtin(vertex_index) VertexIndex : u32)
          -> @builtin(position) vec4<f32> {
      var pos = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
          vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));

      return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  }
  `;
const fragmentShader =
  shaderSceneStruct +
  `
  @group(0) @binding(0) var<uniform> scene : Scene;

  @stage(fragment)
  fn main(@builtin(position) coord : vec4<f32>)
     -> @location(0) vec4<f32> {
      let r = coord.x / 1836.0;
      let g = coord.y / 1592.0;
      return vec4(r,g,0.0,1.0);
  }
  `;

export function createTextureRBundle(
  device: GPUDevice,
  texFormat: GPUTextureFormat
): GPURenderBundle {
  // defines the format of our scene's uniform data
  const texUniBufSizeExact =
    bytesPerMat4 * 2 + // camera and light projection
    bytesPerVec3 * 1; // light pos
  const texUniBufSizeAligned = align(texUniBufSizeExact, 256); // uniform objects must be 256 byte aligned

  const texUniBuf = device.createBuffer({
    size: texUniBufSizeAligned,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const primState: GPUPrimitiveState = {
    topology: "triangle-list",
    // cullMode: "none",
    // frontFace: "ccw",
  };

  const uniBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });
  const uniBindGroup = device.createBindGroup({
    layout: uniBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: texUniBuf } }],
  });

  const pipelineDesc: GPURenderPipelineDescriptor = {
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniBindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({ code: texVertShader }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShader }),
      entryPoint: "main",
      targets: [{ format: texFormat }],
    },
    primitive: primState,
  };
  const pipeline = device.createRenderPipeline(pipelineDesc);

  const bundleEnc = device.createRenderBundleEncoder({
    colorFormats: [texFormat],
    // sampleCount: 4, // TODO(@darzu):
  });
  bundleEnc.setPipeline(pipeline);
  bundleEnc.setBindGroup(0, uniBindGroup);
  bundleEnc.draw(6);
  let bundle = bundleEnc.finish();
  return bundle;
}
