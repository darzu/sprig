import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";

export const SpaceSuitDef = EM.defineComponent("spaceSuit", () => ({
  // TODO(@darzu): data
  speed: 0.00003,
  turnSpeed: 0.001,
  rollSpeed: 0.01,
  doDampen: true,
}));

EM.addEagerInit([SpaceSuitDef], [], [], () => {
  // TODO(@darzu): init

  // const localVel = vec3.create();

  const speed = EM.addSystem(
    "controlSpaceSuit",
    Phase.GAME_PLAYERS,
    [SpaceSuitDef, RotationDef, LinearVelocityDef],
    [InputsDef, TimeDef],
    (suits, res) => {
      for (let e of suits) {
        let speed = e.spaceSuit.speed * res.time.dt;

        const localAccel = vec3.zero();

        // 6-DOF translation
        if (res.inputs.keyDowns["a"]) localAccel[0] -= speed;
        if (res.inputs.keyDowns["d"]) localAccel[0] += speed;
        if (res.inputs.keyDowns["w"]) localAccel[2] -= speed;
        if (res.inputs.keyDowns["s"]) localAccel[2] += speed;
        if (res.inputs.keyDowns[" "]) localAccel[1] += speed;
        if (res.inputs.keyDowns["c"]) localAccel[1] -= speed;

        const rotatedAccel = vec3.transformQuat(localAccel, e.rotation);

        // change dampen?
        if (res.inputs.keyClicks["z"])
          e.spaceSuit.doDampen = !e.spaceSuit.doDampen;

        // dampener
        if (e.spaceSuit.doDampen && vec3.sqrLen(rotatedAccel) === 0) {
          const dampDir = vec3.normalize(vec3.negate(e.linearVelocity));
          vec3.scale(dampDir, speed, rotatedAccel);

          // halt if at small delta
          if (vec3.sqrLen(e.linearVelocity) < vec3.sqrLen(rotatedAccel)) {
            vec3.zero(rotatedAccel);
            vec3.zero(e.linearVelocity);
          }
        }

        vec3.add(e.linearVelocity, rotatedAccel, e.linearVelocity);

        // camera rotation
        quat.rotateY(
          e.rotation,
          -res.inputs.mouseMov[0] * e.spaceSuit.turnSpeed,
          e.rotation
        );

        quat.rotateX(
          e.rotation,
          -res.inputs.mouseMov[1] * e.spaceSuit.turnSpeed,
          e.rotation
        );

        let rollSpeed = 0;
        if (res.inputs.keyDowns["q"]) rollSpeed = 1;
        if (res.inputs.keyDowns["e"]) rollSpeed = -1;

        quat.rotateZ(e.rotation, rollSpeed * e.spaceSuit.rollSpeed, e.rotation);
      }
    }
  );
});
