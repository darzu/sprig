import { AudioDef } from "../audio/audio.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { SWORD_SWING_DURATION } from "./gamestate.js";

export const SpaceSuitDef = EM.defineComponent("spaceSuit", () => ({
  // TODO(@darzu): data
  speed: 0.00003,
  turnSpeed: 0.001,
  rollSpeed: 0.01,
  doDampen: true,
  localAccel: vec3.create(),
  swingingSword: false,
  swordSwingT: 0,
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

        vec3.zero(e.spaceSuit.localAccel);
        // 6-DOF translation
        if (res.inputs.keyDowns["a"]) e.spaceSuit.localAccel[0] -= speed;
        if (res.inputs.keyDowns["d"]) e.spaceSuit.localAccel[0] += speed;
        if (res.inputs.keyDowns["w"]) e.spaceSuit.localAccel[2] -= speed;
        if (res.inputs.keyDowns["s"]) e.spaceSuit.localAccel[2] += speed;
        if (res.inputs.keyDowns[" "]) e.spaceSuit.localAccel[1] += speed;
        if (res.inputs.keyDowns["c"]) e.spaceSuit.localAccel[1] -= speed;

        const rotatedAccel = vec3.transformQuat(
          e.spaceSuit.localAccel,
          e.rotation
        );

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
        // TODO(@darzu): Z_UP rotateY
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

        // sword
        if (e.spaceSuit.swingingSword) {
          e.spaceSuit.swordSwingT += res.time.dt;
          if (e.spaceSuit.swordSwingT >= SWORD_SWING_DURATION) {
            e.spaceSuit.swingingSword = false;
          }
        }
        if (res.inputs.lclick && !e.spaceSuit.swingingSword) {
          e.spaceSuit.swingingSword = true;
          e.spaceSuit.swordSwingT = 0;
          EM.whenResources(AudioDef, SoundSetDef).then((res) => {
            res.music.playSound("sword", res.soundSet["sword.mp3"], 0.2);
          });
        }
      }
    }
  );
});
