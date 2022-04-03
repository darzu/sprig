import { EM, } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef, } from "../net/components.js";
import { aabbCenter } from "../physics/broadphase.js";
import { AssetsDef } from "./assets.js";
import { AngularVelocityDef, LinearVelocityDef, } from "../physics/motion.js";
import { MotionSmoothingDef } from "../smoothing.js";
import { PhysicsResultsDef, WorldFrameDef, } from "../physics/nonintersection.js";
import { BulletDef, fireBullet } from "./bullet.js";
import { DeletedDef, OnDeleteDef } from "../delete.js";
import { LifetimeDef } from "./lifetime.js";
import { EnemyConstructDef, EnemyDef } from "./enemy.js";
import { ShipConstructDef, ShipDef } from "./ship.js";
import { MusicDef } from "../music.js";
export const BoatDef = EM.defineComponent("boat", () => {
    return {
        speed: 0,
        wheelSpeed: 0,
        wheelDir: 0,
        childCannonId: 0,
        childEnemyId: 0,
        fireDelay: 2000,
        fireRate: 3000,
        // fireDelay: 0,
        // fireRate: 500,
        fireZoneId: 0,
    };
});
export const BOAT_COLOR = [0.2, 0.1, 0.05];
export function registerStepBoats(em) {
    em.registerSystem([BoatDef, RotationDef, LinearVelocityDef, AuthorityDef], [PhysicsTimerDef, MeDef], (boats, res) => {
        for (let i = 0; i < res.physicsTimer.steps; i++) {
            for (let o of boats) {
                if (o.authority.pid !== res.me.pid)
                    continue;
                const rad = o.boat.wheelSpeed * res.physicsTimer.period;
                o.boat.wheelDir += rad;
                // rotate
                quat.rotateY(o.rotation, quat.IDENTITY, o.boat.wheelDir);
                // rotate velocity
                vec3.rotateY(o.linearVelocity, [o.boat.speed, -0.01, 0], [0, 0, 0], o.boat.wheelDir);
            }
        }
    }, "stepBoats");
    em.registerSystem([BoatDef, AuthorityDef], [PhysicsTimerDef, MeDef, PhysicsResultsDef], (boats, res) => {
        const ms = res.physicsTimer.period * res.physicsTimer.steps;
        for (let o of boats) {
            if (o.authority.pid !== res.me.pid)
                continue;
            // TODO(@darzu): COUNT DOWN FIREZONE
            const hits = res.physicsResults.collidesWith.get(o.boat.fireZoneId);
            const seesPlayer = hits === null || hits === void 0 ? void 0 : hits.some((h) => !!em.findEntity(h, [ShipConstructDef]));
            if (seesPlayer) {
                o.boat.fireDelay -= ms;
                // console.log(o.boat.fireDelay);
            }
            if (o.boat.fireDelay < 0) {
                o.boat.fireDelay += o.boat.fireRate;
                const cannon = em.findEntity(o.boat.childCannonId, [WorldFrameDef]);
                if (cannon) {
                    const rot = quat.create();
                    quat.rotateY(rot, cannon.world.rotation, Math.PI * 0.5);
                    const bulletSpeed = jitter(0.025) + 0.075;
                    fireBullet(em, 2, cannon.world.position, rot, bulletSpeed);
                }
            }
        }
    }, "boatsFire");
    em.registerSystem([BoatDef, PositionDef, RotationDef], [PhysicsResultsDef, AssetsDef, MusicDef], (objs, res) => {
        for (let boat of objs) {
            const hits = res.physicsResults.collidesWith.get(boat.id);
            if (hits) {
                const balls = hits.filter((h) => { var _a; return ((_a = em.findEntity(h, [BulletDef])) === null || _a === void 0 ? void 0 : _a.bullet.team) === 1; });
                if (balls.length) {
                    console.log("HIT!");
                    for (let ball of balls)
                        em.ensureComponent(ball, DeletedDef);
                    breakBoat(em, boat, res.assets.boat_broken, res.music);
                }
                const ships = hits.filter((h) => em.findEntity(h, [ShipDef]));
                if (ships.length) {
                    console.log("HIT SHIP!");
                    breakBoat(em, boat, res.assets.boat_broken, res.music);
                }
            }
        }
    }, "breakBoats");
}
export function breakBoat(em, boat, boatParts, music) {
    em.ensureComponentOn(boat, DeletedDef);
    music.playChords([3], "minor", 2.0, 5.0, -1);
    for (let part of boatParts) {
        const pe = em.newEntity();
        // TODO(@darzu): use some sort of chunks particle system, we don't
        //  need entity ids for these.
        em.ensureComponentOn(pe, RenderableConstructDef, part.proto);
        em.ensureComponentOn(pe, ColorDef, BOAT_COLOR);
        em.ensureComponentOn(pe, RotationDef, quat.clone(boat.rotation));
        em.ensureComponentOn(pe, PositionDef, vec3.clone(boat.position));
        // em.ensureComponentOn(pe, ColliderDef, {
        //   shape: "AABB",
        //   solid: false,
        //   aabb: part.aabb,
        // });
        const com = aabbCenter(vec3.create(), part.aabb);
        vec3.transformQuat(com, com, boat.rotation);
        // vec3.add(com, com, boat.position);
        // vec3.transformQuat(com, com, boat.rotation);
        const vel = com;
        // const vel = vec3.sub(vec3.create(), com, boat.position);
        vec3.normalize(vel, vel);
        vec3.add(vel, vel, [0, -0.6, 0]);
        vec3.scale(vel, vel, 0.005);
        em.ensureComponentOn(pe, LinearVelocityDef, vel);
        const spin = vec3.fromValues(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        vec3.normalize(spin, spin);
        vec3.scale(spin, spin, 0.001);
        em.ensureComponentOn(pe, AngularVelocityDef, spin);
        em.ensureComponentOn(pe, LifetimeDef, 2000);
    }
}
export const BoatConstructDef = EM.defineComponent("boatConstruct", (loc, speed, wheelSpeed, wheelDir) => {
    return {
        location: loc !== null && loc !== void 0 ? loc : vec3.fromValues(0, 0, 0),
        speed: speed !== null && speed !== void 0 ? speed : 0.01,
        wheelSpeed: wheelSpeed !== null && wheelSpeed !== void 0 ? wheelSpeed : 0.0,
        wheelDir: wheelDir !== null && wheelDir !== void 0 ? wheelDir : 0.0,
    };
});
EM.registerSerializerPair(BoatConstructDef, (c, buf) => {
    buf.writeVec3(c.location);
    buf.writeFloat32(c.speed);
    buf.writeFloat32(c.wheelSpeed);
    buf.writeFloat32(c.wheelDir);
}, (c, buf) => {
    buf.readVec3(c.location);
    c.speed = buf.readFloat32();
    c.wheelSpeed = buf.readFloat32();
    c.wheelDir = buf.readFloat32();
});
export const FireZoneDef = EM.defineComponent("firezone", () => { });
function createBoat(em, e, pid, assets) {
    if (FinishedDef.isOn(e))
        return;
    const props = e.boatConstruct;
    if (!PositionDef.isOn(e))
        em.addComponent(e.id, PositionDef, props.location);
    if (!RotationDef.isOn(e))
        em.addComponent(e.id, RotationDef);
    if (!LinearVelocityDef.isOn(e))
        em.addComponent(e.id, LinearVelocityDef);
    if (!ColorDef.isOn(e))
        em.addComponent(e.id, ColorDef, BOAT_COLOR);
    if (!MotionSmoothingDef.isOn(e))
        em.addComponent(e.id, MotionSmoothingDef);
    if (!RenderableConstructDef.isOn(e))
        em.addComponent(e.id, RenderableConstructDef, assets.boat.mesh);
    if (!AuthorityDef.isOn(e)) {
        // TODO(@darzu): debug why boats have jerky movement
        console.log(`claiming authority of boat ${e.id}`);
        em.addComponent(e.id, AuthorityDef, pid);
    }
    if (!BoatDef.isOn(e)) {
        const boat = em.addComponent(e.id, BoatDef);
        boat.speed = props.speed;
        boat.wheelDir = props.wheelDir;
        boat.wheelSpeed = props.wheelSpeed;
        // child cannon
        const cannon = em.newEntity();
        em.ensureComponentOn(cannon, RenderableConstructDef, assets.cannon.proto);
        em.ensureComponentOn(cannon, PhysicsParentDef, e.id);
        em.ensureComponentOn(cannon, PositionDef, [0, 2, 0]);
        const cannonRot = quat.create();
        const pitch = Math.PI * -0.08;
        quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
        quat.rotateZ(cannonRot, cannonRot, pitch);
        em.ensureComponentOn(cannon, RotationDef, cannonRot);
        boat.childCannonId = cannon.id;
        // child enemy
        const en = em.newEntity();
        em.ensureComponentOn(en, EnemyConstructDef, e.id, [2, 3, 0]);
        boat.childEnemyId = en.id;
        // fire zone
        const fireZone = em.newEntity();
        const fireZoneSize = 40;
        em.ensureComponentOn(fireZone, ColliderDef, {
            solid: false,
            shape: "AABB",
            aabb: {
                min: [-2, -2, -fireZoneSize],
                max: [2, 2, fireZoneSize],
            },
        });
        em.ensureComponentOn(fireZone, PhysicsParentDef, e.id);
        em.ensureComponentOn(fireZone, PositionDef, [0, 0, fireZoneSize]);
        em.ensureComponentOn(fireZone, FireZoneDef);
        boat.fireZoneId = fireZone.id;
    }
    em.ensureComponentOn(e, OnDeleteDef, (id) => {
        if (BoatDef.isOn(e)) {
            em.ensureComponent(e.boat.childCannonId, DeletedDef);
            em.ensureComponent(e.boat.fireZoneId, DeletedDef);
            const child = em.findEntity(e.boat.childEnemyId, [
                WorldFrameDef,
                PositionDef,
                RotationDef,
                EnemyDef,
            ]);
            if (child) {
                em.ensureComponent(child.id, LifetimeDef, 4000);
                em.ensureComponent(child.enemy.leftLegId, LifetimeDef, 4000);
                em.ensureComponent(child.enemy.rightLegId, LifetimeDef, 4000);
                em.removeComponent(child.id, PhysicsParentDef);
                vec3.copy(child.position, child.world.position);
                quat.copy(child.rotation, child.world.rotation);
                em.ensureComponentOn(child, LinearVelocityDef, [0, -0.002, 0]);
            }
        }
    });
    if (!ColliderDef.isOn(e)) {
        const collider = em.addComponent(e.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = true;
        collider.aabb = assets.boat.aabb;
    }
    if (!SyncDef.isOn(e)) {
        const sync = em.addComponent(e.id, SyncDef);
        sync.fullComponents.push(BoatConstructDef.id);
        sync.dynamicComponents.push(PositionDef.id);
        sync.dynamicComponents.push(RotationDef.id);
        sync.dynamicComponents.push(LinearVelocityDef.id);
    }
    // destory after 1 minute
    em.ensureComponentOn(e, LifetimeDef, 1000 * 60);
    em.addComponent(e.id, FinishedDef);
}
export function registerBuildBoatsSystem(em) {
    em.registerSystem([BoatConstructDef], [MeDef, AssetsDef], (boats, res) => {
        for (let b of boats)
            createBoat(em, b, res.me.pid, res.assets);
    }, "buildBoats");
}
