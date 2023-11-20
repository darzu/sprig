import { vec3, vec2, V } from "../matrix/sprig-matrix.js";
import { GerstnerWaveTS } from "../render/pipelines/std-ocean.js";
import { DISABLE_GERSTNER } from "../flags.js";

// NOTE: tips for getting good waves:
//    - combine waves with the same frequency and speed to create interesting shapes,
//        mouch like fourier series
//    - use very small (just above minimum), steep waves to add spikyness to the whole ocean. These don't need any Q (i.e. just sine waves) since you won't
//        notice the horizontal sway that small
//    - you can push total Q/steepness above 1 and you usually won't notice loops if there are enough waves
//    - a con (and a pro) of gerstner over sine waves is they add a lot of horizontal sway, this is more true the bigger the wave
//        for this reason, for now, I've decided that my biggest shaped waves are pure sine waves so you don't get a huge amount of swaying
// TODO(@darzu): [ ] interactively shape bigger waves using fourier-ish approach

// TODO(@darzu): EXPORT THIS VAR
const roughness = 0.5;
// const roughness = 0.5;
const steepness = 1.0 * roughness;
const bigWave = 1.0 * roughness;
const littleSpikes = 1.0 * roughness;

type GDirLenSteep = {
  dirRad: number;
  len: number;
  steep: number;
  normalWeight?: number;
};
type GDirLenAmpSpeed = {
  dirRad: number;
  len: number;
  amp: number;
  speed: number;
  normalWeight?: number;
};

export function createWaves(): GerstnerWaveTS[] {
  if (DISABLE_GERSTNER) return [];

  const edgeLen = 4.0; // TODO(@darzu): parameterize? Based on worldUnitPerOceanVerts
  const minLen = 2 * edgeLen;

  // TODO(@darzu): dt ?
  // const dt = 60 / 1000;
  // / 1000
  // const dt = 1 / 60;
  const dt = 1 / 1000;
  const GRAV = 9.8; // m/s^2, assumes world dist 1 = 1 meter

  const speedFromFreq = (w: number) => Math.sqrt(GRAV / w);
  const speedFromLen = (l: number) => Math.sqrt((GRAV * l) / (2 * Math.PI));

  const p1: GDirLenSteep[] = [
    { dirRad: 0, len: minLen * 4.05, steep: 0.4 },
    { dirRad: 0.67, len: minLen * 4.3, steep: 0.4 },
    { dirRad: 1.21, len: minLen * 7, steep: 0.2 },
    { dirRad: -2.17, len: minLen * 13, steep: 0.4 },
    { dirRad: -1.05, len: minLen * 5, steep: 0.1 },
    { dirRad: -1.78, len: minLen * 5.3, steep: 0.2 },
    { dirRad: 1.91, len: minLen * 5.7, steep: 0.2 },
  ];
  const _speed = speedFromLen(minLen * 20) * 0.6;
  const p2: GDirLenAmpSpeed[] = [
    // biggest wave:
    { dirRad: -0.12, len: minLen * 10, amp: 10 * bigWave, speed: _speed },
    // { dirRad: -0.12, len: minLen * 20, amp: 14 * bigWave, speed: _speed },
    // little spiky guys:
    {
      dirRad: -5.4,
      len: minLen * 1.5,
      amp: 1.5 * littleSpikes,
      speed: 4.3,
      normalWeight: 0.0, // NOTE: no normal contribution
    },
    {
      dirRad: 5.14,
      len: minLen * 1.3,
      amp: 1.5 * littleSpikes,
      speed: 3.7,
      normalWeight: 0.0, // NOTE: no normal contribution
    },
    //
  ];

  const res: GerstnerWaveTS[] = [];

  const totalSteep = p1.reduce((p, n) => p + n.steep, 0);
  const steepFactor = steepness / totalSteep;

  for (let p of p1) res.push(mkGerstnerFromDirLenSteep(p));
  for (let p of p2) res.push(mkGerstnerFromDirLenAmpSpeed(p));

  return res;

  function mkGerstnerFromDirLenSteep(params: GDirLenSteep): GerstnerWaveTS {
    const D = vec2.fromRadians(params.dirRad, V(0, 0));
    const w = (2 * Math.PI) / params.len;
    const A = (params.steep * steepFactor) / w;
    const Q = 1;
    const speed = speedFromFreq(w);
    const phi = speed * w * dt;
    const normalWeight = params.normalWeight;

    return mkGerstnerWaveTS({ Q, w, D, A, phi, normalWeight });
  }
  function mkGerstnerFromDirLenAmpSpeed(
    params: GDirLenAmpSpeed
  ): GerstnerWaveTS {
    const D = vec2.fromRadians(params.dirRad, V(0, 0));
    const w = (2 * Math.PI) / params.len;
    const A = params.amp;
    const Q = 0;
    const { speed, normalWeight } = params;
    const phi = speed * w * dt;

    return mkGerstnerWaveTS({ Q, w, D, A, phi, normalWeight });
  }
}

function mkGerstnerWaveTS(params: Partial<GerstnerWaveTS>): GerstnerWaveTS {
  return {
    D: params.D ?? V(1, 0),
    Q: params.Q ?? 0,
    A: params.A ?? 1,
    w: params.w ?? 1,
    phi: params.phi ?? 1,
    normalWeight: params.normalWeight ?? 1.0,
    padding2: 0,
  };
}

// IMPORTANT: MUST MATCH std-gerstner.wgsl
export function compute_gerstner(
  outDisp: vec3,
  outNorm: vec3,
  waves: GerstnerWaveTS[],
  uv: vec2,
  t: number // ms
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
    outDisp[1] += wave.Q * wave.A * D[1] * _cos;
    outDisp[2] -= wave.A * _sin;

    outNorm[0] += -1.0 * D[0] * wave.w * wave.A * _cos * wave.normalWeight;
    outNorm[1] += -1.0 * D[1] * wave.w * wave.A * _cos * wave.normalWeight;
    outNorm[2] += wave.Q * wave.w * wave.A * _sin * wave.normalWeight;
  }
  // TODO(@darzu): this expression seems troubling; `1.0 -` before normalizing?!
  outNorm[2] = 1.0 - outNorm[2];
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

function test_gerstner() {
  // NOTE: use this to sanity check math properties like period and max amplitude
  const dt = 1 / 1000;
  const len = 50;
  const speed = 10;
  const D = V(1, 0);
  const w = (2 * Math.PI) / len;
  const A = 10;
  const Q = 0;
  const phi = speed * w * dt;
  const wave = mkGerstnerWaveTS({ Q, w, D, A, phi });
  const waves = [wave];

  const disp = vec3.create();
  const norm = vec3.create();
  const uv = V(10, 10);
  // let max = -Infinity;
  for (let t_ms = 0; t_ms < 10 * 1000; t_ms += 16) {
    compute_gerstner(disp, norm, waves, uv, t_ms);
    const y = disp[1];
    // max = Math.max(max, y);
    if (Math.abs(y - A) < A * 0.05) {
      console.log(`${t_ms.toFixed(0)}: max ${y.toFixed(1)}`);
    }
  }
}
// test_gerstner();
