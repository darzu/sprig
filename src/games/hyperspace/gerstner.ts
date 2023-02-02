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

type GerstnerParams = {
  dir: vec2;
  len: number;
  speed: number; // units per second
  steep: number;
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
  // const GRAV = 9.8 * dt * dt; // m/s^2, assumes world dist 1 = 1 meter

  const params: GerstnerParams[] = [
    // { dir: V(1, 0), len: 100, speed: 0, steep: 1 },
    // { dir: V(1, 0), len: 100, speed: 100, steep: 1 },
    // { dir: V(1, 0), len: 20, speed: 50, steep: 1 },
    { dir: V(1, 0), len: 100, speed: 10, steep: 1 },
  ];

  const res: GerstnerWaveTS[] = [];

  for (let p of params) res.push(mkGerstnerFrom(p));

  return res;

  function mkGerstnerFrom(params: GerstnerParams): GerstnerWaveTS {
    // TODO(@darzu): IMPL:
    // [~] dir
    // [x] len
    // [x] speed
    // [ ] steep
    const D = params.dir;
    const w = (2 * Math.PI) / params.len;
    const A = 10;
    const Q = 0;
    // const speed = Math.sqrt(9.8 / w);
    const speed = params.speed;
    const phi = speed * w * dt;

    return mkGerstnerWaveTS({ Q, w, D, A, phi });
  }
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
