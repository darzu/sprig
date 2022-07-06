import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager, EM } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-pipeline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { shadowPipeline } from "../render/pipelines/std-shadow.js";
import { initStars, renderStars } from "../render/pipelines/xp-stars.js";
import { AssetsDef } from "./assets.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { TextDef } from "./ui.js";
import { MeDef } from "../net/components.js";
import { createPlayer } from "./player.js";
import { createShip } from "./ship.js";
import { GameStateDef } from "./gamestate.js";
import { unwrapPipeline, unwrapTex } from "../render/pipelines/xp-uv-unwrap.js";
import { createComposePipeline } from "../render/pipelines/std-compose.js";
import { createGhost } from "./sandbox.js";
import { quat, vec2, vec3, vec4 } from "../gl-matrix.js";
import { createRef, Ref } from "../em_helpers.js";
import { TexTypeAsTSType } from "../render/gpu-struct.js";
import { CyTexturePtr } from "../render/gpu-registry.js";
import { never } from "../util.js";
import { assert } from "../test.js";
import { clamp } from "../math.js";

interface Ocean {
  ent: Ref<[typeof PositionDef]>;
  uvToPos: (uv: vec2) => vec3;
  // uvToNorm: TextureReader<"rgba32float">;
}
const OceanDef = EM.defineComponent("ocean", (o: Ocean) => {
  return o;
});

const UVPosDef = EM.defineComponent("uv", (pos: vec2 = [0, 0]) => ({
  pos: pos,
}));

type ArityToVec<N extends 1 | 2 | 3 | 4> = N extends 1
  ? number
  : N extends 2
  ? vec2
  : N extends 3
  ? vec3
  : N extends 4
  ? vec4
  : never;

interface TextureReader<A extends 1 | 2 | 3 | 4> {
  size: vec2;
  data: ArrayBuffer;
  format: GPUTextureFormat;
  outArity: A;
  read: (x: number, y: number) => ArityToVec<A>;
}

function createTextureReader<A extends 1 | 2 | 3 | 4>(
  data: ArrayBuffer,
  size: vec2,
  outArity: A,
  format: GPUTextureFormat
): TextureReader<A> {
  const f32 = new Float32Array(data);

  let stride: number;
  if (format === "rgba32float") {
    stride = 4;
  } else {
    throw new Error(`unimplemented texture format: ${format} in TextureReader`);
  }

  assert(outArity <= stride, "outArity <= stride");

  return {
    size,
    data,
    format,
    outArity,
    read: read as any as TextureReader<A>["read"],
  };

  function read(x: number, y: number): number | vec2 | vec3 | vec4 {
    const idx = (Math.floor(x) + Math.floor(y) * size[0]) * stride;
    // console.log(idx);
    // TODO(@darzu): don't create new floats
    if (outArity === 1) {
      return f32[idx];
    } else if (outArity === 2) {
      return vec2.fromValues(f32[idx], f32[idx + 1]);
    } else if (outArity === 3) {
      return vec3.fromValues(f32[idx], f32[idx + 1], f32[idx + 2]);
    } else if (outArity === 4) {
      return vec4.fromValues(
        f32[idx + 0],
        f32[idx + 1],
        f32[idx + 2],
        f32[idx + 3]
      );
    } else {
      never(outArity);
    }
  }
}

