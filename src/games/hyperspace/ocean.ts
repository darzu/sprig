import { AnimateToDef } from "../../animate-to.js";
import { createRef, Ref } from "../../em_helpers.js";
import { EM, EntityManager } from "../../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../../sprig-matrix.js";
import { InputsDef } from "../../inputs.js";
import { clamp } from "../../math.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../../physics/transform.js";
import { createTextureReader } from "../../render/cpu-texture.js";
import { createJfaPipelines } from "../../render/pipelines/std-jump-flood.js";
import {
  GerstnerWaveTS,
  oceanPoolPtr,
  RenderDataOceanDef,
} from "../../render/pipelines/std-ocean.js";
import {
  unwrapPipeline,
  unwrapPipeline2,
  uvMaskTex,
  uvToNormTex,
  uvToPosTex,
  uvToTangTex,
} from "../../render/pipelines/xp-uv-unwrap.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../../render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "../../temp-pool.js";
import { TimeDef } from "../../time.js";
import { asyncTimeout, range } from "../../util.js";
import {
  quatDbg,
  quatFromUpForward,
  randNormalVec2,
  vec2Dbg,
  vec3Dbg,
} from "../../utils-3d.js";
import { AssetsDef } from "../../assets.js";
import { ColorDef } from "../../color-ecs.js";
import { DEFAULT_MASK, UVUNWRAP_MASK } from "../../render/pipeline-masks.js";
import { Mesh } from "../../render/mesh.js";

// TODO(@darzu): refactor this to not assume a specific ocean shape

