import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, mat4, quat, tV, tmpStack } from "../matrix/sprig-matrix.js";
import {
  AABB2,
  createAABB,
  createAABB2,
  getAABBFromPositions,
} from "../physics/aabb.js";
import { OBB, getOBBCornersTemp, getRandPointInOBB } from "../physics/obb.js";
import { YawPitch } from "../turret/yawpitch.js";
import { angularDiff } from "../utils/math.js";
import {
  sketchFan,
  sketchLine,
  sketchPoints,
  sketchYawPitch,
} from "../utils/sketch.js";
import { SVG, compileSVG } from "../utils/svg.js";
import { assert } from "../utils/util-no-import.js";
import { drawBall } from "../utils/utils-game.js";

// TODO(@darzu): Move this. Merge this with others like parameteric?

/*
ToDo:
[x] change to y-forward
[ ] parameterize hit box / miss box using 3D projected to 2D OBB w/ projectile profile box too?
*/

const DBG_AIM_POS = false;

export interface FireSolutionOpt {
  // cannon state
  sourcePos: V3.InputT;
  sourceDefaultRot: quat.InputT;

  // cannon limits
  maxYaw: number;
  maxPitch: number;
  minPitch: number;
  maxRange: number;

  // projectile parameters
  projectileSpeed: number;
  // TODO(@darzu): GRAVITY. should sign be included or not?
  gravity: number; // NOTE: has sign should NOT be included, direction of gravity has to be passed in a different way

  // target data
  targetVel: V3.InputT;
  targetOBB: OBB;

  // decision
  doMiss: boolean;
}

interface Plane {
  org: V3;
  norm: V3;
}

function projectOntoPlane(v: V3.InputT, p: Plane, out?: V3): V3 {
  throw "TODO";
}

// TODO(@darzu): ridiculous? maybe.
export function getAABB2CircleSweptPerimeterAsSvg(
  aabb: AABB2,
  radius: number
): SVG {
  // go clockwise starting from min
  const width = aabb.max[0] - aabb.min[0];
  const height = aabb.max[1] - aabb.min[1];

  const svg: SVG = [
    { i: "M", x: aabb.min[0] - radius, y: aabb.min[1] },
    { i: "v", dy: height },
    { i: "a", rx: radius, dx: +radius, dy: +radius },
    { i: "h", dx: width },
    { i: "a", rx: radius, dx: +radius, dy: -radius },
    { i: "v", dy: -height },
    { i: "a", rx: radius, dx: -radius, dy: -radius },
    { i: "h", dx: -width },
    { i: "a", rx: radius, dx: -radius, dy: +radius },
  ];

  return svg;
}

export function getAimAndMissPositions(
  opt: {
    target: OBB;
    srcToTrg: V3.InputT;
    doMiss: boolean;
  },
  out?: V3
) {
  out = out ?? V3.tmp();
  if (opt.doMiss) {
    const _stk = tmpStack();
    // create a local frame based on incoming dir
    const rot = quat.fromForwardAndUpish(opt.srcToTrg, V3.UP);
    const worldCorners = getOBBCornersTemp(opt.target);
    const localToWorldM = mat4.fromRotationTranslation(rot, opt.target.center);
    const worldToLocalM = mat4.invert(localToWorldM); // TODO(@darzu): PERF. can i use inverse transpose here?
    const localCorners = worldCorners.map((v) => V3.tMat4(v, worldToLocalM, v));
    const localAABB = getAABBFromPositions(createAABB(), localCorners);

    // only care about the xz plane
    localAABB.min[1] = 0;
    localAABB.max[1] = 0;

    // get perimeter path as an svg
    const localAABB2 = createAABB2(
      V(localAABB.min[0], localAABB.min[2]),
      V(localAABB.max[0], localAABB.max[2])
    );
    const svg = getAABB2CircleSweptPerimeterAsSvg(localAABB2, 10);
    const compSvg = compileSVG(svg);

    // pick a point
    const t = Math.random();
    const perimPos2d = compSvg.fn(t);

    // back to world frame
    const to3d = (v2d: V2.InputT, out?: V3) =>
      V3.tMat4([v2d[0], 0, v2d[1]], localToWorldM, out);
    const perimWorldPos = to3d(perimPos2d);

    const res = V3.copy(out, perimWorldPos);
    _stk.pop();
    return res;
  } else {
    return getRandPointInOBB(opt.target, 0.9, out);
  }
}

function getApproxFlightTime({
  projectileSpeed: v,
  targetOBB,
  sourcePos,
}: FireSolutionOpt) {
  // calculate initial distance
  const d0 = V3.dist(
    [sourcePos[0], sourcePos[1], 0],
    [targetOBB.center[0], targetOBB.center[1], 0]
  );

  // try to lead the target a bit using an approximation of flight
  // time. this will not be exact.
  // TODO(@darzu): sub with exact flight time?
  const flightTime = d0 / (v * Math.cos(Math.PI / 4));

  return flightTime;
}

