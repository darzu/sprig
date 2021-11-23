import { quat, vec3 } from "./gl-matrix.js";
export function createBoatProps() {
    return {
        speed: 0,
        wheelSpeed: 0,
        wheelDir: 0,
    };
}
export function stepBoats(objs, dt) {
    for (let o of objs) {
        const rad = o.boat.wheelSpeed * dt;
        o.boat.wheelDir += rad;
        // rotate
        quat.rotateY(o.motion.rotation, o.motion.rotation, rad);
        // rotate velocity
        vec3.rotateY(o.motion.linearVelocity, [o.boat.speed, 0, 0], [0, 0, 0], o.boat.wheelDir);
    }
}
//# sourceMappingURL=boat.js.map