import { Component, EM } from "../entity-manager.js";
import { randInt } from "../math.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { V, vec3 } from "../sprig-matrix.js";
import { TimeDef } from "../time.js";
import { range } from "../util.js";

const STEPS_ON_WIND_DIR = 6000;
const WIND_CHANGE_STEPS = 300;

const EPSILON = 0.001;

const ORIGIN = V(0, 0, 0);
const AHEAD_DIR = V(0, 0, 1);

const WIND_ANGLES = range(8).map((i) => {
  return (Math.PI * i) / 4 - 0.2;
});

// For now, the wind is just a single vector. It could instead be a vector
// field.
export const WindDef = EM.defineComponent("wind", () => {
  const wind = {
    angle: WIND_ANGLES[0],
    dir: V(0, 0, 1),
    targetAngle: WIND_ANGLES[0],
    oldAngle: WIND_ANGLES[0],
  };
  vec3.rotateY(AHEAD_DIR, ORIGIN, wind.angle, wind.dir);
  return wind;
});

function setWindAngle(wind: Component<typeof WindDef>, angle: number) {
  wind.angle = angle;
  vec3.rotateY(AHEAD_DIR, ORIGIN, angle, wind.dir);
}

EM.registerSystem(
  [],
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
  },
  "changeWind"
);

EM.registerSystem(
  [],
  [WindDef],
  (_, { wind }) => {
    if (Math.abs(wind.angle - wind.targetAngle) > EPSILON) {
      setWindAngle(
        wind,
        wind.angle + (wind.targetAngle - wind.oldAngle) / WIND_CHANGE_STEPS
      );
    }
  },
  "smoothWind"
);
