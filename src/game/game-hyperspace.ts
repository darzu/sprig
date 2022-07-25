import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager, EM } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
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
  unwrapPipeline,
  unwrapPipeline2,
  uvMaskTex,
  uvToNormTex,
  uvToPosTex,
  UVUNWRAP_MASK,
} from "../render/pipelines/xp-uv-unwrap.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createGhost } from "./game-sandbox.js";
import { quat, vec2, vec3, vec4 } from "../gl-matrix.js";
import { createRef, Ref } from "../em_helpers.js";
import { TexTypeAsTSType } from "../render/gpu-struct.js";
import { CyTexturePtr } from "../render/gpu-registry.js";
import { never } from "../util.js";
import { assert } from "../test.js";
import { clamp } from "../math.js";
import { tempVec2, tempVec3, tempVec4 } from "../temp-pool.js";
import { quatFromUpForward, vec3Dbg } from "../utils-3d.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { DevConsoleDef } from "../console.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { createTextureReader } from "../render/cpu-texture.js";

interface Ocean {
  ent: Ref<[typeof PositionDef]>;
  uvToPos: (out: vec3, uv: vec2) => vec3;
  uvToNorm: (out: vec3, uv: vec2) => vec3;
  // uvToNorm: TextureReader<"rgba32float">;
}
const OceanDef = EM.defineComponent("ocean", (o: Ocean) => {
  return o;
});

const UVObjDef = EM.defineComponent("uv", (uv: vec2 = [0, 0]) => ({
  uv: uv,
}));

// const BouyDef = EM.defineComponent(
//   "bouy",
//   (uv: vec2 = [0, 0], child?: Ref<[typeof PositionDef]>) => ({
//     uv: uv,
//     child: child ?? createRef(0, [PositionDef]),
//   })
// );

export const oceanJfa = createJfaPipelines(uvMaskTex, "exterior");

// export let jfaMaxStep = VISUALIZE_JFA ? 0 : 999;

