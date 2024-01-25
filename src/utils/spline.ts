import { DBG_ASSERT } from "../flags.js";
import {
  vec3,
  quat,
  mat3,
  vec3tmp,
  V,
  tmpMark,
  tmpPop,
} from "../matrix/sprig-matrix.js";
import { assert, range } from "./util.js";
import { quatFromUpForward_OLD } from "./utils-3d.js";

export interface PathNode {
  // TODO(@darzu): different path formats? e.g. bezier, mat4s, relative pos/rot,
  pos: vec3;
  rot: quat;
}
export type Path = PathNode[];

export function clonePath(path: Path): Path {
  return path.map((old) => ({
    rot: quat.clone(old.rot),
    pos: vec3.clone(old.pos),
  }));
}

export function translatePath(p: Path, tran: vec3.InputT) {
  p.forEach((n) => vec3.add(n.pos, tran, n.pos));
  return p;
}
const __temp3 = vec3.create();
export function translatePathAlongNormal(p: Path, t: number) {
  p.forEach((n) => {
    const norm = vec3.transformQuat([0, 0, 1], n.rot, __temp3);
    vec3.scale(norm, t, norm);
    vec3.add(n.pos, norm, n.pos);
  });
  return p;
}
let __mirrorMat = mat3.create();
let __tq1 = quat.create();
export function mirrorPath(p: Path, planeNorm: vec3.InputT) {
  // TODO(@darzu): support non-origin planes
  if (DBG_ASSERT)
    assert(
      Math.abs(vec3.sqrLen(planeNorm) - 1.0) < 0.01,
      `mirror plane must be normalized`
    );
  let a = planeNorm[0];
  let b = planeNorm[1];
  let c = planeNorm[2];

  // https://math.stackexchange.com/a/696190/126904
  let mirrorMat3 = mat3.set(
    1 - 2 * a ** 2,
    -2 * a * b,
    -2 * a * c,
    -2 * a * b,
    1 - 2 * b ** 2,
    -2 * b * c,
    -2 * a * c,
    -2 * b * c,
    1 - 2 * c ** 2,
    __mirrorMat
  );

  // TODO(@darzu): can we use the mat3 instead of mirror quat?
  // https://stackoverflow.com/a/49234603/814454
  let mirrorQuat = quat.set(a, b, c, 0, __tq1);

  p.forEach((curr) => {
    quat.mul(mirrorQuat, curr.rot, curr.rot);
    quat.mul(curr.rot, mirrorQuat, curr.rot);
    vec3.transformMat3(curr.pos, mirrorMat3, curr.pos);
  });

  return p;
}

