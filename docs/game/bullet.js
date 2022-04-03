import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef, PredictDef } from "../net/components.js";
import { AssetsDef } from "./assets.js";
import { AngularVelocityDef, LinearVelocityDef, } from "../physics/motion.js";
import { MotionSmoothingDef } from "../smoothing.js";
import { PhysicsTimerDef } from "../time.js";
import { LifetimeDef } from "./lifetime.js";
export const BulletDef = EM.defineComponent("bullet", (team) => {
    return {
        team,
    };
});
export const BulletConstructDef = EM.defineComponent("bulletConstruct", (loc, vel, angVel, team) => {
    return {
        location: loc !== null && loc !== void 0 ? loc : vec3.fromValues(0, 0, 0),
        linearVelocity: vel !== null && vel !== void 0 ? vel : vec3.fromValues(0, 1, 0),
        angularVelocity: angVel !== null && angVel !== void 0 ? angVel : vec3.fromValues(0, 0, 0),
        team,
    };
});
EM.registerSerializerPair(BulletConstructDef, (c, writer) => {
    writer.writeVec3(c.location);
    writer.writeVec3(c.linearVelocity);
    writer.writeVec3(c.angularVelocity);
}, (c, reader) => {
    reader.readVec3(c.location);
    reader.readVec3(c.linearVelocity);
    reader.readVec3(c.angularVelocity);
});
const BULLET_COLOR = [0.02, 0.02, 0.02];
function createBullet(em, e, pid, assets) {
    if (FinishedDef.isOn(e))
        return;
    const props = e.bulletConstruct;
    em.ensureComponent(e.id, PositionDef, props.location);
    em.ensureComponent(e.id, RotationDef);
    em.ensureComponent(e.id, LinearVelocityDef, props.linearVelocity);
    em.ensureComponent(e.id, AngularVelocityDef, props.angularVelocity);
    em.ensureComponent(e.id, ColorDef, BULLET_COLOR);
    em.ensureComponent(e.id, MotionSmoothingDef);
    em.ensureComponent(e.id, RenderableConstructDef, assets.ball.proto);
    em.ensureComponent(e.id, AuthorityDef, pid);
    em.ensureComponent(e.id, BulletDef, props.team);
    em.ensureComponent(e.id, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: assets.ball.aabb,
    });
    em.ensureComponent(e.id, LifetimeDef, 4000);
    em.ensureComponent(e.id, SyncDef, [BulletConstructDef.id], [PositionDef.id]);
    em.ensureComponent(e.id, PredictDef);
    em.addComponent(e.id, FinishedDef);
}
export function registerBuildBulletsSystem(em) {
    em.registerSystem([BulletConstructDef], [MeDef, AssetsDef], (bullets, res) => {
        for (let b of bullets)
            createBullet(em, b, res.me.pid, res.assets);
    }, "buildBullets");
}
export function registerBulletUpdate(em) {
    em.registerSystem([BulletDef, PositionDef, LinearVelocityDef], [PhysicsTimerDef], (bullets, res) => {
        for (let b of bullets) {
            b.linearVelocity[1] -= 0.001 * res.physicsTimer.steps;
        }
    }, "updateBullets");
}
export function fireBullet(em, team, location, rotation, speed = 0.02, rotationSpeed = 0.02) {
    let bulletAxis = vec3.fromValues(0, 0, -1);
    vec3.transformQuat(bulletAxis, bulletAxis, rotation);
    vec3.normalize(bulletAxis, bulletAxis);
    const linearVelocity = vec3.scale(vec3.create(), bulletAxis, speed);
    const angularVelocity = vec3.scale(vec3.create(), bulletAxis, rotationSpeed);
    const e = em.newEntity();
    em.addComponent(e.id, BulletConstructDef, vec3.clone(location), linearVelocity, angularVelocity, team);
}
