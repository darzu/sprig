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

type GerstnerParam = {
  dir: vec2;
  len: number;
  amp: number;
  speed: number;
};
type GerstnerParam2 = {
  dir: vec2;
  len: number;
  steep: number;
};

export function createWaves(): GerstnerWaveTS[] {
  if (DISABLE_GERSTNER) return [];

  const edgeLen = 4.0; // TODO(@darzu): parameterize? Based on worldUnitPerOceanVerts
  const minLen = 2 * edgeLen;
  const medLen = minLen * 2.0;

  const steepness = 1; // 0-1

  const medAmp = 5.0; // author's choice

  const dt = 60 / 1000; // TODO(@darzu): maybe?
  const GRAV = 9.8 * dt * dt; // m/s^2, assumes world dist 1 = 1 meter
  // TODO(@darzu): which one?!
  const freqFromLen = (l: number) => Math.sqrt((GRAV * Math.PI * 2.0) / l);
  // const freqFromLen = (l: number) => 2 / l;

  const ampOverLen = medAmp / medLen;

  const waveParams: GerstnerParam[] = [
    { dir: V(1, 0), amp: 2.0, len: minLen * 2.0 * 2.0, speed: 10 },
  ];

  const waveParams2: GerstnerParam2[] = [
    // { dir: V(1.0, 0.0), len: medLen * 2, steep: 0.2 },
  ];

  let numWaves = waveParams.length + waveParams2.length;
  let gerstnerWaves: GerstnerWaveTS[] = [];
  for (let p of waveParams) gerstnerWaves.push(paramToWave(p));
  for (let p of waveParams2) gerstnerWaves.push(param2ToWave(p));

  function paramToWave(p: GerstnerParam): GerstnerWaveTS {
    const D = vec2.normalize(p.dir, vec2.create());
    const len = p.len;
    const crestSpeed = p.speed;
    const w = (2 * Math.PI) / len;
    const A = p.amp;
    const phi = crestSpeed * w;
    const Q = steepness / (w * A * numWaves);
    return mkGerstnerWaveTS({ Q, A, D, w, phi });
  }

  function param2ToWave(p: GerstnerParam2): GerstnerWaveTS {
    const steepness = p.steep;
    const wavelength = p.len;
    let w = (2 * Math.PI) / wavelength;
    let phi = Math.sqrt(9.8 / w);
    let D = vec2.normalize(p.dir, vec2.create());
    let A = steepness / w;
    let Q = 1.0; // ???
    return mkGerstnerWaveTS({ Q, A, D, w, phi });
  }

  return gerstnerWaves;
}

function mkGerstnerWaveTS(params: Partial<GerstnerWaveTS>): GerstnerWaveTS {
  return {
    D: V(1, 0),
    Q: 0,
    A: 1,
    w: 1,
    phi: 1,
    padding1: 0,
    padding2: 0,
    ...params,
  };
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