export async function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  createShip([-120, 0, 0]);
  // }

  em.whenResources([MeDef]).then(() => createPlayer(em));

  let oceanEntId = -1;

  em.registerSystem(
    [],
    [],
    () => {
      // console.log("debugLoop");
      // em.whyIsntSystemBeingCalled("oceanGPUWork");
    },
    "debugLoop"
  );

  em.registerSystem(
    [UVObjDef, PositionDef, RotationDef],
    [OceanDef, InputsDef],
    (es, res) => {
      // console.log("runOcean");
      for (let e of es) {
        // TODO(@darzu): debug moving
        // console.log("moving buoy!");
        let speed = 0.001;
        const deltaUV = vec2.zero(tempVec2());
        if (res.inputs.keyDowns["shift"]) speed *= 5;
        if (res.inputs.keyDowns["arrowright"]) deltaUV[1] -= speed;
        if (res.inputs.keyDowns["arrowleft"]) deltaUV[1] += speed;
        if (res.inputs.keyDowns["arrowup"]) deltaUV[0] += speed;
        if (res.inputs.keyDowns["arrowdown"]) deltaUV[0] -= speed;
        if (deltaUV[0] !== 0.0 || deltaUV[1] !== 0.0) {
          const newUV = vec2.add(deltaUV, e.uv.uv, deltaUV);
          newUV[0] = clamp(newUV[0], 0, 1);
          newUV[1] = clamp(newUV[1], 0, 1);
          const newPos = res.ocean.uvToPos(tempVec3(), newUV);

          // console.log(vec3Dbg(newPos));
          if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
            const forward = vec3.sub(tempVec3(), newPos, e.position);
            vec3.copy(e.position, newPos);
            vec2.copy(e.uv.uv, newUV);

            const newNorm = res.ocean.uvToNorm(tempVec3(), newUV);
            // TODO(@darzu):
            quatFromUpForward(e.rotation, newNorm, forward);
            // quat.setAxisAngle(e.rotation, newNorm, Math.PI * 0.5);
          }
        }
      }
    },
    "runOcean"
  );

  let gridCompose = createGridComposePipelines();

  // TODO(@darzu): TEXTURES TODO:
  // [x] 2D voronoi texture to CPU
  // [x] 2D normals texture
  // [ ] 3D->3D voronoi texture
  // [ ] 3D->2D voronoi seeds lookup texture
  // [ ] 3D normals texture ?

  em.registerSystem(
    [],
    [
      GlobalCursor3dDef,
      RendererDef,
      InputsDef,
      TextDef,
      InputsDef,
      DevConsoleDef,
    ],
    async (cs, res) => {
      // steady state rendering
      res.renderer.pipelines = [
        // ...noisePipes,

        // TODO(@darzu): only run many times when debugging
        // ...jfaPipelines.slice(0, jfaMaxStep),
        // jfaToSdfPipe,
        // sdfBrightPipe,
        // sdfToRingsPipe,

        // unwrapPipeline,
        shadowPipeline,
        stdRenderPipeline,
        outlineRender,
        renderStars,
        ...blurPipelines,

        postProcess,
        ...(res.dev.showConsole ? gridCompose : []),
      ];
    },
    "hyperspaceGame"
  );

  const res = await em.whenResources([
    AssetsDef,
    GlobalCursor3dDef,
    RendererDef,
  ]);

  // const ghost = createGhost(em);
  // em.ensureComponentOn(ghost, RenderableConstructDef, res.assets.cube.proto);
  // ghost.controllable.speed *= 3;
  // ghost.controllable.sprintMul *= 3;

  {
    // // debug camera
    // vec3.copy(ghost.position, [-185.02, 66.25, -69.04]);
    // quat.copy(ghost.rotation, [0.0, -0.92, 0.0, 0.39]);
    // vec3.copy(ghost.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // ghost.cameraFollow.yawOffset = 0.0;
    // ghost.cameraFollow.pitchOffset = -0.465;
    // let g = ghost;
    // vec3.copy(g.position, [-208.43, 29.58, 80.05]);
    // quat.copy(g.rotation, [0.0, -0.61, 0.0, 0.79]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.486;
  }

  // one-time GPU jobs
  res.renderer.renderer.submitPipelines([], [...noisePipes, initStars]);

  const ocean = em.newEntity();
  oceanEntId = ocean.id; // hacky?
  em.ensureComponentOn(
    ocean,
    RenderableConstructDef,
    res.assets.ocean.proto,
    // TODO(@darzu): needed?
    true,
    0,
    UVUNWRAP_MASK
  );
  em.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
  // em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
  em.ensureComponentOn(ocean, PositionDef);

  let ocean2 = await em.whenEntityHas(ocean, [RenderableDef], "oceanGPUWork");

  // TODO(@darzu):
  res.renderer.renderer.submitPipelines(
    [ocean2.renderable.meshHandle],
    [unwrapPipeline, unwrapPipeline2, ...oceanJfa.allPipes()]
  );

  // read from one-time jobs
  // TODO(@darzu): what's the right way to handle these jobs
  const readPromises = [
    res.renderer.renderer.readTexture(uvToPosTex),
    res.renderer.renderer.readTexture(uvToNormTex),
  ];
  const [uvToPosData, uvToNormData] = await Promise.all(readPromises);

  // TODO(@darzu): Account for the 1px border in the texture!!!
  const uvToPosReader = createTextureReader(
    uvToPosData,
    uvToPosTex.size,
    3,
    uvToPosTex.format
  );

  const uvToNormReader = createTextureReader(
    uvToNormData,
    uvToNormTex.size,
    3,
    uvToNormTex.format
  );

  // console.log("adding OceanDef");

  // TODO(@darzu): hacky hacky way to do this
  em.addSingletonComponent(OceanDef, {
    ent: createRef(oceanEntId, [PositionDef]),
    uvToPos: (out, uv) => {
      const x = uv[0] * uvToPosReader.size[0];
      const y = uv[1] * uvToPosReader.size[1];
      // console.log(`${x},${y}`);
      return uvToPosReader.sample(out, x, y);
    },
    uvToNorm: (out, uv) => {
      const x = uv[0] * uvToNormReader.size[0];
      const y = uv[1] * uvToNormReader.size[1];
      // console.log(`${x},${y}`);
      return uvToNormReader.sample(out, x, y);
    },
  });
  // em.ensureComponentOn(ocean, PositionDef, [120, 0, 0]);
  // vec3.scale(ocean.position, ocean.position, scale);
  // const scale = 100.0;
  // const scale = 1.0;
  // em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);
  // em.ensureComponentOn(ocean, AngularVelocityDef, [0.0001, 0.0001, 0.0001]);

  // TODO(@darzu): DEBUG quad mesh stuff
  const fabric = em.newEntity();
  em.ensureComponentOn(
    fabric,
    RenderableConstructDef,
    res.assets.fabric.proto
    // true,
    // 0
    // UVUNWRAP_MASK
  );
  em.ensureComponentOn(fabric, PositionDef, [10, 10, 10]);
  // em.ensureComponentOn(fabric, AngularVelocityDef, [1.0, 10.0, 0.1]);

  const buoy = em.newEntity();
  em.ensureComponentOn(buoy, PositionDef);
  em.ensureComponentOn(buoy, RenderableConstructDef, res.assets.ship.proto);
  em.ensureComponentOn(buoy, ScaleDef, [1.0, 1.0, 1.0]);
  em.ensureComponentOn(buoy, ColorDef, [0.2, 0.8, 0.2]);
  em.ensureComponentOn(buoy, UVObjDef, [0.1, 0.1]);
}
