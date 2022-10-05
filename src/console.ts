import { EM, EntityManager } from "./entity-manager.js";
import { GPU_DBG_PERF } from "./flags.js";
import { TextDef } from "./game/ui.js";
import { InputsDef } from "./inputs.js";
import {
  _lastCollisionTestTimeMs,
  _doesOverlapAABBs,
  _enclosedBys,
  _cellChecks,
} from "./physics/broadphase.js";
import { _gpuQueueBufferWriteBytes } from "./render/data-webgpu.js";
import { RendererDef } from "./render/renderer-ecs.js";

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
  em.addSingletonComponent(DevConsoleDef);

  em.registerSystem(
    null,
    [InputsDef, DevConsoleDef],
    (_, res) => {
      if (res.inputs.keyClicks["`"]) res.dev.showConsole = !res.dev.showConsole;
    },
    "devConsoleToggle"
  );

  let lastGPUBytes = 0;
  let avgGPUBytes = 0;
  let maxFrameGPUBytes = 0;

  let warmUpFrame = 60 * 3;

  em.registerSystem(
    null,
    [RendererDef, TextDef, DevConsoleDef],
    async (_, res) => {
      warmUpFrame--;

      if (GPU_DBG_PERF) {
        const frameBytes = _gpuQueueBufferWriteBytes - lastGPUBytes;

        if (warmUpFrame <= 0) {
          maxFrameGPUBytes = Math.max(maxFrameGPUBytes, frameBytes);
          if (frameBytes >= 1024 * 100) {
            console.log(`Big frame!: ${(frameBytes / 1024).toFixed(0)}kb`);
          }
        }

        avgGPUBytes = updateAvg(avgGPUBytes, frameBytes);
        lastGPUBytes = _gpuQueueBufferWriteBytes;
      }

      if (!res.dev.showConsole) {
        res.text.debugText = "";
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

      const pipelineTimes = await res.renderer.renderer.stats();

      let pipelineTimesTxts: string[] = [];
      pipelineTimes.forEach((time, pipeline) =>
        pipelineTimesTxts.push(
          `\n${pipeline} ${(Number(time / BigInt(1000)) / 1000).toFixed(2)}`
        )
      );

      const { avgFrameTime, avgJsTime, avgSimTime } = res.dev;

      const poolStats = res.renderer.renderer.getMeshPoolStats();

      const avgFPS = 1000 / avgFrameTime;

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
        (GPU_DBG_PERF ? `avgGpuBytes: ${avgGPUBytes.toFixed(0)}b ` : ``) +
        (GPU_DBG_PERF
          ? `allGpuBytes: ${(_gpuQueueBufferWriteBytes / (1024 * 1024)).toFixed(
              0
            )}mb `
          : ``) +
        (GPU_DBG_PERF
          ? `maxFrameGPUBytes: ${(maxFrameGPUBytes / 1024).toFixed(0)}kb `
          : ``) +
        //`buffers:(r=${reliableBufferSize}/u=${unreliableBufferSize}) ` +
        `dropped:${numDroppedUpdates} ` +
        `entities:${EM.entities.size} ` +
        `skew: ${skew.join(",")} ` +
        `ping: ${ping.join(",")} ` +
        `${usingWebGPU ? "WebGPU" : "WebGL"} ` +
        `pipelines: ${pipelineTimesTxts.join(",")}`;

      res.text.debugText = dbgTxt;
    },
    "devConsole"
  );
}