export function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  createShip([-120, 0, 0]);
  // }

  // em.registerOneShotSystem(null, [MeDef], () => createPlayer(em));

  let oceanEntId = -1;

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      const ghost = createGhost(em);
      em.ensureComponentOn(
        ghost,
        RenderableConstructDef,
        res.assets.cube.proto
      );
      ghost.controllable.speed *= 3;
      ghost.controllable.sprintMul *= 3;

      {
        // debug camera
        vec3.copy(ghost.position, [-185.02, 66.25, -69.04]);
        quat.copy(ghost.rotation, [0.0, -0.92, 0.0, 0.39]);
        vec3.copy(ghost.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        ghost.cameraFollow.yawOffset = 0.0;
        ghost.cameraFollow.pitchOffset = -0.465;
      }

      // TODO(@darzu): call one-shot initStars
      const ocean = em.newEntity();
      oceanEntId = ocean.id; // hacky?
      em.ensureComponentOn(
        ocean,
        RenderableConstructDef,
        res.assets.ocean.proto
      );
      em.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
      // em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
      em.ensureComponentOn(ocean, PositionDef);
      // em.ensureComponentOn(ocean, PositionDef, [120, 0, 0]);
      // vec3.scale(ocean.position, ocean.position, scale);
      // const scale = 100.0;
      // const scale = 1.0;
      // em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);

      // TODO(@darzu): DEBUG quad mesh stuff
      const fabric = em.newEntity();
      em.ensureComponentOn(
        fabric,
        RenderableConstructDef,
        res.assets.fabric.proto
      );
      em.ensureComponentOn(fabric, PositionDef, [10, 10, 10]);

      const buoy = em.newEntity();
      em.ensureComponentOn(buoy, PositionDef);
      em.ensureComponentOn(buoy, RenderableConstructDef, res.assets.ball.proto);
      em.ensureComponentOn(buoy, ScaleDef, [5, 5, 5]);
      em.ensureComponentOn(buoy, ColorDef, [0.2, 0.8, 0.2]);
      em.ensureComponentOn(buoy, UVPosDef, [0.5, 0.5]);
    }
  );

  em.registerSystem(
    [UVPosDef, PositionDef],
    [OceanDef, InputsDef],
    (es, res) => {
      // console.log("runOcean");
      for (let e of es) {
        // TODO(@darzu): debug moving
        // console.log("moving buoy!");
        if (res.inputs.keyDowns["arrowright"]) e.uv.pos[0] += 0.001;
        if (res.inputs.keyDowns["arrowleft"]) e.uv.pos[0] -= 0.001;
        if (res.inputs.keyDowns["arrowup"]) e.uv.pos[1] += 0.001;
        if (res.inputs.keyDowns["arrowdown"]) e.uv.pos[1] -= 0.001;
        e.uv.pos[0] = clamp(e.uv.pos[0], 0, 1);
        e.uv.pos[1] = clamp(e.uv.pos[1], 0, 1);
        const newPos = res.ocean.uvToPos(e.uv.pos);
        if (newPos.every((n) => !isNaN(n))) vec3.copy(e.position, newPos);
      }
    },
    "runOcean"
  );

  // let line: ReturnType<typeof drawLine>;

  let once = true;
  let once2 = 10; // TODO(@darzu): lol wat.

  let finalCompose = createComposePipeline();

  em.registerSystem(
    [],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (once) {
        // one-time compute and render jobs
        res.renderer.pipelines = [initStars, unwrapPipeline];

        once = false;
      } else if (once2) {
        if (once2 === 1) {
          // read from one-time jobs
          // TODO(@darzu): what's the right way to handle these jobs
          res.renderer.renderer.readTexture(unwrapTex).then((data) => {
            // const fs = new Float32Array(data);
            // // TODO(@darzu): really want a vec4 array as a view on Float32Array
            // console.dir(fs);
            // for (let f of fs) {
            //   // if (f !== 0 && f !== 1) console.log(f);
            // }

            const reader = createTextureReader(
              data,
              unwrapTex.size,
              3,
              unwrapTex.format
            );

            console.log("adding OceanDef");

            // TODO(@darzu): hacky hacky way to do this
            em.addSingletonComponent(OceanDef, {
              ent: createRef(oceanEntId, [PositionDef]),
              uvToPos: (uv) => {
                const x = uv[0] * reader.size[0];
                const y = uv[1] * reader.size[1];
                // console.log(`${x},${y}`);
                return reader.read(x, y);
              },
            });
          });
        }

        once2 -= 1;
      } else {
        // steady state rendering
        res.renderer.pipelines = [
          unwrapPipeline, // TODO(@darzu): don't run many times
          shadowPipeline,
          stdRenderPipeline,
          finalCompose, // TODO(@darzu): should be last step
          outlineRender,
          // renderStars,
          // ...blurPipelines,
          // shadowDbgDisplay,
          // normalDbg,
          // positionDbg,
          postProcess,
        ];
      }
    },
    "hyperspaceGame"
  );
}
