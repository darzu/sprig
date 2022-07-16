import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager, EM } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
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
import {
  uvBorderMaskPipeline,
  unwrapPipeline,
  uvToPosTex,
  uvPosBorderMaskPipeline,
} from "../render/pipelines/xp-uv-unwrap.js";
import { createComposePipelines } from "../render/pipelines/std-compose.js";
import { createGhost } from "./sandbox.js";
import { quat, vec2, vec3, vec4 } from "../gl-matrix.js";
import { createRef, Ref } from "../em_helpers.js";
import { TexTypeAsTSType } from "../render/gpu-struct.js";
import { CyTexturePtr } from "../render/gpu-registry.js";
import { never } from "../util.js";
import { assert } from "../test.js";
import { clamp } from "../math.js";
import { tempVec2, tempVec3, tempVec4 } from "../temp-pool.js";
import { vec3Dbg } from "../utils-3d.js";
import {
  jfaPreOutlinePipe,
  jfaPipelines,
} from "../render/pipelines/xp-jump-flood.js";

interface Ocean {
  ent: Ref<[typeof PositionDef]>;
  uvToPos: (out: vec3, uv: vec2) => vec3;
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
  read: (out: ArityToVec<A>, xi: number, yi: number) => ArityToVec<A>;
  sample: (out: ArityToVec<A>, x: number, y: number) => ArityToVec<A>;
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
    sample: sample as any as TextureReader<A>["sample"],
  };

  function getIdx(xi: number, yi: number): number {
    return (xi + yi * size[0]) * stride;
  }

  function read(
    out: number | vec2 | vec3 | vec4,
    x: number,
    y: number
  ): number | vec2 | vec3 | vec4 {
    const xi = clamp(Math.round(x), 0, size[0] - 1);
    const yi = clamp(Math.round(y), 0, size[1] - 1);
    const idx = getIdx(xi, yi);

    assert(typeof out === "number" || out.length === outArity);
    if (outArity === 1) {
      return f32[idx];
    } else if (outArity === 2) {
      return vec2.set(out as vec2, f32[idx], f32[idx + 1]);
    } else if (outArity === 3) {
      return vec3.set(out as vec3, f32[idx], f32[idx + 1], f32[idx + 2]);
    } else if (outArity === 4) {
      return vec4.set(
        out as vec4,
        f32[idx + 0],
        f32[idx + 1],
        f32[idx + 2],
        f32[idx + 3]
      );
    } else {
      never(outArity);
    }
  }

  // TODO(@darzu): probably inefficient way to do bounds checking
  function isDefault(xi: number, yi: number): boolean {
    if (outArity === 1) {
      return read(0, xi, yi) === 0;
    } else if (outArity === 2) {
      return vec2.equals(read(tempVec2(), xi, yi) as vec2, vec2.ZEROS);
    } else if (outArity === 3) {
      return vec3.equals(read(tempVec3(), xi, yi) as vec3, vec3.ZEROS);
    } else if (outArity === 4) {
      return vec4.equals(read(tempVec4(), xi, yi) as vec4, vec4.ZEROS);
    } else {
      never(outArity);
    }
  }

  function sample(
    out: number | vec2 | vec3 | vec4,
    x: number,
    y: number
  ): number | vec2 | vec3 | vec4 {
    x = clamp(x, 0, size[0] - 1);
    y = clamp(y, 0, size[1] - 1);
    const xi0 = Math.floor(x);
    const xi1 = Math.ceil(x);
    const yi0 = Math.floor(y);
    const yi1 = Math.ceil(y);
    const dx = x % 1.0;
    const dy = y % 1.0;
    let ix0y0 = getIdx(xi0, yi0);
    let ix1y0 = getIdx(xi1, yi0);
    let ix0y1 = getIdx(xi0, yi1);
    let ix1y1 = getIdx(xi1, yi1);

    // bounds check
    // TODO(@darzu): this is hacky and inefficient. At minimum we shouldn't
    //  need to read texture values twice.
    // TODO(@darzu): actually this might not be necessary at all. we should
    //  probably have an SDF texture from the edge anyway for pushing the
    //  player back.
    const def00 = isDefault(xi0, yi0);
    const def10 = isDefault(xi1, yi0);
    const def01 = isDefault(xi0, yi1);
    const def11 = isDefault(xi1, yi1);
    if (def00) ix0y0 = ix1y0;
    if (def10) ix1y0 = ix0y0;
    if (def01) ix0y1 = ix1y1;
    if (def11) ix1y1 = ix0y1;
    if (def00 && def10) {
      ix0y0 = ix0y1;
      ix1y0 = ix1y1;
    }
    if (def01 && def11) {
      ix0y1 = ix0y0;
      ix1y1 = ix1y0;
    }

    function _sample(offset: 0 | 1 | 2 | 3): number {
      const outAy0 = f32[ix0y0 + offset] * (1 - dx) + f32[ix1y0 + offset] * dx;
      const outAy1 = f32[ix0y1 + offset] * (1 - dx) + f32[ix1y1 + offset] * dx;
      const outA = outAy0 * (1 - dy) + outAy1 * dy;
      return outA;
    }

    assert(typeof out === "number" || out.length === outArity);
    if (outArity === 1) {
      return _sample(0);
    } else if (outArity === 2) {
      return vec2.set(out as vec2, _sample(0), _sample(1));
    } else if (outArity === 3) {
      return vec3.set(out as vec3, _sample(0), _sample(1), _sample(2));
    } else if (outArity === 4) {
      return vec4.set(
        out as vec4,
        _sample(0),
        _sample(1),
        _sample(2),
        _sample(3)
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
      em.ensureComponentOn(buoy, ScaleDef, [3, 3, 3]);
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
        let speed = 0.001;
        const newUV = vec2.copy(tempVec2(), e.uv.pos);
        if (res.inputs.keyDowns["shift"]) speed *= 5;
        if (res.inputs.keyDowns["arrowright"]) newUV[1] += speed;
        if (res.inputs.keyDowns["arrowleft"]) newUV[1] -= speed;
        if (res.inputs.keyDowns["arrowup"]) newUV[0] += speed;
        if (res.inputs.keyDowns["arrowdown"]) newUV[0] -= speed;
        newUV[0] = clamp(newUV[0], 0, 1);
        newUV[1] = clamp(newUV[1], 0, 1);
        const newPos = res.ocean.uvToPos(tempVec3(), newUV);
        // console.log(vec3Dbg(newPos));
        if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
          vec3.copy(e.position, newPos);
          vec2.copy(e.uv.pos, newUV);
        }
      }
    },
    "runOcean"
  );

  // let line: ReturnType<typeof drawLine>;

  let once = true;
  let once2 = 10; // TODO(@darzu): lol wat.

  let finalCompose = createComposePipelines();

  em.registerSystem(
    [],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      // TODO(@darzu): instead of all this one-time nosense, it'd be great
      //  to just submit async work to the GPU.
      if (once) {
        // one-time compute and render jobs
        res.renderer.pipelines = [
          initStars,

          // TODO(@darzu): package / abstract these more nicely?
          unwrapPipeline,
          uvBorderMaskPipeline,
          uvPosBorderMaskPipeline,
          jfaPreOutlinePipe,
          ...jfaPipelines,
        ];

        once = false;
      } else if (once2) {
        if (once2 === 1) {
          // read from one-time jobs
          // TODO(@darzu): what's the right way to handle these jobs
          res.renderer.renderer.readTexture(uvToPosTex).then((data) => {
            // const fs = new Float32Array(data);
            // // TODO(@darzu): really want a vec4 array as a view on Float32Array
            // console.dir(fs);
            // for (let f of fs) {
            //   // if (f !== 0 && f !== 1) console.log(f);
            // }

            // TODO(@darzu): Account for the 1px border in the texture!!!
            const reader = createTextureReader(
              data,
              uvToPosTex.size,
              3,
              uvToPosTex.format
            );

            console.log("adding OceanDef");

            // TODO(@darzu): hacky hacky way to do this
            em.addSingletonComponent(OceanDef, {
              ent: createRef(oceanEntId, [PositionDef]),
              uvToPos: (out, uv) => {
                const x = uv[0] * reader.size[0];
                const y = uv[1] * reader.size[1];
                // console.log(`${x},${y}`);
                return reader.sample(out, x, y);
              },
            });
          });
        }

        once2 -= 1;
      } else {
        // steady state rendering
        res.renderer.pipelines = [
          // unwrapPipeline, // TODO(@darzu): don't run many times
          shadowPipeline,
          stdRenderPipeline,
          outlineRender,
          // renderStars,
          // ...blurPipelines,

          // DEBUG:
          // shadowDbgDisplay,
          // normalDbg,
          // positionDbg,

          postProcess,
          ...finalCompose, // TODO(@darzu): should be last step
        ];
      }
    },
    "hyperspaceGame"
  );
}
