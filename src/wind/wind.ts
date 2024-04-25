import { EM } from "../ecs/entity-manager.js";
import { Component } from "../ecs/em-components.js";
import { Resource } from "../ecs/em-resources.js";
import { randInt } from "../utils/math.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { range } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3Dbg } from "../utils/utils-3d.js";

const STEPS_ON_WIND_DIR = 6000;
// const STEPS_ON_WIND_DIR = 400;
const WIND_CHANGE_STEPS = 300;

const EPSILON = 0.001;

const WIND_ANGLES = range(8).map((i) => {
  return (Math.PI * i) / 4 - 0.2;
});

// For now, the wind is just a single vector. It could instead be a vector
// field.
export const WindDef = EM.defineResource("wind", () => {
  const wind = {
    angle: WIND_ANGLES[0],
    dir: V(1, 0, 0),
    targetAngle: WIND_ANGLES[0],
    oldAngle: WIND_ANGLES[0],
  };
  // TODO(@darzu): use yaw/pitch/roll
  V3.yaw(V3.X, -wind.angle, wind.dir);
  return wind;
});

export function setWindAngle(wind: Resource<typeof WindDef>, angle: number) {
  wind.angle = angle;
  V3.yaw(V3.X, -angle, wind.dir);
  // console.log(
  //   `WIND_X_DIR: ${vec3Dbg(WIND_X_DIR)} ORIGIN:${vec3Dbg(
  //     ORIGIN
  //   )} angle: ${angle}, setWindAngle: ${angle}, wind.dir: ${vec3Dbg(wind.dir)}`
  // );
}

function angleBetweenRadians(a: number, b: number): number {
  let diff = a - b;
  // lol there's definitely an analytic way to do this
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function registerChangeWindSystems() {
  EM.addSystem(
    "changeWind",
    Phase.GAME_WORLD,
    null,
    [WindDef, TimeDef, RendererDef],
    (_, res) => {
      if (res.time.step % STEPS_ON_WIND_DIR === 0) {
        const angle = WIND_ANGLES[randInt(0, 7)];
        console.log(`changing wind to ${angle}`);
        res.wind.oldAngle = res.wind.targetAngle;
        res.wind.targetAngle = angle;

        res.renderer.renderer.updateScene({
          windDir: res.wind.dir,
        });
      }
    }
  );

  EM.addSystem(
    "smoothWind",
    Phase.GAME_WORLD,
    null,
    [WindDef],
    (_, { wind }) => {
      if (Math.abs(wind.angle - wind.targetAngle) > EPSILON) {
        const diff = angleBetweenRadians(wind.targetAngle, wind.oldAngle);
        setWindAngle(wind, wind.angle + diff / WIND_CHANGE_STEPS);
      }
    }
  );
}
