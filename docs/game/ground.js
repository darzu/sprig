import { ColliderDef } from "../physics/collider.js";
import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef } from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, MeDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { AssetsDef, DARK_BLUE, LIGHT_BLUE } from "./assets.js";
import { cloneMesh, getAABBFromMesh, scaleMesh3, } from "../render/mesh-pool.js";
import { ShipDef } from "./ship.js";
export const GROUNDSIZE = 48;
const HALFSIZE = GROUNDSIZE / 2;
const SIZE = HALFSIZE * 2;
const THIRDSIZE = SIZE / 3;
export const GroundConstructDef = EM.defineComponent("groundConstruct", (location, color) => ({
    location: location !== null && location !== void 0 ? location : vec3.fromValues(0, 0, 0),
    color: color !== null && color !== void 0 ? color : vec3.fromValues(0, 0, 0),
}));
export const GroundDef = EM.defineComponent("ground", () => { });
EM.registerSerializerPair(GroundConstructDef, (groundConstruct, buf) => {
    buf.writeVec3(groundConstruct.location);
    buf.writeVec3(groundConstruct.color);
}, (groundConstruct, buf) => {
    buf.readVec3(groundConstruct.location);
    buf.readVec3(groundConstruct.color);
});
export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
    return {
        groundPool: [],
        nextScore: THIRDSIZE * 2,
        nextGroundIdx: 0,
    };
});
export function registerGroundSystems(em) {
    em.addSingletonComponent(GroundSystemDef);
    const NUM_X = 3;
    const NUM_Z = 4;
    let totalPlaced = 0;
    em.registerSystem([ShipDef, PositionDef], [GroundSystemDef], (ships, { groundSystem: sys }) => {
        // init ground system
        if (sys.groundPool.length === 0) {
            let idx = 0;
            for (let x = 0; x < NUM_X; x++) {
                for (let z = 0; z < NUM_Z; z++) {
                    const loc = calcLoc(totalPlaced);
                    const color = (x + z) % 2 === 0 ? LIGHT_BLUE : DARK_BLUE;
                    const g = em.newEntity();
                    em.ensureComponentOn(g, GroundConstructDef, loc, color);
                    sys.groundPool.push(g.id);
                    totalPlaced += 1;
                }
            }
        }
        // ship progress
        if (ships.length) {
            const ship = ships.reduce((p, n) => (n.position[2] > p.position[2] ? n : p), ships[0]);
            const score = ship.position[2];
            if (score > sys.nextScore) {
                // move ground
                const gId = sys.groundPool[sys.nextGroundIdx];
                const g = em.findEntity(gId, [GroundDef, PositionDef]);
                if (g) {
                    vec3.copy(g.position, calcLoc(totalPlaced));
                    sys.nextGroundIdx = (sys.nextGroundIdx + 1) % sys.groundPool.length;
                    totalPlaced += 1;
                    sys.nextScore += THIRDSIZE;
                }
            }
        }
    }, "groundSystem");
    function calcLoc(num) {
        const x = num % NUM_X;
        const z = Math.floor(num / NUM_X);
        return [(x - 1) * SIZE, -7, z * SIZE];
    }
    em.registerSystem([GroundConstructDef], [MeDef, AssetsDef], (ground, res) => {
        for (let g of ground) {
            if (FinishedDef.isOn(g))
                continue;
            em.ensureComponent(g.id, PositionDef, g.groundConstruct.location);
            // TODO(@darzu): rotation for debugging
            // if (!RotationDef.isOn(plane)) {
            //   // const r =
            //   //   Math.random() > 0.5
            //   //     ? quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5)
            //   //     : quat.create();
            //   const r = quat.fromEuler(quat.create(), 0, 0, Math.PI * Math.random());
            //   em.ensureComponent(plane.id, RotationDef, r);
            // }
            em.ensureComponent(g.id, ColorDef, g.groundConstruct.color);
            let m = cloneMesh(res.assets.cube.mesh);
            m = scaleMesh3(m, [HALFSIZE, 1, HALFSIZE]);
            em.ensureComponent(g.id, RenderableConstructDef, m);
            const aabb = getAABBFromMesh(m);
            em.ensureComponent(g.id, ColliderDef, {
                shape: "AABB",
                solid: true,
                aabb,
            });
            em.ensureComponent(g.id, AuthorityDef, res.me.pid);
            em.ensureComponent(g.id, SyncDef, [GroundConstructDef.id], [PositionDef.id]);
            em.ensureComponentOn(g, GroundDef);
            em.ensureComponent(g.id, FinishedDef);
        }
    }, "buildGround");
}
