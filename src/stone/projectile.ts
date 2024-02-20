import { ENDESGA16 } from "../color/palettes.js";
import { V3, quat, tV } from "../matrix/sprig-matrix.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { drawBall } from "../utils/utils-game.js";

// TODO(@darzu): Move this. Merge this with others like parameteric?

const DBG_CANNONS = true;

const GRAVITY = 6.0 * 0.00001;

const MAX_THETA = Math.PI / 2 - Math.PI / 16;
const MIN_THETA = -MAX_THETA;

const TARGET_WIDTH = 12;
const TARGET_LENGTH = 30;
const MISS_TARGET_LENGTH = 55;
const MISS_TARGET_WIDTH = 22;
const MISS_BY_MAX = 10;

const MAX_RANGE = 300;

export interface FireSolutionOpt {
  maxRadius: number;
  sourcePos: V3.InputT;
  sourceRot: quat.InputT;
  targetPos: V3.InputT;
  targetVel: V3.InputT;
  targetDir: V3.InputT;
  projectileSpeed: number;
  miss: boolean;
}

export function getFireSolution(opt: FireSolutionOpt): quat | undefined {
  const { sourcePos, targetPos, maxRadius } = opt;

  // are we within range?
  const dist = V3.dist(sourcePos, targetPos);
  if (MAX_RANGE < dist) {
    return undefined;
  }

  // determine where to aim
  const aimPos = getTargetMissOrHitPosition(opt);

  console.log(`${opt.miss}: ${vec3Dbg(aimPos)}`);

  // debugging
  if (DBG_CANNONS)
    drawBall(
      V3.clone(aimPos),
      0.5,
      opt.miss ? ENDESGA16.darkRed : ENDESGA16.darkGreen
    );

  // determine how to aim
  const worldRot = getFireDirection(aimPos, opt);

  if (!worldRot)
    // no valid firing solution
    return undefined;

  // check max arc
  const yaw = quat.getAngle(opt.sourceRot, worldRot);
  if (maxRadius < Math.abs(yaw))
    // out of angle
    return undefined;

  return worldRot;
}

export function getTargetMissOrHitPosition(
  { targetPos, targetDir, miss }: FireSolutionOpt,
  out?: V3
): V3 {
  // const targetDir = V3.norm(targetVel);

  // return vec3.copy(out ?? V3.tmp(), targetPos);

  const UP: V3.InputT = [0, 0, 1];
  let tFwd = V3.copy(V3.tmp(), targetDir);
  let tRight = V3.cross(targetDir, UP);

  // console.log(
  //   `targetDir: ${vec3Dbg(targetDir)}, tFwd: ${vec3Dbg(
  //     tFwd
  //   )}, tRight: ${vec3Dbg(tRight)}`
  // );

  // pick an actual target to aim for on the ship
  if (miss) {
    let rightMul = 0;
    let fwdMul = 0;
    if (Math.random() < 0.5) {
      // miss width-wise
      rightMul = 1;
    } else {
      // miss length-wise
      fwdMul = 1;
    }
    if (Math.random() < 0.5) {
      rightMul *= -1;
      fwdMul *= -1;
    }

    V3.scale(
      tFwd,
      fwdMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_LENGTH),
      tFwd
    );
    V3.scale(
      tRight,
      rightMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_WIDTH),
      tRight
    );

    // TODO: why do we move missed shots up?
    tRight[2] += 5;
  } else {
    V3.scale(tFwd, (Math.random() - 0.5) * TARGET_LENGTH, tFwd);
    V3.scale(tRight, (Math.random() - 0.5) * TARGET_WIDTH, tRight);
  }

  const target = V3.add(
    targetPos,
    V3.add(tFwd, tRight, tRight),
    out ?? V3.tmp()
  );

  return target;
}

export function getFireDirection(
  aimPos: V3.InputT,
  { sourcePos, targetVel, projectileSpeed }: FireSolutionOpt
): quat | undefined {
  // NOTE: cannon forward is +X
  // TODO(@darzu): change cannon forward to be +Y?
  const v = projectileSpeed;
  const g = GRAVITY;

  // calculate initial distance
  const d0 = V3.dist(
    [sourcePos[0], sourcePos[1], 0],
    [aimPos[0], aimPos[1], 0]
  );

  // try to lead the target a bit using an approximation of flight
  // time. this will not be exact.
  // TODO(@darzu): sub with exact flight time?
  const flightTime = d0 / (v * Math.cos(Math.PI / 4));
  const leadPos = tV(
    aimPos[0] + targetVel[0] * flightTime * 0.5,
    aimPos[1] + targetVel[1] * flightTime * 0.5,
    aimPos[2] + targetVel[2] * flightTime * 0.5
  );

  // calculate delta between source and target
  const delta = V3.sub(leadPos, sourcePos);

  // calculate yaw
  const yaw = -Math.atan2(delta[1], delta[0]);

  // calculate horizontal distance to target
  const d = V3.len([delta[0], delta[1], 0]);

  // vertical distance to target
  const h = delta[2];

  // now, find the angle from our cannon.
  // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
  let pitch1 = Math.atan(
    (v * v + Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );
  let pitch2 = Math.atan(
    (v * v - Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );

  // console.log(`pitch1: ${pitch1}, pitch2: ${pitch2}`);

  // prefer smaller theta
  if (pitch2 > pitch1) {
    let temp = pitch1;
    pitch1 = pitch2;
    pitch2 = temp;
  }
  let pitch = pitch2;
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    pitch = pitch1;
  }
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    // no firing solution--target is too far or too close
    // console.log("no solution");
    return undefined;
  }

  // ok, we have a firing solution. rotate to the right angle

  // console.log(`yaw: ${yaw}, pitch: ${pitch}`);
  // pitch = 0;

  const worldRot = quat.mk();
  // TODO(@darzu): b/c we're using +X is fwd, we can't use quat.fromYawPitchRoll
  quat.rotZ(worldRot, -yaw, worldRot);
  quat.rotY(worldRot, -pitch, worldRot);

  return worldRot;
}