const __t_obb0 = OBB.mk();
export function getFireSolution(opt: FireSolutionOpt): YawPitch | undefined {
  assert(
    opt.gravity >= 0,
    `Gravity should be positive. TODO: support different directions of gravity.`
  );

  // get flight time
  const approxFlightTime = getApproxFlightTime(opt);

  // adjust OBB by approx flight time (lead the shot)
  // TODO(@darzu): We don't normally modify the parameter object like this
  opt.targetOBB = OBB.copy(__t_obb0, opt.targetOBB);
  V3.add(
    opt.targetOBB.center,
    V3.scale(opt.targetVel, approxFlightTime),
    opt.targetOBB.center
  );

  const { sourcePos, maxYaw, targetOBB } = opt;

  // are we within range?
  const dist = V3.dist(sourcePos, targetOBB.center);
  if (opt.maxRange < dist) {
    if (DBG_AIM_POS) {
      console.log("out of range");
      const toTrg = V3.sub(targetOBB.center, sourcePos);
      V3.norm(toTrg, toTrg);
      V3.scale(toTrg, opt.maxRange, toTrg);
      V3.add(toTrg, sourcePos, toTrg);
      sketchLine(sourcePos, toTrg, {
        key: "outOfRange",
        color: ENDESGA16.white,
      });
    }
    return undefined;
  }

  // determine where to aim at
  const srcToTrg = V3.sub(targetOBB.center, opt.sourcePos);
  const aimPos = getAimAndMissPositions({
    target: opt.targetOBB,
    srcToTrg: srcToTrg,
    doMiss: opt.doMiss,
  });

  if (DBG_AIM_POS) {
    // debug hit/miss possiblities
    const _stk = tmpStack();
    let vs: V3[] = [];
    for (let i = 0; i < 200; i++) {
      const aimPos = getAimAndMissPositions({
        target: opt.targetOBB,
        srcToTrg: srcToTrg,
        doMiss: true,
      });
      vs.push(aimPos);
    }
    sketchPoints(vs, { color: ENDESGA16.red, key: "misses" });
    vs.length = 0;
    for (let i = 0; i < 200; i++) {
      const aimPos = getAimAndMissPositions({
        target: opt.targetOBB,
        srcToTrg: srcToTrg,
        doMiss: false,
      });
      vs.push(aimPos);
    }
    sketchPoints(vs, { color: ENDESGA16.darkGreen, key: "hits" });
    _stk.pop();
  }

  // console.log(`${opt.miss}: ${vec3Dbg(aimPos)}`);

  // debugging
  // if (DBG_AIM_POS)
  //   drawBall(
  //     V3.clone(aimPos),
  //     0.5,
  //     opt.doMiss ? ENDESGA16.darkRed : ENDESGA16.darkGreen
  //   );

  // calculate yaw
  const delta = V3.sub(aimPos, sourcePos);
  const worldDiffYaw = V3.getYaw(delta);
  const srcBaseYaw = quat.getYaw(opt.sourceDefaultRot);
  const relYaw = angularDiff(worldDiffYaw, srcBaseYaw);

  // check yaw
  if (maxYaw < Math.abs(relYaw)) {
    if (DBG_AIM_POS) {
      console.log("out of yaw");

      // const minWorldYaw = srcBaseYaw - opt.maxYaw;
      // const maxWorldYaw = srcBaseYaw + opt.maxYaw;
      // const dir1 = V3.scale(V3.fromYaw(minWorldYaw), 20);
      // const dir2 = V3.scale(V3.fromYaw(maxWorldYaw), 20);
      // sketchFan(sourcePos, dir1, dir2, {
      //   key: "outOfYaw",
      //   color: ENDESGA16.lightGreen,
      // });
    }
    return undefined;
  }

  if (DBG_AIM_POS) {
    const minWorldYaw = srcBaseYaw - opt.maxYaw;
    const maxWorldYaw = srcBaseYaw + opt.maxYaw;
    const dir1 = V3.scale(V3.fromYaw(minWorldYaw), opt.maxRange);
    const dir2 = V3.scale(V3.fromYaw(maxWorldYaw), opt.maxRange);
    sketchFan(sourcePos, dir1, dir2, {
      key: "outOfYaw",
      color: ENDESGA16.lightGreen,
      alpha: 0.5,
    });
  }

  // determine aim pitch
  const [pitch1, pitch2] = getFirePitches(aimPos, opt);
  const pitch1Valid =
    !isNaN(pitch1) && pitch1 <= opt.maxPitch && opt.minPitch <= pitch1;
  const pitch2Valid =
    !isNaN(pitch2) && pitch2 <= opt.maxPitch && opt.minPitch <= pitch2;
  const pitch =
    pitch1Valid && pitch2Valid
      ? Math.min(pitch1, pitch2)
      : pitch1Valid
      ? pitch1
      : pitch2Valid
      ? pitch2
      : undefined;

  if (!pitch && DBG_AIM_POS) {
    console.log("no valid pitch");
  }
  if (DBG_AIM_POS) {
    const sketchPitch = (p: number, k: string, c: V3.InputT) =>
      sketchYawPitch(sourcePos, srcBaseYaw, p, {
        length: 100,
        key: k,
        color: c,
      });

    if (!isNaN(pitch1)) sketchPitch(pitch1, "pitch1", ENDESGA16.midBrown);
    if (!isNaN(pitch2)) sketchPitch(pitch2, "pitch2", ENDESGA16.lightBrown);
    if (!isNaN(pitch2))
      sketchPitch(Math.min(pitch1, pitch2), "pitch", ENDESGA16.darkBrown);
    sketchPitch(opt.minPitch, "minPitch", ENDESGA16.white);
    sketchPitch(opt.maxPitch, "maxPitch", ENDESGA16.lightGray);
  }

  if (!pitch) return undefined;

  // result
  return { yaw: worldDiffYaw, pitch };
}

export function getFirePitches(
  aimPos: V3.InputT,
  { sourcePos, projectileSpeed: v, gravity: g }: FireSolutionOpt
): [number, number] {
  // calculate delta between source and target
  const delta = V3.sub(aimPos, sourcePos);

  // calculate horizontal distance to target
  const d = V2.len([delta[0], delta[1]]);

  // vertical distance to target
  const h = delta[2];

  // now, find the pitch angle(s) from our cannon.
  // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
  const sqrtTerm = Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v));
  const pitch1 = Math.atan((v * v + sqrtTerm) / (g * d));
  const pitch2 = Math.atan((v * v - sqrtTerm) / (g * d));

  return [pitch1, pitch2];
}
