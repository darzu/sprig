import { CameraFollowDef } from "../camera.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { RotationDef } from "../physics/transform.js";
import { PhysicsTimerDef } from "../time.js";

/*
TODO key mapping

controllable:
  WASD / left stick -> xz movement
  Space / A -> jump
  Space / A -> fly up
  c / B -> fly down
  Shift / left stick press -> speed up

  camera: behind, over-shoulder, first person, rts
  cursor (when over-shoulder)

  e / X -> interact
  click / trigger -> shoot

  debug:
  r -> ray
  t -> re-parent
  backspace -> delete obj
*/

export const ControllableDef = EM.defineComponent("controllable", () => {
  return {
    speed: 0.0005,
    sprintMul: 3,
    gravity: 0.1,
    jumpSpeed: 0.003,
    turnSpeed: 0.001,
    modes: {
      canFall: true,
      canFly: true,
      canSprint: true,
      canJump: true,
      canTurn: true,
      canMove: true,
    },
  };
});

export function registerControllableSystems(em: EntityManager) {
  const steerVel = vec3.create();

  em.registerSystem(
    [ControllableDef, LinearVelocityDef, RotationDef, WorldFrameDef],
    [InputsDef, PhysicsTimerDef, MeDef],
    (controllables, res) => {
      const dt = res.physicsTimer.period * res.physicsTimer.steps;

      for (let c of controllables) {
        if (AuthorityDef.isOn(c) && c.authority.pid !== res.me.pid) continue;
        vec3.zero(steerVel);
        const modes = c.controllable.modes;

        let speed = c.controllable.speed * dt;

        if (modes.canSprint)
          if (res.inputs.keyDowns["shift"]) speed *= c.controllable.sprintMul;

        if (modes.canMove) {
          if (res.inputs.keyDowns["a"]) steerVel[0] -= speed;
          if (res.inputs.keyDowns["d"]) steerVel[0] += speed;
          if (res.inputs.keyDowns["w"]) steerVel[2] -= speed;
          if (res.inputs.keyDowns["s"]) steerVel[2] += speed;

          if (modes.canFly) {
            if (res.inputs.keyDowns[" "]) steerVel[1] += speed;
            if (res.inputs.keyDowns["c"]) steerVel[1] -= speed;
          }
        }

        if (modes.canFall)
          c.linearVelocity[1] -= (c.controllable.gravity / 1000) * dt;

        if (modes.canJump)
          if (res.inputs.keyClicks[" "])
            c.linearVelocity[1] = c.controllable.jumpSpeed * dt;

        // apply our steering velocity
        vec3.transformQuat(steerVel, steerVel, c.rotation);
        c.linearVelocity[0] = steerVel[0];
        c.linearVelocity[2] = steerVel[2];
        if (modes.canFly) c.linearVelocity[1] = steerVel[1];

        if (modes.canTurn)
          quat.rotateY(
            c.rotation,
            c.rotation,
            -res.inputs.mouseMovX * c.controllable.turnSpeed
          );
      }
    },
    "controllableInput"
  );

  em.registerSystem(
    [ControllableDef, CameraFollowDef],
    [InputsDef, PhysicsTimerDef, MeDef],
    (controllables, res) => {
      for (let c of controllables) {
        if (AuthorityDef.isOn(c) && c.authority.pid !== res.me.pid) continue;
        if (c.controllable.modes.canTurn)
          quat.rotateX(
            c.cameraFollow.rotationOffset,
            c.cameraFollow.rotationOffset,
            -res.inputs.mouseMovY * c.controllable.turnSpeed
          );
      }
    },
    "controllableCameraFollow"
  );
}
