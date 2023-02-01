import { vec3, vec2, V } from "../../sprig-matrix.js";
import { GerstnerWaveTS } from "../../render/pipelines/std-ocean.js";
import { DISABLE_GERSTNER } from "../../flags.js";

// Goals:
//  [ ] speed parameter that is either derived from other parameters,
//        or world-unit accurate and consistent
//  [ ] understand all the terms in the equations
//      [ ] circle vs eliptical orbits?
//  [ ] create water shape as good looking as valheim's
//      [ ] as good as falconeers

export function createWaves(): GerstnerWaveTS[] {
  if (DISABLE_GERSTNER) return [];
  // console.log("adding OceanDef");

  const edgeLen = 4.0; // TODO(@darzu): parameterize? Based on worldUnitPerOceanVerts
  const minLen = 2 * edgeLen;

  /*
  float k = 2 * UNITY_PI / _Wavelength;
  float c = sqrt(9.8 / k);
  float f = k * (p.x - c * _Time.y);
  float a = _Steepness / k;
  p.x += a * cos(f);
  p.y = a * sin(f);

  float3 tangent = normalize(float3(
    1 - _Steepness * sin(f),
    _Steepness * cos(f),
    0
  ));
  */

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
    dir: vec2;
    len: number;
    amp: number;
    speed: number;
  };

  const waveParams: GerstnerParam[] = [
    { dir: V(1, 0), amp: 2.0, len: minLen * 2.0 * 2.0, speed: 10 },
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

  const waveParams2: GerstnerParam2[] = [
    // { dir: V(1.0, 0.0), len: medLen * 2, steep: 0.2 },
    // { dir: V(1.0, 1.0), len: medLen * 3, steep: 0.4 },
    // { dir: V(1.0, -1.0), len: medLen * 4, steep: 0.2 },
    // { dir: V(1.0, 0.5), len: medLen * 10, steep: 0.1 },
  ];

  let numWaves = waveParams.length + waveParams2.length;
  let gerstnerWaves: GerstnerWaveTS[] = [];
  for (let p of waveParams) gerstnerWaves.push(paramToWave(p));
  for (let p of waveParams2) gerstnerWaves.push(param2ToWave(p));

  type GerstnerParam2 = {
    steep: number;
    len: number;
    dir: vec2;
  };

  function paramToWave(p: GerstnerParam): GerstnerWaveTS {
    // const dir = vec2.clone(vec2.normalize(vec2.add(medDir, p.dirOff)));
    const dir = vec2.normalize(p.dir, vec2.create());
    // const len = 2.0; // distance between crests
    const len = p.len;
    // const crestSpeed = speed / (len * dt); // crest distance per second
    // const crestSpeed = speed / len;
    const crestSpeed = p.speed;
    const freq = (2 * Math.PI) / len;
    // const freq = freqFromLen(len);
    // console.log(`len: ${len}`);
    // console.log(`freq: ${freq}`);
    // const amp = 1.0; // crest height
    // const amp = len * ampOverLen; // crest height
    const amp = p.amp;
    // const phi = crestSpeed * freq;
    // const phi = crestSpeed * (2 / len);
    const phi = crestSpeed * freq;
    // const Q = 1.08 * 4.0;
    const Q = steepness / (freq * amp * numWaves);
    // const Q = steepness / (freq * len * numWaves);

    return createGerstnerWave(Q, amp, dir, freq, phi);
  }

  function param2ToWave(p: GerstnerParam2): GerstnerWaveTS {
    const steepness = p.steep;
    const wavelength = p.len;
    let w = (2 * Math.PI) / wavelength;
    let phi = Math.sqrt(9.8 / w);
    let d = vec2.normalize(p.dir, vec2.create());
    let amp = steepness / w;
    let Q = 1.0; // ???
    return createGerstnerWave(Q, amp, d, w, phi);
    // let f = k * (dot(d, p.xz) - c * _Time.y);
    // tangent += vec3(
    //   -d.x * d.x * (steepness * sin(f)),
    //   d.x * (steepness * cos(f)),
    //   -d.x * d.y * (steepness * sin(f))
    // );
    // binormal += vec3(
    //   -d.x * d.y * (steepness * sin(f)),
    //   d.y * (steepness * cos(f)),
    //   -d.y * d.y * (steepness * sin(f))
    // );
    // return vec3(
    //   d.x * (a * cos(f)),
    //   a * sin(f),
    //   d.y * (a * cos(f))
    // );
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

  function createGerstnerWave(
    Q: number,
    amp: number,
    dir: vec2,
    freq: number,
    phi: number
  ): GerstnerWaveTS {
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

  return gerstnerWaves;
}

// IMPORTANT: MUST MATCH std-gerstner.wgsl
export function compute_gerstner(
  outDisp: vec3,
  outNorm: vec3,
  waves: GerstnerWaveTS[],
  uv: vec2,
  t: number
): void {
  vec3.zero(outDisp);
  vec3.zero(outNorm);
  for (let i = 0; i < waves.length; i++) {
    let wave = waves[i];
    const D = wave.D;
    const dot_w_d_uv_phi_t = wave.w * vec2.dot(D, uv) + wave.phi * t;
    const _cos = Math.cos(dot_w_d_uv_phi_t);
    const _sin = Math.sin(dot_w_d_uv_phi_t);
    outDisp[0] += wave.Q * wave.A * D[0] * _cos;
    outDisp[2] += wave.Q * wave.A * D[1] * _cos;
    outDisp[1] -= wave.A * _sin;

    outNorm[0] += -1.0 * D[0] * wave.w * wave.A * _cos;
    outNorm[2] += -1.0 * D[1] * wave.w * wave.A * _cos;
    outNorm[1] += wave.Q * wave.w * wave.A * _sin;
  }
  // TODO(@darzu): this expression seems troubling; `1.0 -` before normalizing?!
  outNorm[1] = 1.0 - outNorm[1];
  vec3.normalize(outNorm, outNorm);
}

// for reference, from: https://catlikecoding.com/unity/tutorials/flow/waves/
function catlike_gerstner(
  steepness: number,
  wavelength: number,
  dir: vec2,
  t: number,
  uv: vec2,
  p: vec3
) {
  const k = (2 * Math.PI) / wavelength;
  const c = Math.sqrt(9.8 / k);
  const d = vec2.normalize(dir);
  const f = k * (vec2.dot(d, uv) - c * t);
  const a = steepness / k;

  p[0] += d[0] * (a * Math.cos(f));
  p[1] = a * Math.sin(f);
  p[2] += d[1] * (a * Math.cos(f));
}
