import { EM } from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import { registerConstructRenderablesSystem, registerRenderer, registerUpdateCameraView, RenderableConstructDef, } from "../render/renderer.js";
import { registerInitTransforms, TransformDef, } from "../physics/transform.js";
import { BoatConstructDef, registerBuildBoatsSystem, registerStepBoats, } from "./boat.js";
import { CameraDef, PlayerConstructDef, registerBuildPlayersSystem, registerStepPlayers, } from "./player.js";
import { registerNetSystems } from "../net/net.js";
import { registerHandleNetworkEvents, registerSendOutboxes, } from "../net/network-event-handler.js";
import { registerJoinSystems } from "../net/join.js";
import { registerSyncSystem, registerUpdateSystem, registerAckUpdateSystem, } from "../net/sync.js";
import { registerPredictSystem } from "../net/predict.js";
import { registerEventSystems } from "../net/events.js";
import { registerBuildCubesSystem, registerMoveCubesSystem } from "./cube.js";
import { PhysicsTimerDef, registerTimeSystem } from "../time.js";
import { GroundConstructDef, GROUNDSIZE, GroundSystemDef, registerGroundSystems, } from "./ground.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { registerShipSystems, ShipConstructDef } from "./ship.js";
import { HatConstructDef, } from "./hat.js";
import { registerBuildBulletsSystem, registerBulletUpdate } from "./bullet.js";
import { AssetsDef, LIGHT_BLUE, registerAssetLoader, } from "./assets.js";
import { registerInitCanvasSystem } from "../canvas.js";
import { registerRenderInitSystem, RendererDef, } from "../render/render_init.js";
import { registerDeleteEntitiesSystem } from "../delete.js";
import { registerBuildAmmunitionSystem, registerBuildCannonsSystem, registerBuildLinstockSystem, registerPlayerCannonSystem, } from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import { registerToolDropSystem, registerToolPickupSystem } from "./tool.js";
import { registerUpdateSmoothingTargetSnapChange, registerUpdateSmoothingTargetSmoothChange, registerUpdateSmoothingLerp, registerUpdateSmoothedTransform, } from "../smoothing.js";
import { registerBuildCursor } from "./cursor.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { registerPhysicsSystems } from "../physics/phys.js";
import { registerNoodleSystem } from "./noodles.js";
import { registerUpdateLifetimes } from "./lifetime.js";
import { registerCreateEnemies } from "./enemy.js";
import { registerMusicSystems } from "../music.js";
export const ColorDef = EM.defineComponent("color", (c) => c !== null && c !== void 0 ? c : vec3.create());
EM.registerSerializerPair(ColorDef, (o, writer) => {
    writer.writeVec3(o);
}, (o, reader) => {
    reader.readVec3(o);
});
function createPlayer(em) {
    const e = em.newEntity();
    em.addComponent(e.id, PlayerConstructDef, vec3.fromValues(0, 5, 0));
}
function createGround(em) {
    const loc = vec3.fromValues(0, -7, 0);
    const color = LIGHT_BLUE;
    let { id } = em.newEntity();
    em.addComponent(id, GroundConstructDef, loc, color);
}
const WorldPlaneConstDef = EM.defineComponent("worldPlane", (t) => {
    return {
        transform: t !== null && t !== void 0 ? t : mat4.create(),
    };
});
EM.registerSerializerPair(WorldPlaneConstDef, (o, buf) => buf.writeMat4(o.transform), (o, buf) => buf.readMat4(o.transform));
function createWorldPlanes(em) {
    const ts = [
        mat4.fromRotationTranslationScale(mat4.create(), quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5), [100, 50, -100], [10, 10, 10]),
        mat4.fromRotationTranslationScale(mat4.create(), quat.fromEuler(quat.create(), 0, 0, 0), [0, -1000, -0], [100, 100, 100]),
        mat4.fromRotationTranslationScale(mat4.create(), quat.fromEuler(quat.create(), 0, 0, Math.PI * 1), [10, -2, 10], [0.2, 0.2, 0.2]),
    ];
    for (let t of ts) {
        em.ensureComponentOn(em.newEntity(), WorldPlaneConstDef, t);
    }
}
function registerBuildWorldPlanes(em) {
    em.registerSystem([WorldPlaneConstDef], [AssetsDef, MeDef], (es, res) => {
        for (let e of es) {
            if (FinishedDef.isOn(e))
                continue;
            em.ensureComponentOn(e, TransformDef, e.worldPlane.transform);
            em.ensureComponentOn(e, ColorDef, [1, 0, 1]);
            em.ensureComponentOn(e, RenderableConstructDef, res.assets.gridPlane.mesh);
            em.ensureComponentOn(e, ColliderDef, {
                shape: "AABB",
                solid: true,
                aabb: res.assets.gridPlane.aabb,
            });
            em.ensureComponentOn(e, SyncDef, [WorldPlaneConstDef.id], []);
            em.ensureComponentOn(e, AuthorityDef, res.me.pid);
            em.ensureComponentOn(e, FinishedDef);
        }
    }, "buildWorldPlanes");
}
export function registerAllSystems(em) {
    registerTimeSystem(em);
    registerNetSystems(em);
    registerInitCanvasSystem(em);
    registerUISystems(em);
    registerRenderInitSystem(em);
    registerMusicSystems(em);
    registerHandleNetworkEvents(em);
    registerUpdateSmoothingTargetSnapChange(em);
    registerUpdateSystem(em);
    registerPredictSystem(em);
    registerUpdateSmoothingTargetSmoothChange(em);
    registerJoinSystems(em);
    registerAssetLoader(em);
    registerBuildPlayersSystem(em);
    registerGroundSystems(em);
    registerBuildWorldPlanes(em);
    registerBuildCubesSystem(em);
    registerBuildBoatsSystem(em);
    registerShipSystems(em);
    registerBuildBulletsSystem(em);
    registerBuildCannonsSystem(em);
    registerBuildAmmunitionSystem(em);
    registerBuildLinstockSystem(em);
    registerBuildCursor(em);
    registerCreateEnemies(em);
    registerInitTransforms(em);
    registerMoveCubesSystem(em);
    registerStepBoats(em);
    registerStepPlayers(em);
    registerBulletUpdate(em);
    registerNoodleSystem(em);
    registerUpdateLifetimes(em);
    registerInteractionSystem(em);
    // registerStepCannonsSystem(em);
    registerPlayerCannonSystem(em);
    registerUpdateSmoothingLerp(em);
    registerPhysicsSystems(em);
    registerBulletCollisionSystem(em);
    registerModeler(em);
    registerToolPickupSystem(em);
    registerToolDropSystem(em);
    registerAckUpdateSystem(em);
    registerSyncSystem(em);
    registerSendOutboxes(em);
    registerEventSystems(em);
    registerDeleteEntitiesSystem(em);
    // TODO(@darzu): confirm this all works
    registerUpdateSmoothedTransform(em);
    registerRenderViewController(em);
    registerUpdateCameraView(em);
    registerConstructRenderablesSystem(em);
    registerRenderer(em);
}
export const TextDef = EM.defineComponent("text", () => {
    return {
        setText: (s) => { },
    };
});
export function registerUISystems(em) {
    const txt = em.addSingletonComponent(TextDef);
    const titleDiv = document.getElementById("title-div");
    txt.setText = (s) => {
        titleDiv.firstChild.nodeValue = s;
    };
}
function registerRenderViewController(em) {
    em.registerSystem([], [InputsDef, RendererDef, CameraDef], (_, { inputs, renderer, camera }) => {
        // check render mode
        if (inputs.keyClicks["1"]) {
            // both lines and tris
            renderer.renderer.drawLines = true;
            renderer.renderer.drawTris = true;
        }
        else if (inputs.keyClicks["2"]) {
            // "wireframe", lines only
            renderer.renderer.drawLines = true;
            renderer.renderer.drawTris = false;
        }
        // check perspective mode
        if (inputs.keyClicks["3"]) {
            if (camera.perspectiveMode === "ortho")
                camera.perspectiveMode = "perspective";
            else
                camera.perspectiveMode = "ortho";
        }
        // check camera mode
        if (inputs.keyClicks["4"]) {
            if (camera.cameraMode === "thirdPerson")
                camera.cameraMode = "thirdPersonOverShoulder";
            else
                camera.cameraMode = "thirdPerson";
        }
    }, "renderView");
}
export function initGame(em) {
    // init camera
    createCamera(em);
    // TODO(@darzu): DEBUGGING
    // debugCreateNoodles(em);
    debugBoatParts(em);
}
function debugBoatParts(em) {
    let once = false;
    em.registerSystem([], [AssetsDef], (_, res) => {
        if (once)
            return;
        once = true;
        // TODO(@darzu): this works!
        // const bigM = res.assets.boat_broken;
        // for (let i = 0; i < bigM.length; i++) {
        //   const e = em.newEntity();
        //   em.ensureComponentOn(e, RenderableConstructDef, bigM[i].mesh);
        //   em.ensureComponentOn(e, PositionDef, [0, 0, 0]);
        // }
    }, "debugBoatParts");
}
export function createServerObjects(em) {
    // let { id: cubeId } = em.newEntity();
    // em.addComponent(cubeId, CubeConstructDef, 3, LIGHT_BLUE);
    createPlayer(em);
    // createGround(em);
    registerBoatSpawnerSystem(em);
    createShips(em);
    // createHats(em);
    // createWorldPlanes(em);
}
export function createLocalObjects(em) {
    createPlayer(em);
}
function createCamera(_em) {
    EM.addSingletonComponent(CameraDef);
}
function createShips(em) {
    const rot = quat.create();
    // quat.rotateY(rot, rot, Math.PI * -0.4);
    // const pos: vec3 = [-40, -10, -60];
    const pos = vec3.fromValues(0, -2, 0);
    // const pos: vec3 = [0, -10, 130];
    em.addComponent(em.newEntity().id, ShipConstructDef, pos, rot);
}
export const BoatSpawnerDef = EM.defineComponent("boatSpawner", () => ({
    timerMs: 3000,
    timerIntervalMs: 5000,
}));
function registerBoatSpawnerSystem(em) {
    em.addSingletonComponent(BoatSpawnerDef);
    em.registerSystem(null, [BoatSpawnerDef, PhysicsTimerDef, GroundSystemDef], (_, res) => {
        const ms = res.physicsTimer.period * res.physicsTimer.steps;
        res.boatSpawner.timerMs -= ms;
        // console.log("res.boatSpawner.timerMs:" + res.boatSpawner.timerMs);
        if (res.boatSpawner.timerMs < 0) {
            res.boatSpawner.timerMs = res.boatSpawner.timerIntervalMs;
            // ramp up difficulty
            res.boatSpawner.timerIntervalMs *= 0.95;
            // console.log("boat ");
            // create boat(s)
            const boatCon = em.addComponent(em.newEntity().id, BoatConstructDef);
            const left = Math.random() < 0.5;
            const z = res.groundSystem.nextScore + 60;
            boatCon.location = vec3.fromValues(-(Math.random() * 0.5 + 0.5) * GROUNDSIZE, -5, z);
            boatCon.speed = 0.005 + jitter(0.002);
            boatCon.wheelDir = (Math.PI / 2) * (1 + jitter(0.1));
            boatCon.wheelSpeed = jitter(0.0001);
            if (left) {
                boatCon.location[0] *= -1;
                boatCon.speed *= -1;
                boatCon.wheelDir *= -1;
            }
            // boatCon.wheelSpeed = 0;
        }
    }, "spawnBoats");
}
function createHats(em) {
    const BOX_STACK_COUNT = 10;
    for (let i = 0; i < BOX_STACK_COUNT; i++) {
        const loc = vec3.fromValues(Math.random() * -10 + 10 - 5, 0, Math.random() * -10 - 5);
        em.addComponent(em.newEntity().id, HatConstructDef, loc);
    }
}
