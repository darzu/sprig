import { EM, EntityManager } from "../ecs/entity-manager.js";
import { PERF_DBG_F32S, PERF_DBG_GPU } from "../flags.js";
import { TextDef } from "../gui/ui.js";
import { InputsDef } from "../input/inputs.js";
import {
  _lastCollisionTestTimeMs,
  _cellChecks,
} from "../physics/broadphase.js";
import { _doesOverlapAABBs, _enclosedBys } from "../physics/aabb.js";
import { _gpuQueueBufferWriteBytes } from "../render/data-webgpu.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { _f32sCount } from "../matrix/sprig-matrix.js";
import { Phase } from "../ecs/sys-phase";

export const DevConsoleDef = EM.defineComponent("dev", () => {
  const stats = {
    avgJsTime: 0,
    avgFrameTime: 0,
    avgSimTime: 0,
  };
  const updateAvgs = (jsTime: number, frameTime: number, simTime: number) => {
    stats.avgJsTime = updateAvg(stats.avgJsTime, jsTime);
    stats.avgFrameTime = updateAvg(stats.avgFrameTime, frameTime);
    stats.avgSimTime = updateAvg(stats.avgSimTime, simTime);
  };
  return Object.assign(stats, {
    showConsole: false,
    // TODO(@darzu): debugging
    // showConsole: true,
    updateAvgs,
  });
});

let avgWeight = 0.05;

export function updateAvg(avg: number, curr: number): number {
  return avg ? (1 - avgWeight) * avg + avgWeight * curr : curr;
}

export function registerDevSystems(em: EntityManager) {
  em.addResource(DevConsoleDef);

  em.registerSystem(
    "devConsoleToggle",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, DevConsoleDef],
    (_, res) => {
      if (res.inputs.keyClicks["`"]) res.dev.showConsole = !res.dev.showConsole;
    }
  );

  let lastGPUBytes = 0;
  let avgGPUBytes = 0;
  let maxFrameGPUBytes = 0;

  const warmUpFrame = 60 * 3;
  let frameCount = 0;

  let lastF32s = 0;

  let pipelineTimes: Map<string, bigint> = new Map();

  em.registerSystem(
    "devConsole",
    Phase.RENDER,
    null,
    [RendererDef, TextDef, DevConsoleDef],
    async (_, res) => {
      frameCount++;

      if (PERF_DBG_GPU) {
        const frameBytes = _gpuQueueBufferWriteBytes - lastGPUBytes;

        if (warmUpFrame <= frameCount) {
          maxFrameGPUBytes = Math.max(maxFrameGPUBytes, frameBytes);
          if (frameBytes >= 1024 * 100) {
            console.log(`Big frame!: ${(frameBytes / 1024).toFixed(0)}kb`);
          }
        }

        avgGPUBytes = updateAvg(avgGPUBytes, frameBytes);
        lastGPUBytes = _gpuQueueBufferWriteBytes;
      }

      if (!res.dev.showConsole) {
        res.text.debugText = " ";
        return;
      }

      const usingWebGPU = res.renderer.usingWebGPU;

      const controlsStr = `[WASD space 1 2 3 4 5 r t]`;

      // TODO(@darzu): can net stats be re-enabled?
      let {
        reliableBufferSize,
        unreliableBufferSize,
        numDroppedUpdates,
        skew,
        ping,
      } = /*net
      ? net.stats()
      : */ {
        reliableBufferSize: 0,
        unreliableBufferSize: 0,
        numDroppedUpdates: 0,
        skew: [],
        ping: [],
      };

      if (frameCount % 60 === 0) {
        pipelineTimes = await res.renderer.renderer.stats();
      }

      let pipelineTimesTxts: string[] = [];
      pipelineTimes.forEach((time, pipeline) =>
        pipelineTimesTxts.push(
          `\n${pipeline} ${(Number(time / BigInt(1000)) / 1000).toFixed(2)}`
        )
      );

      const { avgFrameTime, avgJsTime, avgSimTime } = res.dev;

      const poolStats = res.renderer.renderer.getMeshPoolStats();

      const avgFPS = 1000 / avgFrameTime;

      // TODO(@darzu): PERF DBG
      const newF32s = _f32sCount - lastF32s;
      lastF32s = _f32sCount;

      const dbgTxt =
        controlsStr +
        ` ` +
        `js:${avgJsTime.toFixed(2)}ms ` +
        `sim:${avgSimTime.toFixed(2)}ms ` +
        `broad:(${_lastCollisionTestTimeMs.toFixed(1)}ms ` +
        `o:${_doesOverlapAABBs} e:${_enclosedBys} c:${_cellChecks}) ` +
        `fps:${avgFPS.toFixed(1)} ` +
        `tris:${poolStats.numTris} ` +
        `verts:${poolStats.numVerts} ` +
        (PERF_DBG_GPU ? `avgGpuBytes: ${avgGPUBytes.toFixed(0)}b ` : ``) +
        (PERF_DBG_GPU
          ? `allGpuBytes: ${(_gpuQueueBufferWriteBytes / (1024 * 1024)).toFixed(
              0
            )}mb `
          : ``) +
        (PERF_DBG_GPU
          ? `maxFrameGPUBytes: ${(maxFrameGPUBytes / 1024).toFixed(0)}kb `
          : ``) +
        //`buffers:(r=${reliableBufferSize}/u=${unreliableBufferSize}) ` +
        `dropped:${numDroppedUpdates} ` +
        `entities:${EM.entities.size} ` +
        `skew: ${skew.join(",")} ` +
        `ping: ${ping.join(",")} ` +
        `WebGPU pipelines: ${pipelineTimesTxts.join(",")} ` +
        (PERF_DBG_F32S
          ? `f32s: ${(
              (newF32s * Float32Array.BYTES_PER_ELEMENT) /
              1024
            ).toFixed(1)}kb `
          : "") +
        ``;

      res.text.debugText = dbgTxt;
    }
  );
}