export interface BezierCubic {
  p0: vec3;
  p1: vec3;
  p2: vec3;
  p3: vec3;
}
export function reverseBezier(b: BezierCubic): BezierCubic {
  return {
    p0: vec3.clone(b.p3),
    p1: vec3.clone(b.p2),
    p2: vec3.clone(b.p1),
    p3: vec3.clone(b.p0),
  };
}
export function bezierPosition(b: BezierCubic, t: number, out: vec3): vec3 {
  // https://en.wikipedia.org/wiki/Bézier_curve
  // B =
  //   (1 - t) ** 3 * p0
  // + 3 * (1 - t) ** 2 * t * p1
  // + 3 * (1 - t) * t ** 2 * p2
  // + t ** 3 * p3
  const t0 = (1 - t) ** 3;
  const t1 = 3 * (1 - t) ** 2 * t;
  const t2 = 3 * (1 - t) * t ** 2;
  const t3 = t ** 3;
  out[0] = b.p0[0] * t0 + b.p1[0] * t1 + b.p2[0] * t2 + b.p3[0] * t3;
  out[1] = b.p0[1] * t0 + b.p1[1] * t1 + b.p2[1] * t2 + b.p3[1] * t3;
  out[2] = b.p0[2] * t0 + b.p1[2] * t1 + b.p2[2] * t2 + b.p3[2] * t3;
  return out;
}
export function bezierTangent(b: BezierCubic, t: number, out: vec3): vec3 {
  const t0 = 3 * (1 - t) ** 2;
  const t1 = 6 * (1 - t) * t;
  const t2 = 3 * t ** 2;
  out[0] =
    t0 * (b.p1[0] - b.p0[0]) +
    t1 * (b.p2[0] - b.p1[0]) +
    t2 * (b.p3[0] - b.p2[0]);
  out[1] =
    t0 * (b.p1[1] - b.p0[1]) +
    t1 * (b.p2[1] - b.p1[1]) +
    t2 * (b.p3[1] - b.p2[1]);
  out[2] =
    t0 * (b.p1[2] - b.p0[2]) +
    t1 * (b.p2[2] - b.p1[2]) +
    t2 * (b.p3[2] - b.p2[2]);
  return out;
}
export function createPathFromBezier(
  b: BezierCubic,
  nodeCount: number,
  up: vec3.InputT
): Path {
  assert(nodeCount >= 2);
  const path: Path = [];
  for (let i = 0; i < nodeCount; i++) {
    const t = i / (nodeCount - 1);
    const pos = bezierPosition(b, t, vec3.create());
    const tan = bezierTangent(b, t, vec3.tmp());
    vec3.normalize(tan, tan);
    // const rot = quatFromUpForward_OLD(quat.create(), up, tan);
    const rot = quat.fromForwardAndUpish(tan, up, quat.create());
    path.push({ pos, rot });
  }
  return path;
}
// TODO(@darzu): refactor this into getEvenlySpacedTimesFromBezierCurve, maybe as a generator?
// TODO(@darzu): seperate times from pos/rot results
const _numSamples = 100;
const __tempSamples = range(_numSamples).map((i) => vec3.create());
export function createEvenPathFromBezierCurve(
  b: BezierCubic,
  spacing: number,
  up: vec3.InputT,
  lead?: number,
  passRemainder?: { remainder: number } // TODO(@darzu): HACK. using a box for an out param.... shame.
): Path {
  tmpMark();
  const path: Path = [];
  const samples = range(_numSamples).map((i) =>
    bezierPosition(b, i / (_numSamples - 1), __tempSamples[i])
  );
  const distances: number[] = []; // cumulative distance between samples
  let prevPos = samples[0];
  let lastDist = 0;
  for (let i = 0; i < samples.length; i++) {
    const newTravel = vec3.dist(samples[i], prevPos);
    const dist = lastDist + newTravel;
    prevPos = samples[i];
    lastDist = dist;
    distances.push(dist);
  }

  if (lead && lead > 0) {
    const newStartIdx = distances.findIndex((d) => d > lead);
    const removeDist = distances[newStartIdx];
    const numRemove = newStartIdx + 1 /*make it a length*/ - 1; /*one before*/
    assert(numRemove > 0);
    distances.splice(0, numRemove);
    distances.forEach((_, i) => {
      distances[i] -= removeDist;
    });
    assert(distances[0] === 0);
  }

  // console.log("distances");
  // console.dir(distances);
  let totalDistance = distances[distances.length - 1];
  // TODO(@darzu): instead of floor, maybe ceil
  // let numSeg = Math.floor(totalDistance / spacing);
  let numSeg: number;
  if (passRemainder) numSeg = Math.floor(totalDistance / spacing);
  else numSeg = Math.ceil(totalDistance / spacing);

  let prevJ = 0;
  for (let i = 0; i < numSeg; i++) {
    const toTravel = i * spacing;
    let prevDist = 0;
    let prevPrevDist = 0;
    let didAdd = false;
    for (let j = prevJ; j < samples.length; j++) {
      const nextDist = distances[j];
      if (nextDist > toTravel) {
        // find our spot
        const span = nextDist - prevDist;
        const extra = nextDist - toTravel;
        const prevT = Math.max((j - 1) / (_numSamples - 1), 0);
        const currT = j / (_numSamples - 1);
        const bonusRatio = 1 - extra / span;
        const t = prevT + bonusRatio * (currT - prevT);
        prevJ = j;

        // add our node
        const pos = bezierPosition(b, t, vec3.create());
        const tan = bezierTangent(b, t, vec3.tmp());
        vec3.normalize(tan, tan);
        // const rot = quatFromUpForward_OLD(quat.create(), up, tan);
        const rot = quat.fromForwardAndUpish(tan, up, quat.create());
        path.push({ pos, rot });
        didAdd = true;
        // console.log(`adding: ${t} -> ${vec3Dbg(pos)}`);
        break;
      }
      prevPrevDist = prevDist;
      prevDist = nextDist;
    }
    // TODO(@darzu): make last-add optional
    if (!didAdd) {
      // console.log(`!didAdd`);
      const extra = toTravel - prevDist;
      if (passRemainder) {
        passRemainder.remainder = extra;
      } else {
        const span = prevDist - prevPrevDist;
        const extraSteps = extra / span;
        const lastSample = samples[samples.length - 1];
        const lastSample2 = samples[samples.length - 2];
        const dir = vec3.sub(lastSample, lastSample2, vec3.create());
        vec3.normalize(dir, dir);
        vec3.scale(dir, extraSteps, dir);
        const pos = vec3.add(lastSample, dir, dir);
        const rot = quat.clone(path[path.length - 1].rot);
        path.push({ pos, rot });
      }
    }
  }
  //  = samples.reduce((p, n, i) =>
  // while (true) {}

  tmpPop();
  return path;
}

