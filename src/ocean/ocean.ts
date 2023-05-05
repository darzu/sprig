import { AnimateToDef } from "../animation/animate-to.js";
import { createRef, Ref } from "../ecs/em_helpers.js";
import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { clamp } from "../utils/math.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import {
  GerstnerWaveTS,
  oceanPoolPtr,
  RenderDataOceanDef,
} from "../render/pipelines/std-ocean.js";
import {
  unwrapPipeline,
  unwrapPipeline2,
  uvMaskTex,
  uvToNormTex,
  uvToPosTex,
  uvToTangTex,
} from "../render/pipelines/xp-uv-unwrap.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "../temp-pool.js";
import { TimeDef } from "../time/time.js";
import { asyncTimeout, dbgLogOnce, range } from "../utils/util.js";
import {
  quatDbg,
  quatFromUpForward,
  randNormalVec2,
  vec2Dbg,
  vec3Dbg,
} from "../utils/utils-3d.js";
import { AssetsDef } from "../meshes/assets.js";
import { ColorDef } from "../color/color-ecs.js";
import { DEFAULT_MASK, UVUNWRAP_MASK } from "../render/pipeline-masks.js";
import { Mesh } from "../meshes/mesh.js";
import { compute_gerstner, createWaves } from "./gerstner.js";

// TODO(@darzu): refactor this to not assume a specific ocean shape

// TODO(@darzu): what is an ocean
//    water surface
//    defined by gerstner waves
//    bounded by some mesh
//      a uv mesh
//      waves operates on 0-1 uvs
//      need to translate
//    has position

// TODO(@darzu): could possibly be generalize to work with polar coordinates?
// TODO(@darzu): perhaps there should be a uv + "height" which is just displacement along the normal
export interface UVSurface {
  // TODO(@darzu): Goal: translate to/from 3D world/local space and 2D uv space
  ent: Ref<[typeof PositionDef]>;
  // TODO(@darzu): uvDistanceToEdge, read the SDF
  uvToPos: (out: vec3, uv: vec2) => vec3;
  // TODO(@darzu): normal and tangent could probably come straight from CPU mesh
  uvToNorm: (out: vec3, uv: vec2) => vec3;
  uvToTang: (out: vec3, uv: vec2) => vec3;
  uvToEdgeDist: (uv: vec2) => number;
  uvToGerstnerDispAndNorm: (outDisp: vec3, outNorm: vec3, uv: vec2) => void;
  gerstnerWaves: GerstnerWaveTS[];
}

// TODO(@darzu): rename "ocean" to "uvsurface" or similar
export const OceanDef = EM.defineComponent("ocean", (o: UVSurface) => {
  return o;
});

export const UVPosDef = EM.defineComponent(
  "uvPos",
  (uv?: vec2) => uv ?? vec2.create()
);
EM.registerSerializerPair(
  UVPosDef,
  (o, buf) => buf.writeVec2(o),
  (o, buf) => buf.readVec2(o)
);

export const UVDirDef = EM.defineComponent(
  "uvDir",
  (dir?: vec2) => dir ?? vec2.fromValues(0, 1)
);
EM.registerSerializerPair(
  UVDirDef,
  (o, buf) => buf.writeVec2(o),
  (o, buf) => buf.readVec2(o)
);

// const BouyDef = EM.defineComponent(
//   "bouy",
//   (uv: vec2 = [0, 0], child?: Ref<[typeof PositionDef]>) => ({
//     uv: uv,
//     child: child ?? createRef(0, [PositionDef]),
//   })
// );

export const oceanJfa = createJfaPipelines(uvMaskTex, "exterior");