const DISABLE_GERSTNER = false;

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

  // console.log("adding OceanDef");

  const edgeLen = 4.0; // TODO(@darzu): parameterize? Based on worldUnitPerOceanVerts
  const minLen = 2 * edgeLen;

  // artist parameters:
  // const medLen = minLen * 2.0;
  // const medLen = minLen * 2.0;
  const medLen = 10;
  // const medLen = minLen * 2000.0;
  // const medLen = 16000.0; // TODO(@darzu): This equates to ~100 world units. WHY is this so far off?
  // const medLen = 100.0;
  // const steepness = 0.5; // 0-1
  const steepness = 1; // 0-1
  // const speed = 10.0; // meters per second
  // const speed = 100000.0; // meters per second
  const speed = 100.0; // TODO(@darzu): Speed definitely isn't working right yet
  // const speed = 1.0;
  // const speed = 0;
  const medAmp = 5.0; // author's choice

  const dt = 60 / 1000; // TODO(@darzu): maybe?
  const GRAV = 9.8 * dt * dt;
  // const GRAV = 9.8; // m/s^2, assumes world dist 1 = 1 meter
  // TODO(@darzu): which one?!
  const freqFromLen = (l: number) => Math.sqrt((GRAV * Math.PI * 2.0) / l);
  // const freqFromLen = (l: number) => 2 / l;

  const ampOverLen = medAmp / medLen;

  // const dir3 = randNormalVec2(vec2.create());
  // const medDir = V(0.6656193733215332, -0.7462913990020752);
  // const medDir = V(0.0, -1);
  const medDir = V(1.0, 0.0);
  // console.dir({ dir1, dir2, dir3 });

  type GerstnerParam = {
    dirOff: vec2;
    lenFactor: number;
  };

  const waveParams: GerstnerParam[] = [
    { dirOff: V(0, 0), lenFactor: 1.0 },
    // {
    //   dirOff: V(0, 1),
    //   lenFactor: 0.21,
    // },
    // {
    //   dirOff: V(0, -1),
    //   lenFactor: 0.3,
    // },
    // {
    //   dirOff: V(0, 0.5),
    //   lenFactor: 0.4,
    // },
    // {
    //   dirOff: V(1, 1),
    //   lenFactor: 0.5,
    // },
    // {
    //   dirOff: V(1, -1),
    //   lenFactor: 2.0,
    // },
    // {
    //   dirOff: V(1, -1.5),
    //   lenFactor: 4.0,
    // },
  ];

  let numWaves = waveParams.length;
  let gerstnerWaves: GerstnerWaveTS[] = [];
  for (let p of waveParams) {
    const dir = vec2.clone(vec2.normalize(vec2.add(medDir, p.dirOff)));
    // const len = 2.0; // distance between crests
    const len = medLen * p.lenFactor;
    // const crestSpeed = speed / (len * dt); // crest distance per second
    const crestSpeed = speed / len;
    // const freq = (2 * Math.PI) / len;
    const freq = freqFromLen(len);
    // console.log(`len: ${len}`);
    // console.log(`freq: ${freq}`);
    // const amp = 1.0; // crest height
    const amp = medAmp; // crest height
    const phi = crestSpeed * freq;
    // const Q = 1.08 * 4.0;
    const Q = steepness / (freq * amp * numWaves);
    // const Q = steepness / (freq * len * numWaves);

    gerstnerWaves.push(createGerstnerWave(Q, amp, dir, freq, phi));
  }
  // {
  //   const dir = ;
  //   const len = medLen * 0.5;
  //   const crestSpeed = speed / len;
  //   const freq = freqFromLen(len);
  //   const amp = len * ampOverLen;
  //   const phi = crestSpeed * freq;
  //   const Q = steepness / (freq * amp * numWaves);
  //   gerstnerWaves.push(createGerstnerWave(Q, amp, dir, freq, phi));
  // }
  // {
  //   const dir = ;
  //   const len = medLen * 2.0;
  //   const crestSpeed = speed / len;
  //   const freq = freqFromLen(len);
  //   const amp = len * ampOverLen;
  //   const phi = crestSpeed * freq;
  //   const Q = steepness / (freq * amp * numWaves);
  //   gerstnerWaves.push(createGerstnerWave(Q, amp, dir, freq, phi));
  // }

  // createGerstnerWave(1.08 * 2.0, 10 * 0.5, dir1, 0.5 / 20.0, 0.5),
  // createGerstnerWave(1.08 * 2.0, 10 * 0.5, dir2, 0.5 / 20.0, 0.5),
  // createGerstnerWave(1.08 * 2.0, 2 * 0.5, dir3, 0.5 / 4.0, 1),
  // createGerstnerWave(1.08 * 4.0, 0.05 * 0.5, dir2, 0.5 / 0.1, 1),
  //createGerstnerWave(1, 0.5, randNormalVec2(vec2.create()), 0.5 / 1.0, 3),
  // ];

  const uvToPos = (out: vec3, uv: vec2) => {
    const x = uv[0] * uvToPosReader.size[0];
    const y = uv[1] * uvToPosReader.size[1];
    // console.log(`${x},${y}`);
    return uvToPosReader.sample(x, y, out);
  };
  const uvToNorm = (out: vec3, uv: vec2) => {
    const x = uv[0] * uvToNormReader.size[0];
    const y = uv[1] * uvToNormReader.size[1];
    // console.log(`${x},${y}`);
    return uvToNormReader.sample(x, y, out);
  };
  const uvToTang = (out: vec3, uv: vec2) => {
    const x = uv[0] * uvToTangReader.size[0];
    const y = uv[1] * uvToTangReader.size[1];
    // console.log(`${x},${y}`);
    return uvToTangReader.sample(x, y, out);
  };
  // TODO(@darzu): re-enable
  const uvToEdgeDist = (uv: vec2) => {
    const x = uv[0] * uvToNormReader.size[0];
    const y = uv[1] * uvToNormReader.size[1];
    return sdfReader.sample(x, y);
  };

  const uvToGerstnerDispAndNorm = (outDisp: vec3, outNorm: vec3, uv: vec2) => {
    // TODO(@darzu): impl
    gerstner(
      outDisp,
      outNorm,
      gerstnerWaves,
      vec2.scale(uv, 1000),
      res.time.time * 0.001
    );

    const pos = uvToPos(tempVec3(), uv);
    const norm = uvToNorm(tempVec3(), uv);
    const tang = uvToTang(tempVec3(), uv);
    const perp = vec3.cross(tang, norm);
    const disp = vec3.add(
      vec3.scale(perp, outDisp[0]),
      vec3.add(vec3.scale(norm, outDisp[1]), vec3.scale(tang, outDisp[2]))
    );
    // outDisp[0] = pos[0] + disp[0] * 0.5;
    // outDisp[1] = pos[1] + disp[1];
    // outDisp[2] = pos[2] + disp[2] * 0.5;
    // outDisp[0] = pos[0] + disp[0] * 0.5;
    // outDisp[1] = pos[1] + disp[1];
    // outDisp[2] = pos[2] + disp[2] * 0.5;
    vec3.add(pos, disp, outDisp);

    const gNorm = vec3.add(
      vec3.scale(perp, outNorm[0]),
      vec3.add(vec3.scale(norm, outNorm[1]), vec3.scale(tang, outNorm[2]))
    );
    vec3.copy(outNorm, gNorm);

    // HACK: smooth out norm?
    vec3.add(outNorm, vec3.scale(norm, 2.0), outNorm);
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

// IMPORTANT NOTE: maintain compatibility with std-ocean.wgsl
function gerstner(
  outDisp: vec3,
  outNorm: vec3,
  waves: GerstnerWaveTS[],
  uv: vec2,
  t: number
): void {
  vec3.zero(outDisp);
  vec3.zero(outNorm);
  for (let i = 0; i < waves.length; i++) {
    let w = waves[i];
    const WDuv_phi_t = w.w * vec2.dot(w.D, uv) + w.phi * t;
    const cos_WDuv_phi_t = Math.cos(WDuv_phi_t);
    const sin_WDuv_phi_t = Math.sin(WDuv_phi_t);
    outDisp[0] += w.Q * w.A + w.D[0] * cos_WDuv_phi_t;
    outDisp[1] += w.A * sin_WDuv_phi_t;
    outDisp[2] += w.Q * w.A + w.D[1] * cos_WDuv_phi_t;
    outNorm[0] += -1.0 * w.D[0] * w.w * w.A * cos_WDuv_phi_t;
    outNorm[1] += w.Q * w.w * w.A * sin_WDuv_phi_t;
    outNorm[2] += -1.0 * w.D[1] * w.w * w.A * cos_WDuv_phi_t;
  }
  outNorm[1] = 1.0 - outNorm[1];
  vec3.normalize(outNorm, outNorm);
}

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
      const newPos = tempVec3();
      res.ocean.uvToGerstnerDispAndNorm(newPos, tempVec3(), e.uvPos);
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
      const scaledUVDir = vec2.scale(e.uvDir, 0.0001);
      const aheadUV = vec2.add(e.uvPos, scaledUVDir);
      const aheadPos = tempVec3();
      res.ocean.uvToGerstnerDispAndNorm(aheadPos, tempVec3(), aheadUV);
      // const aheadPos = res.ocean.uvToPos(tempVec3(), aheadUV);

      // TODO(@darzu): want SDF-based bounds checking
      if (!vec3.exactEquals(aheadPos, vec3.ZEROS)) {
        const forwardish = vec3.sub(aheadPos, e.position);
        const newNorm = tempVec3();
        res.ocean.uvToGerstnerDispAndNorm(tempVec3(), newNorm, e.uvPos);
        quatFromUpForward(e.rotation, newNorm, forwardish);
        // console.log(
        //   `UVDir ${[e.uvDir[0], e.uvDir[1]]} -> ${quatDbg(e.rotation)}`
        // );
      }
    }
  },
  "oceanUVDirToRot"
);

function createGerstnerWave(
  Q: number,
  amp: number,
  dir: vec2,
  freq: number,
  phi: number
): GerstnerWaveTS {
  if (DISABLE_GERSTNER) {
    amp = 0.0;
    phi = 0.0;
    Q = 0.0;
    dir = vec2.clone([1, 0]);
    freq = 0.0;
  }
  const res: GerstnerWaveTS = {
    D: dir,
    Q,
    A: amp,
    w: freq,
    phi,
    padding1: 0,
    padding2: 0,
  };
  // console.log(JSON.stringify(res));
  return res;
}

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
