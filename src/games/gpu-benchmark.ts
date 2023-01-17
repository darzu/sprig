import { EM } from "../entity-manager.js";
import { fullQuad } from "../render/gpu-helper.js";
import {
  CyTexturePtr,
  CyRenderPipelinePtr,
  CY,
  CyPipelinePtr,
} from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { asyncTimeout, range } from "../util.js";

// TODO(@darzu): waiting on gpu pipeline measurements for better data

let benchmarkTexsAndPipes: [CyTexturePtr, CyPipelinePtr][] = [];

export function initBenchmark() {
  benchmarkTexsAndPipes = range(20).map((s) =>
    createBenchmarkTexAndPipe((s + 1) * 128, "gpuTest")
  );
}

export async function runBenchmark() {
  const res = await EM.whenResources(RendererDef);

  // CPU <-> GPU round trip benchmarking!
  await asyncTimeout(2000); // TODO(@darzu): dbg
  console.log(`GPU <-> CPU TEST`);
  for (let [tex, pipe] of benchmarkTexsAndPipes) {
    const perGPUTest = performance.now();
    res.renderer.renderer.submitPipelines([], [pipe]);
    await res.renderer.renderer.readTexture(tex);
    const afterGPUTest = performance.now() - perGPUTest;
    const mb = (tex.size[0] * tex.size[1] * 4) / 1024 / 1024;
    console.log(
      `${tex.size[0]}x${tex.size[1]}, ${mb.toFixed(
        2
      )}mb, ${afterGPUTest.toFixed(2)}ms`
    );
    await asyncTimeout(500); // TODO(@darzu): dbg
  }
}

// TODO(@darzu): DBG
export function createBenchmarkTexAndPipe(
  size: number,
  name: string
): [CyTexturePtr, CyRenderPipelinePtr] {
  const tex = CY.createTexture(`${name}${size}Tex`, {
    size: [size, size],
    format: "r32float",
  });

  const pipe = CY.createRenderPipeline(`${name}${size}Pipe`, {
    globals: [{ ptr: fullQuad, alias: "quad" }],
    output: [tex],
    meshOpt: {
      stepMode: "single-draw",
      vertexCount: 6,
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    shader: (shaders) => `
    ${shaders["std-rand"].code}
    ${shaders["std-screen-quad-vert"].code}

  @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) f32 {
      rand_seed = uv;
      return rand();
      // return 0.4;
    }
  `,
  });

  return [tex, pipe];
}