export async function initOcean(oceanMesh: Mesh, color: vec3) {
  // console.log("initOcean");
  const res = await EM.whenResources(RendererDef, TimeDef);

  const ocean = EM.new();
  let oceanEntId = ocean.id; // hacky?
  EM.ensureComponentOn(
    ocean,
    RenderableConstructDef,
    // TODO(@darzu): SEPERATE THIS DEPENDENCY! Need ocean w/o mesh
    oceanMesh,
    // TODO(@darzu): needed?
    true,
    0,
    UVUNWRAP_MASK | DEFAULT_MASK,
    oceanPoolPtr
    // meshPoolPtr
  );
  EM.ensureComponentOn(ocean, ColorDef, color);
  //EM.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
  EM.ensureComponentOn(ocean, PositionDef);

  let ocean2 = await EM.whenEntityHas(ocean, RenderableDef, RenderDataOceanDef);
  // let ocean2 = await EM.whenEntityHas(ocean, RenderableDef, RenderDataStdDef);

  // TODO(@darzu):
  const preOceanGPU = performance.now();

  res.renderer.renderer
    .getCyResource(oceanPoolPtr)!
    .updateUniform(ocean2.renderable.meshHandle, ocean2.renderDataOcean);

  res.renderer.renderer.submitPipelines(
    [ocean2.renderable.meshHandle],
    // [unwrapPipeline, unwrapPipeline2]
    [unwrapPipeline, unwrapPipeline2, ...oceanJfa.allPipes()]
  );

  // read from one-time jobs
  // TODO(@darzu): what's the right way to handle these jobs
  const readPromises = [
    res.renderer.renderer.readTexture(uvToPosTex),
    res.renderer.renderer.readTexture(uvToNormTex),
    res.renderer.renderer.readTexture(uvToTangTex),
    // TODO(@darzu): JFA alignment issue! see note in readTexture
    res.renderer.renderer.readTexture(oceanJfa.sdfTex),
  ];

  const [
    uvToPosData,
    uvToNormData,
    uvToTangData,
    sdfData,
    //
  ] = await Promise.all(readPromises);

  const timeOceanGPU = performance.now() - preOceanGPU;
  console.log(`ocean GPU round-trip: ${timeOceanGPU.toFixed(2)}ms`);

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

  const uvToTangReader = createTextureReader(
    uvToTangData,
    uvToTangTex.size,
    3,
    uvToTangTex.format
  );

  const sdfReader = createTextureReader(
    sdfData,
    oceanJfa.sdfTex.size,
    1,
    oceanJfa.sdfTex.format
  );

  const uvToPos = (out: vec3, uv: vec2) => {
    dbgLogOnce(`uvToPos is disabled! tex format issues`, undefined, true);
    const x = uv[0] * uvToPosReader.size[0];
    const y = uv[1] * uvToPosReader.size[1];
    // console.log(`${x},${y}`);
    return uvToPosReader.sample(x, y, out);
  };
  const uvToNorm = (out: vec3, uv: vec2) => {
    dbgLogOnce(`uvToNorm is disabled! tex format issues`, undefined, true);
    const x = uv[0] * uvToNormReader.size[0];
    const y = uv[1] * uvToNormReader.size[1];
    // console.log(`${x},${y}`);
    return uvToNormReader.sample(x, y, out);
  };
  const uvToTang = (out: vec3, uv: vec2) => {
    dbgLogOnce(`uvToTang is disabled! tex format issues`, undefined, true);
    const x = uv[0] * uvToTangReader.size[0];
    const y = uv[1] * uvToTangReader.size[1];
    // console.log(`${x},${y}`);
    return uvToTangReader.sample(x, y, out);
  };
  // TODO(@darzu): re-enable
  const uvToEdgeDist = (uv: vec2) => {
    dbgLogOnce(`uvToEdgeDist is disabled! tex format issues`, undefined, true);
    const x = uv[0] * uvToNormReader.size[0];
    const y = uv[1] * uvToNormReader.size[1];
    return sdfReader.sample(x, y);
  };

  const gerstnerWaves = createWaves();

  // TODO(@darzu): HACK!
  const __temp1 = vec2.create();
  const __temp2 = vec3.create();
  const __temp3 = vec3.create();
  const __temp4 = vec3.create();
  const __temp5 = vec3.create();
  const __temp6 = vec3.create();
  const __temp7 = vec3.create();
  const __temp8 = vec3.create();
  const __temp9 = vec3.create();
  const __temp10 = vec3.create();
  const __temp11 = vec3.create();
  const uvToGerstnerDispAndNorm = (outDisp: vec3, outNorm: vec3, uv: vec2) => {
    // console.log(`uv: ${uv}`);
    // TODO(@darzu): impl
    compute_gerstner(
      outDisp,
      outNorm,
      gerstnerWaves,
      // TODO(@darzu): reconcile input xy and uv or worldspace units
      // TODO(@darzu): wtf is this 1000x about?!
      vec2.scale(uv, 1000, __temp1),
      // uv,
      res.time.time
    );

    // TODO(@darzu): OCEAN. waht is this code below?
    // TODO(@darzu): OCEAN. Something below is essential for hyperspace game:
    const pos = uvToPos(__temp2, uv);
    const norm = uvToNorm(__temp3, uv);
    const tang = uvToTang(__temp4, uv);
    const perp = vec3.cross(tang, norm, __temp5);
    const disp = vec3.add(
      vec3.scale(perp, outDisp[0], __temp6),
      vec3.add(
        vec3.scale(norm, outDisp[1], __temp7),
        vec3.scale(tang, outDisp[2], __temp8),
        __temp11
      ),
      __temp9
    );
    // outDisp[0] = pos[0] + disp[0] * 0.5;
    // outDisp[1] = pos[1] + disp[1];
    // outDisp[2] = pos[2] + disp[2] * 0.5;
    // outDisp[0] = pos[0] + disp[0] * 0.5;
    // outDisp[1] = pos[1] + disp[1];
    // outDisp[2] = pos[2] + disp[2] * 0.5;
    vec3.add(pos, disp, outDisp);

    const gNorm = vec3.add(
      vec3.scale(perp, outNorm[0], __temp6),
      vec3.add(
        vec3.scale(norm, outNorm[1], __temp7),
        vec3.scale(tang, outNorm[2], __temp8),
        __temp11
      ),
      __temp10
    );
    vec3.copy(outNorm, gNorm);

    // HACK: smooth out norm?
    vec3.add(outNorm, vec3.scale(norm, 2.0, __temp6), outNorm);
    vec3.normalize(outNorm, outNorm);
  };

  // TODO(@darzu): hacky hacky way to do this
  const oceanRes = EM.addResource(OceanDef, {
    ent: createRef(oceanEntId, [PositionDef]),
    uvToPos,
    uvToNorm,
    uvToTang,
    uvToEdgeDist,
    uvToGerstnerDispAndNorm,
    // TODO: enforce programmatically that sum(Q_i * A_i * w_i) <= 1.0
    gerstnerWaves,
  });

  res.renderer.renderer.updateGerstnerWaves(oceanRes.gerstnerWaves);
  res.renderer.renderer.updateScene({
    numGerstnerWaves: oceanRes.gerstnerWaves.length,
  });

  // TODO(@darzu): Gerstner on CPU
  // res.time.time
}