/* spline stuff:
n-degree bezier curve: 
  no local control (ea point affects whole curve)
  doesn't pass through points
  expensive to calc many points
bezier spline:
  control points r just some distance along tangent
  made of cube bezier curves
*/

export interface BezierSpline {
  curves: BezierCubic[];
}

export function bezierSplineFromPoints(
  points: vec3[],
  smoothness: number
): BezierSpline {
  const curves: BezierCubic[] = [];

  for (let i = 1; i < points.length - 2; i++) {
    const prev = points[i - 1];
    const start = points[i + 0];
    const end = points[i + 1];
    const next = points[i + 2];

    // const fromPrev = vec3.normalize(vec3.sub(start, prev));
    const fromPrev = vec3.normalize(vec3.sub(end, prev));
    const startCont = vec3.add(
      start,
      vec3.scale(fromPrev, smoothness),
      vec3.create()
    );

    // const toNext = vec3.normalize(vec3.sub(end, next));
    const toNext = vec3.normalize(vec3.sub(start, next));
    const endCont = vec3.add(
      end,
      vec3.scale(toNext, smoothness),
      vec3.create()
    );
    // TODO(@darzu): Ideally the control points would be mirrored for c1 continuity
    curves.push({
      p0: start,
      p1: startCont,
      p2: endCont,
      p3: end,
    });
  }

  return { curves };
}

export function createEvenPathFromBezierSpline(
  spline: BezierSpline,
  spacing: number,
  up: vec3.InputT
): Path {
  const paths: Path[] = [];
  let prevRemainder = 0;
  spline.curves.forEach((c, i) => {
    const nextRemainder = { remainder: 0 };
    const newPath = createEvenPathFromBezierCurve(
      c,
      spacing,
      up,
      prevRemainder,
      nextRemainder
    );
    // console.log(
    //   `prev remainder: ${prevRemainder}, next: ${nextRemainder.remainder}`
    // );
    prevRemainder = nextRemainder.remainder;
    paths.push(newPath);
  });

  const path = paths.reduce((p, n) => [...p, ...n], [] as Path);

  return path;
}

// assumes each segment is 1 integer of t
export function getPathPosRot(
  path: Path,
  t: number,
  outPos: vec3,
  outRot: quat
) {
  const segIdx = Math.floor(t);
  const segT = t % 1;
  assert(segIdx < path.length - 1);
  const start = path[segIdx];
  const end = path[segIdx + 1];
  vec3.lerp(start.pos, end.pos, segT, outPos);
  quat.slerp(start.rot, end.rot, segT, outRot);
}

export function getRandomCylindricalPoints(
  radius: number,
  stepDistance: number,
  numSteps: number
) {
  const points: vec3[] = [];

  for (let i = 0; i < numSteps; i++) {
    const radian = Math.random() * Math.PI * 2;
    const x = Math.cos(radian) * radius;
    const y = Math.sin(radian) * radius;
    const z = i * stepDistance;
    const pos = V(x, y, z);
    points.push(pos);
  }

  return points;
}
