import { AnimateToDef } from "../animation/animate-to.js";
import { CameraFollowDef } from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "./inputs.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";
import {
  CAM_DEFAULT_PAN_SPEED,
  CAM_DEFAULT_ZOOM_SPEED,
} from "../graybox/graybox-helpers.js";
import { clamp } from "../utils/math.js";

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
    gravity: 0.1 / 1000,
    jumpSpeed: 0.003,
    turnSpeed: 0.001,
    zoomSpeed: CAM_DEFAULT_ZOOM_SPEED,
    minZoom: 5,
    maxZoom: 200,
    dragMul: 5,
    requiresPointerLock: true,
    requiresPointerHover: false,
    modes: {
      canFall: true,
      canFly: true,
      canSprint: true,
      canJump: true,
      canPitch: true,
      canYaw: true,
      // TODO(@darzu): this isn't clean...
      canCameraYaw: false,
      canMove: true,
      mustDragPan: false,
      canZoom: false,
    },
  };
});

EM.addEagerInit([ControllableDef], [], [], () => {
  const steerVel = V3.mk();

  // dbgLogOnce(`adding controllableInput`);

  EM.addSystem(
    "controllableInput",
    Phase.GAME_PLAYERS,
    [ControllableDef, RotationDef, WorldFrameDef],
    [InputsDef, MeDef, CanvasDef, TimeDef],
    (controllables, { inputs, ...res }) => {
      for (let e of controllables) {
        if (AuthorityDef.isOn(e) && e.authority.pid !== res.me.pid) continue;

        const c = e.controllable;

        if (LinearVelocityDef.isOn(e)) {
          if (c.modes.canFall) e.linearVelocity[2] -= c.gravity * res.time.dt;
        }

        // don't control things when we're not locked onto the canvas
        if (c.requiresPointerLock && !res.htmlCanvas.hasMouseLock()) continue;
        if (c.requiresPointerHover && !inputs.mouseHover) continue;

        // TODO(@darzu): need a far more general way to handle things like this
        // don't control things that are animating
        if (AnimateToDef.isOn(e)) continue;

        const dragMul = c.modes.mustDragPan && inputs.ldown ? c.dragMul : 1.0;
        const validDragPan = !c.modes.mustDragPan || inputs.ldown;

        if (CameraFollowDef.isOn(e)) {
          // TODO(@darzu): probably need to use yaw-pitch :(
          if (c.modes.canCameraYaw && validDragPan) {
            e.cameraFollow.yawOffset +=
              inputs.mouseMov[0] * c.turnSpeed * dragMul;
          }
          if (c.modes.canPitch && validDragPan)
            e.cameraFollow.pitchOffset +=
              -inputs.mouseMov[1] * c.turnSpeed * dragMul;

          if (c.modes.canZoom) {
            e.cameraFollow.positionOffset[1] +=
              -inputs.mouseWheel * c.zoomSpeed * res.time.dt;
            e.cameraFollow.positionOffset[1] = clamp(
              e.cameraFollow.positionOffset[1],
              -c.maxZoom,
              -c.minZoom
            );
          }
        }

        // dbgLogOnce(`Controlling ${c.id}`);

        V3.zero(steerVel);
        const modes = c.modes;

        let speed = c.speed * res.time.dt;

        if (modes.canSprint) if (inputs.keyDowns["shift"]) speed *= c.sprintMul;

        if (modes.canMove) {
          // TODO(@darzu): controls mapper that works with keyboard and gamepad
          const left = inputs.keyDowns["a"] || inputs.keyDowns["arrowleft"];
          const right = inputs.keyDowns["d"] || inputs.keyDowns["arrowright"];
          const up = inputs.keyDowns["w"] || inputs.keyDowns["arrowup"];
          const down = inputs.keyDowns["s"] || inputs.keyDowns["arrowdown"];
          if (left) steerVel[0] -= speed;
          if (right) steerVel[0] += speed;
          if (up) steerVel[1] += speed;
          if (down) steerVel[1] -= speed;

          if (modes.canFly) {
            if (inputs.keyDowns[" "]) steerVel[2] += speed;
            if (inputs.keyDowns["c"]) steerVel[2] -= speed;
          }
        }

        EM.set(e, LinearVelocityDef);

        if (modes.canJump)
          if (inputs.keyClicks[" "])
            e.linearVelocity[2] = c.jumpSpeed * res.time.dt;

        // apply our steering velocity
        V3.tQuat(steerVel, e.rotation, steerVel);
        e.linearVelocity[0] = steerVel[0];
        e.linearVelocity[1] = steerVel[1];
        if (modes.canFly) e.linearVelocity[2] = steerVel[2];

        if (modes.canYaw && validDragPan)
          quat.rotZ(
            e.rotation,
            -inputs.mouseMov[0] * c.turnSpeed * dragMul,
            e.rotation
          );
      }
    }
  );
});
