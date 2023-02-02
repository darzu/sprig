import { vec3, vec2, V } from "../../sprig-matrix.js";
import { GerstnerWaveTS } from "../../render/pipelines/std-ocean.js";
import { DISABLE_GERSTNER } from "../../flags.js";

// TODO(@darzu): [ ] shape bigger waves using fourier-ish approach

type GDirLenSteep = {
  dirRad: number;
  len: number;
  steep: number;
};
type GDirLenAmpSpeed = {
  dirRad: number;
  len: number;
  amp: number;
  speed: number;
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

  const roughness = 0.7;

  const p1: GDirLenSteep[] = [
    { dirRad: 0, len: minLen * 4.05, steep: 0.4 },
    { dirRad: 0.67, len: minLen * 4.3, steep: 0.4 },
    { dirRad: 1.21, len: minLen * 7, steep: 0.2 },
    { dirRad: -2.17, len: minLen * 13, steep: 0.4 },
    { dirRad: -1.05, len: minLen * 5, steep: 0.1 },
    { dirRad: -1.78, len: minLen * 5.3, steep: 0.2 },
    { dirRad: 1.91, len: minLen * 5.7, steep: 0.2 },
  ];
  const _speed = Math.sqrt((GRAV * minLen * 20) / (2 * Math.PI)) * 0.6;
  const p2: GDirLenAmpSpeed[] = [
    { dirRad: -0.12, len: minLen * 10, amp: 10 * roughness, speed: _speed },
    { dirRad: -0.12, len: minLen * 20, amp: 14 * roughness, speed: _speed },
    //
  ];

  const res: GerstnerWaveTS[] = [];

  const totalSteep = p1.reduce((p, n) => p + n.steep, 0);
  const steepFactor = roughness / totalSteep;

  for (let p of p1) res.push(mkGerstnerFromDirLenSteep(p));
  for (let p of p2) res.push(mkGerstnerFromDirLenAmpSpeed(p));

  return res;

  function mkGerstnerFromDirLenSteep(params: GDirLenSteep): GerstnerWaveTS {
    const D = vec2.fromRadians(params.dirRad, V(0, 0));
    const w = (2 * Math.PI) / params.len;
    const A = (params.steep * steepFactor) / w;
    const Q = 1;
    const speed = Math.sqrt(GRAV / w);
    const phi = speed * w * dt;

    return mkGerstnerWaveTS({ Q, w, D, A, phi });
  }
  function mkGerstnerFromDirLenAmpSpeed(
    params: GDirLenAmpSpeed
  ): GerstnerWaveTS {
    const D = vec2.fromRadians(params.dirRad, V(0, 0));
    const w = (2 * Math.PI) / params.len;
    const A = params.amp;
    const Q = 0;
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