const __temp1 = vec3.create();
const __temp2 = vec3.create();
EM.registerSystem(
  [UVPosDef, PositionDef],
  [OceanDef],
  (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
      // TODO(@darzu): need some notion of UV parenting?
      if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0) continue;
      if (AnimateToDef.isOn(e)) continue;
      // console.log(`copying: ${e.id}`);
      const newPos = __temp1;
      res.ocean.uvToGerstnerDispAndNorm(newPos, __temp2, e.uvPos);
      // const newPos = res.ocean.uvToPos(tempVec3(), e.uvPos);

      // if (e.id > 10001) {
      //   // [-347.83,25.77,126.72]
      //   // [-347.83,25.77,126.72]
      //   console.log(
      //     `moving: ${e.id} at uv ${vec2Dbg(e.uvPos)} from ${vec3Dbg(
      //       e.position
      //     )} to ${vec3Dbg(newPos)}`
      //   );
      // }

      if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
        vec3.copy(e.position, newPos);
        // console.log(`moving to: ${vec3Dbg(e.position)}`);
      }
    }
  },
  "oceanUVtoPos"
);

const __temp3 = vec2.create();
const __temp4 = vec3.create();
EM.registerSystem(
  [UVPosDef, UVDirDef, PositionDef, RotationDef],
  [OceanDef],
  (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
      // TODO(@darzu): need some notion of UV parenting?
      if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0) continue;
      if (AnimateToDef.isOn(e)) continue;
      // console.log(`copying: ${e.id}`);

      // const newNorm = tempVec3();
      // res.ocean.uvToGerstnerDispAndNorm(tempVec3(), newNorm, e.uvPos);
      // vec3.copy(e.rotation, newNorm);

      // TODO(@darzu): this is horrible.
      // console.log(`copying: ${e.id}`);
      // const newNorm = tempVec3();
      // res.ocean.uvToGerstnerDispAndNorm(tempVec3(), newNorm, e.uvPos);
      // vec3.copy(e.rotation, newNorm);
      // TODO(@darzu): this is horrible.
      vec2.normalize(e.uvDir, e.uvDir);
      const scaledUVDir = vec2.scale(e.uvDir, 0.0001, __temp3);
      const aheadUV = vec2.add(e.uvPos, scaledUVDir, __temp3);
      const aheadPos = __temp1;
      res.ocean.uvToGerstnerDispAndNorm(aheadPos, __temp2, aheadUV);
      // const aheadPos = res.ocean.uvToPos(tempVec3(), aheadUV);

      // TODO(@darzu): want SDF-based bounds checking
      if (!vec3.exactEquals(aheadPos, vec3.ZEROS)) {
        const forwardish = vec3.sub(aheadPos, e.position, __temp1);
        const newNorm = __temp2;
        res.ocean.uvToGerstnerDispAndNorm(__temp4, newNorm, e.uvPos);
        quatFromUpForward(e.rotation, newNorm, forwardish);
        // console.log(
        //   `UVDir ${[e.uvDir[0], e.uvDir[1]]} -> ${quatDbg(e.rotation)}`
        // );
      }
    }
  },
  "oceanUVDirToRot"
);

