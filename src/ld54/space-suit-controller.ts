import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";

export const SpaceSuitDef = EM.defineComponent("spaceSuit", () => ({
  // TODO(@darzu): data
  speed: 0.0005,
  turnSpeed: 0.001,
  rollSpeed: 0.03,
}));

EM.addEagerInit([SpaceSuitDef], [], [], () => {
  // TODO(@darzu): init

  // const localVel = vec3.create();

  const speed = EM.addSystem(
    "controlSpaceSuit",
    Phase.GAME_PLAYERS,
    [SpaceSuitDef, RotationDef],
    [InputsDef, TimeDef],
    (suits, res) => {
      for (let e of suits) {
        let speed = e.spaceSuit.speed * res.time.dt;

        // 6-DOF translation
        const localVel = vec3.zero();
        if (res.inputs.keyDowns["a"]) localVel[0] -= speed;
        if (res.inputs.keyDowns["d"]) localVel[0] += speed;
        if (res.inputs.keyDowns["w"]) localVel[2] -= speed;
        if (res.inputs.keyDowns["s"]) localVel[2] += speed;
        if (res.inputs.keyDowns[" "]) localVel[1] += speed;
        if (res.inputs.keyDowns["c"]) localVel[1] -= speed;

        const parentVel = vec3.transformQuat(localVel, e.rotation);

        EM.set(e, LinearVelocityDef, parentVel);

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
