// player controller component and system
import { quat, vec3 } from "./gl-matrix.js";
import { createMotionProps } from "./phys_motion.js";
export function createPlayerProps() {
    return {
        jumpSpeed: 0.003,
        gravity: 0.0001,
    };
}
export function stepPlayer(player, interactionObject, dt, inputs, camera, spawnBullet) {
    // fall with gravity
    player.motion.linearVelocity[1] -= player.player.gravity * dt;
    // move player
    let vel = vec3.fromValues(0, 0, 0);
    let playerSpeed = 0.001;
    let n = playerSpeed * dt;
    if (inputs.keyDowns["a"]) {
        vec3.add(vel, vel, vec3.fromValues(-n, 0, 0));
    }
    if (inputs.keyDowns["d"]) {
        vec3.add(vel, vel, vec3.fromValues(n, 0, 0));
    }
    if (inputs.keyDowns["w"]) {
        vec3.add(vel, vel, vec3.fromValues(0, 0, -n));
    }
    if (inputs.keyDowns["s"]) {
        vec3.add(vel, vel, vec3.fromValues(0, 0, n));
    }
    if (inputs.keyClicks["e"]) {
        player.interactingWith = interactionObject;
    }
    else {
        player.interactingWith = 0;
    }
    player.dropping = (inputs.keyClicks["q"] || 0) > 0;
    // if (inputs.keyDowns["shift"]) {
    //   vec3.add(vel, vel, vec3.fromValues(0, n, 0));
    // }
    // if (inputs.keyDowns["c"]) {
    //   vec3.add(vel, vel, vec3.fromValues(0, -n, 0));
    // }
    if (inputs.keyClicks[" "]) {
        player.motion.linearVelocity[1] = player.player.jumpSpeed * dt;
    }
    vec3.transformQuat(vel, vel, player.motion.rotation);
    // vec3.add(player.motion.linearVelocity, player.motion.linearVelocity, vel);
    // x and z from local movement
    player.motion.linearVelocity[0] = vel[0];
    player.motion.linearVelocity[2] = vel[2];
    quat.rotateY(player.motion.rotation, player.motion.rotation, -inputs.mouseX * 0.001);
    quat.rotateX(camera.rotation, camera.rotation, -inputs.mouseY * 0.001);
    // add bullet on lclick
    if (inputs.lclick) {
        let bullet_axis = vec3.fromValues(0, 0, -1);
        bullet_axis = vec3.transformQuat(bullet_axis, bullet_axis, player.motion.rotation);
        let bulletMotion = createMotionProps({});
        bulletMotion.location = vec3.clone(player.motion.location);
        bulletMotion.rotation = quat.clone(player.motion.rotation);
        bulletMotion.linearVelocity = vec3.scale(bulletMotion.linearVelocity, bullet_axis, 0.02);
        // TODO(@darzu): adds player motion
        // bulletMotion.linearVelocity = vec3.add(
        //   bulletMotion.linearVelocity,
        //   bulletMotion.linearVelocity,
        //   player.motion.linearVelocity
        // );
        bulletMotion.angularVelocity = vec3.scale(bulletMotion.angularVelocity, bullet_axis, 0.01);
        spawnBullet(bulletMotion);
    }
    if (inputs.rclick) {
        const SPREAD = 5;
        const GAP = 1.0;
        for (let xi = 0; xi <= SPREAD; xi++) {
            for (let yi = 0; yi <= SPREAD; yi++) {
                const x = (xi - SPREAD / 2) * GAP;
                const y = (yi - SPREAD / 2) * GAP;
                let bullet_axis = vec3.fromValues(0, 0, -1);
                bullet_axis = vec3.transformQuat(bullet_axis, bullet_axis, player.motion.rotation);
                let bulletMotion = createMotionProps({});
                bulletMotion.location = vec3.add(vec3.create(), player.motion.location, vec3.fromValues(x, y, 0));
                bulletMotion.rotation = quat.clone(player.motion.rotation);
                bulletMotion.linearVelocity = vec3.scale(bulletMotion.linearVelocity, bullet_axis, 0.005);
                bulletMotion.linearVelocity = vec3.add(bulletMotion.linearVelocity, bulletMotion.linearVelocity, player.motion.linearVelocity);
                bulletMotion.angularVelocity = vec3.scale(bulletMotion.angularVelocity, bullet_axis, 0.01);
                spawnBullet(bulletMotion);
            }
        }
    }
}
//# sourceMappingURL=player.js.map