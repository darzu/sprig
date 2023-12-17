import { AudioDef } from "../audio/audio.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { PartyDef } from "../camera/party.js";
import { fireBullet } from "../cannons/bullet.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3, mat4, quat } from "../matrix/sprig-matrix.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { TimeDef } from "../time/time.js";
import { jitter } from "../utils/math.js";
import { StoneTowerDef } from "./tower.js";

const __previousPartyPos = vec3.create();
let __prevTime = 0;

const MAX_THETA = Math.PI / 2 - Math.PI / 16;
const MIN_THETA = -MAX_THETA;
const THETA_JITTER = 0; //Math.PI / 256;
const PHI_JITTER = 0; //Math.PI / 64;
const TARGET_WIDTH = 12;
const TARGET_LENGTH = 30;
const MISS_TARGET_LENGTH = 55;
const MISS_TARGET_WIDTH = 22;
const MISS_BY_MAX = 10;
const MISS_PROBABILITY = 0.25;
const MAX_RANGE = 300;

const GRAVITY = 6.0 * 0.00001;

EM.addSystem(
  "stoneTowerAttack",
  Phase.GAME_WORLD,
  [StoneTowerDef, WorldFrameDef],
  [TimeDef, PartyDef],
  (es, res) => {
    // pick a random spot on the ship to aim for
    if (!res.party.pos) return;

    for (let tower of es) {
      if (!tower.stoneTower.alive) continue;
      const invertedTransform = mat4.invert(tower.world.transform);
      const towerSpacePos = vec3.transformMat4(
        res.party.pos,
        invertedTransform
      );
      const prevTowerSpacePos = vec3.transformMat4(
        __previousPartyPos,
        invertedTransform
      );

      const targetVelocity = vec3.scale(
        vec3.sub(towerSpacePos, prevTowerSpacePos),
        1 / (res.time.time - __prevTime)
      );

      let zBasis = vec3.copy(vec3.tmp(), res.party.dir);
      let xBasis = vec3.cross(res.party.dir, [0, 1, 0]);
      let missed = false;
      // pick an actual target to aim for on the ship
      if (Math.random() < MISS_PROBABILITY) {
        missed = true;
        let xMul = 0;
        let zMul = 0;
        if (Math.random() < 0.5) {
          // miss width-wise
          xMul = 1;
        } else {
          // miss length-wise
          zMul = 1;
        }
        if (Math.random() < 0.5) {
          xMul *= -1;
          zMul *= -1;
        }
        vec3.scale(
          zBasis,
          zMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_LENGTH),
          zBasis
        );
        vec3.scale(
          xBasis,
          xMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_WIDTH),
          xBasis
        );
        xBasis[1] += 5;
      } else {
        vec3.scale(zBasis, (Math.random() - 0.5) * TARGET_LENGTH, zBasis);
        vec3.scale(xBasis, (Math.random() - 0.5) * TARGET_WIDTH, xBasis);
      }

      const target = vec3.add(res.party.pos, vec3.add(zBasis, xBasis, xBasis));
      //target[1] *= 0.75;
      //console.log(`adjusted target is ${vec3Dbg(target)}`);
      const towerSpaceTarget = vec3.transformMat4(
        target,
        invertedTransform,
        target
      );
      /*
      const zvelocity = targetVelocity[2];

      const timeToZZero = -(towerSpaceTarget[2] / zvelocity);
      if (timeToZZero < 0) {
        // it's moving away, don't worry about it
        continue;
      }

      // what will the x position be, relative to the cannon, when z = 0?
      const x =
        towerSpaceTarget[0] +
        targetVelocity[0] * timeToZZero -
        tower.stoneTower.cannon()!.position[0];
      // y is probably constant, but calculate it just for fun
      const y =
        towerSpaceTarget[1] +
        targetVelocity[1] * timeToZZero -
        tower.stoneTower.cannon()!.position[1];
      console.log(`timeToZZero=${timeToZZero}`);
      */

      const v = tower.stoneTower.projectileSpeed;
      const g = GRAVITY;

      let x = towerSpaceTarget[0] - tower.stoneTower.cannon()!.position[0];
      const y = towerSpaceTarget[1] - tower.stoneTower.cannon()!.position[1];
      let z = towerSpaceTarget[2];

      // try to lead the target a bit using an approximation of flight
      // time. this will not be exact.

      const flightTime = x / (v * Math.cos(Math.PI / 4));
      z = z + targetVelocity[2] * flightTime * 0.5;
      x = x + targetVelocity[0] * flightTime * 0.5;
      if (x < 0) {
        // target is behind us, don't worry about it
        continue;
      }
      if (x > MAX_RANGE) {
        // target is too far away, don't worry about it
        continue;
      }

      let phi = -Math.atan(z / x);

      if (Math.abs(phi) > tower.stoneTower.firingRadius) {
        continue;
      }

      x = Math.sqrt(x * x + z * z);

      // now, find the angle from our cannon.
      // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
      let theta1 = Math.atan(
        (v * v + Math.sqrt(v * v * v * v - g * (g * x * x + 2 * y * v * v))) /
          (g * x)
      );
      let theta2 = Math.atan(
        (v * v - Math.sqrt(v * v * v * v - g * (g * x * x + 2 * y * v * v))) /
          (g * x)
      );

      // prefer smaller theta
      if (theta2 > theta1) {
        let temp = theta1;
        theta1 = theta2;
        theta2 = temp;
      }
      let theta = theta2;
      if (isNaN(theta) || theta > MAX_THETA || theta < MIN_THETA) {
        theta = theta1;
      }
      if (isNaN(theta) || theta > MAX_THETA || theta < MIN_THETA) {
        // no firing solution--target is too far or too close
        continue;
      }
      // console.log(
      //   `Firing solution found, theta1 is ${theta1} theta2 is ${theta2} x=${x} y=${y} v=${v} sqrt is ${Math.sqrt(
      //     v * v * v * v - g * (g * x * x + 2 * y * v * v)
      //   )}`
      // );
      // ok, we have a firing solution. rotate to the right angle

      // fire if we are within a couple of frames
      /*
      console.log(`flightTime=${flightTime} timeToZZero=${timeToZZero}`);
      if (Math.abs(flightTime - timeToZZero) > 32) {
        continue;
      }*/
      // maybe we can't actually fire yet?
      if (
        tower.stoneTower.lastFired + tower.stoneTower.fireRate >
        res.time.time
      ) {
        continue;
      }
      const rot = tower.stoneTower.cannon()!.rotation;
      quat.identity(rot);
      quat.rotateZ(rot, theta, rot);
      quat.rotateY(rot, phi, rot);

      // when we fire, add some jitter to both theta and phi
      quat.rotateZ(rot, jitter(THETA_JITTER), rot);
      quat.rotateZ(rot, jitter(PHI_JITTER), rot);
      const worldRot = quat.create();
      mat4.getRotation(
        mat4.mul(tower.world.transform, mat4.fromQuat(rot)),
        worldRot
      );

      const b = fireBullet(
        2,
        tower.stoneTower.cannon()!.world.position,
        worldRot,
        v,
        0.02,
        g,
        // 2.0,
        20.0,
        // TODO(@darzu): Z_UP: fix cannon fire axis?
        [1, 0, 0]
      );
      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("cannonL", res.soundSet["cannonL.mp3"], 0.1);
      });
      b.then((b) => {
        if (missed) {
          //vec3.set(0.8, 0.2, 0.2, b.color);
        }
      });
      tower.stoneTower.lastFired = res.time.time;
    }
    vec3.copy(__previousPartyPos, res.party.pos);
    __prevTime = res.time.time;
  }
);