// TODO(@darzu): debug movement on the ocean
// EM.registerSystem(
//   [UVPosDef, UVDirDef, PositionDef, RotationDef],
//   [OceanDef, InputsDef],
//   (es, res) => {
//     // console.log("runOcean");
//     for (let e of es) {
//       // TODO(@darzu): debug moving
//       // console.log("moving buoy!");
//       let speed = 0.001;
//       const deltaUV = vec2.zero(tempVec2());
//       if (res.inputs.keyDowns["shift"]) speed *= 5;
//       if (res.inputs.keyDowns["arrowright"]) deltaUV[1] -= speed;
//       if (res.inputs.keyDowns["arrowleft"]) deltaUV[1] += speed;
//       if (res.inputs.keyDowns["arrowup"]) deltaUV[0] += speed;
//       if (res.inputs.keyDowns["arrowdown"]) deltaUV[0] -= speed;
//       if (deltaUV[0] !== 0.0 || deltaUV[1] !== 0.0) {
//         const newUV = vec2.add(tempVec2(), e.uvPos, deltaUV);

//         // TODO(@darzu): need a better way to see if UV is out of map bounds
//         const newPos = res.ocean.uvToPos(tempVec3(), newUV);
//         if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
//           vec2.copy(e.uvPos, newUV);
//           vec2.copy(e.uvDir, deltaUV);
//         }
//       }
//     }
//   },
//   "runOcean"
// );

// TODO(@darzu): ocean texture posibilities:
// [x] 2D voronoi texture to CPU
// [x] 2D normals texture
// [ ] 3D->3D voronoi texture
// [ ] 3D->2D voronoi seeds lookup texture
// [ ] 3D normals texture ?
