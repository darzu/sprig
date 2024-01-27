import { EM, Entity } from "../ecs/entity-manager.js";
import { PartyDef } from "../camera/party.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef } from "../physics/transform.js";
import { LevelMapDef } from "../levels/level-map.js";
import { LD52ShipDef } from "./ship.js";
import { tV, V, vec3, vec2 } from "../matrix/sprig-matrix.js";
import { assert, dbgLogOnce, dbgOnce } from "../utils/util.js";
import { vec2Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { Phase } from "../ecs/sys-phase.js";
import { drawBall } from "../utils/utils-game.js";
import { ENDESGA16 } from "../color/palettes.js";
import { ColliderDef } from "../physics/collider.js";
import {
  createAABB,
  getSizeFromAABB,
  mergeAABBs,
  transformAABB,
} from "../physics/aabb.js";
import { drawVector } from "../utils/util-vec-dbg.js";
import { createGraph3D } from "../debug/utils-gizmos.js";
import { DeletedDef } from "../ecs/delete.js";

const DBG_COLLISIONS = false;

const SAMPLES_PER_EDGE = 5;
const NUDGE_DIST = 1.0;
const NUDGE_SPEED = 0.1;

export const LandDef = EM.defineResource("land", () => ({
  // overwritten elsewhere
  sample: (x: number, y: number) => 0 as number,
}));

const yBasis = vec2.mk(); // TODO(@darzu): rename fwd
const xBasis = vec2.mk(); // TODO(@darzu): rename right
const xBasis3 = vec3.mk();
const pointTemp = vec2.mk();
const nudgeTemp = vec3.mk();
const scaledTemp1 = vec2.mk();
const scaledTemp2 = vec2.mk();

// TODO: import these from somewhere
const WORLD_WIDTH = 1024; // width runs +X
const WORLD_HEIGHT = 512; // height runs +Y

let __dbgLastLandGraph: Entity | undefined = undefined;

EM.addSystem(
  "landShipCollision",
  Phase.GAME_WORLD,
  [LD52ShipDef, PositionDef, WorldFrameDef, ColliderDef, LinearVelocityDef],
  [PartyDef, LandDef, LevelMapDef],
  (es, res) => {
    if (!es.length) return;
    const ship = es[0];

    // get a representative AABB
    assert(ship.collider.shape === "Multi");
    // TODO(@darzu): PERF. we should have a persistent form of this intersected AABB somewhere
    const localAABB = createAABB();
    ship.collider.children.forEach((c) => {
      assert(c.shape === "AABB");
      mergeAABBs(localAABB, localAABB, c.aabb);
    });
    transformAABB(localAABB, ship.world.transform);
    const shipSize = getSizeFromAABB(localAABB);
    vec3.scale(shipSize, 0.75, shipSize); // eh, AABB bounds were a bit too aggressive

    // +Y is forward / length-wise
    const shipWidth = shipSize[0];
    const halfWidth = shipWidth / 2;
    const shipLength = shipSize[1];
    const halfLength = shipLength / 2;
    const shipCenter = V(res.party.pos[0], res.party.pos[1]);
    //console.log(`ship at ${shipCenter[0]}, ${shipCenter[1]}`);

    // res.party.dir is fwd / +Y
    vec2.set(
      res.party.dir[0] * halfLength,
      res.party.dir[1] * halfLength,
      yBasis
    );
    const UP: vec3.InputT = [0, 0, 1];
    vec3.cross(UP, res.party.dir, xBasis3);
    vec2.set(xBasis3[0] * halfWidth, xBasis3[1] * halfWidth, xBasis);

    // corners of the ship in world-space in counter-clockwise order
    // TODO(@darzu): this seems clockwise to me?
    const cornersFromCenter: vec2[] = [
      vec2.sub(vec2.sub(vec2.zero(), yBasis), xBasis),
      vec2.sub(vec2.add(vec2.zero(), yBasis), xBasis),
      vec2.add(vec2.add(vec2.zero(), yBasis), xBasis),
      vec2.add(vec2.sub(vec2.zero(), yBasis), xBasis),
    ];
    const corners: vec2[] = cornersFromCenter.map((v) =>
      vec2.add(shipCenter, v)
    );
    //console.log(corners);

    // if (DBG_COLLISIONS) dbgLogOnce(`isLand is using ${res.levelMap.name}`);

    function isLand(x: number, y: number) {
      return (
        x < -WORLD_WIDTH / 2 ||
        x > WORLD_WIDTH / 2 ||
        y < -WORLD_HEIGHT / 2 ||
        y > WORLD_HEIGHT / 2 ||
        res.land.sample(x, y) * 100.0 > 1.0
      );
    }

    // debug corner & edge algorithm
    if (
      DBG_COLLISIONS &&
      dbgOnce(`landCollisionCorners_${res.levelMap.name}`)
    ) {
      assert(ColliderDef.isOn(ship));

      // addColliderDbgVis(ship);
      // const box = createBoxForAABB(localAABB);
      // EM.set(box, PhysicsParentDef, ship.id);
      // EM.set(box, ColorDef, ENDESGA16.darkGray);

      // TODO(@darzu): land collisions on level two right side r messed up

      // draw corners and edges of ship
      const scale = 2;
      console.log("landCollisionCorners!");
      for (let i = 0; i < corners.length; i++) {
        const localCorner = cornersFromCenter[i];
        console.log(`localCorner: ${vec2Dbg(localCorner)}`);
        // TODO(@darzu): these ball corners actually aren't quite right b/c of the nature of AABBs (not OBB)
        const ball = drawBall(
          [localCorner[0], localCorner[1], 0],
          scale,
          ENDESGA16.lightGreen
        );
        EM.set(ball, PhysicsParentDef, ship.id);

        // now check for edges
        for (let s = 1; s <= SAMPLES_PER_EDGE; s++) {
          const r = s / (SAMPLES_PER_EDGE + 1);

          const localNeighbor = cornersFromCenter[(i + 1) % 4];
          const localPoint = vec2.lerp(localCorner, localNeighbor, r);
          console.log(`localPoint: ${vec2Dbg(localPoint)}`);
          const ball = drawBall(
            [localPoint[0], localPoint[1], 0],
            scale,
            ENDESGA16.red
          );
          EM.set(ball, PhysicsParentDef, ship.id);
        }
      }

      // draw land as seen by the isLand fn
      const halfWidth = WORLD_WIDTH * 0.5;
      const halfHeight = WORLD_HEIGHT * 0.5;
      let samples: vec3[][] = [];
      for (let y = -halfHeight + 1; y < halfHeight; y += halfHeight / 20) {
        const row: vec3[] = [];
        for (let x = -halfWidth + 1; x < halfWidth; x += halfWidth / 20) {
          const z = isLand(x, y) ? 1.0 : 0.0;
          row.push(V(x, y, z));
        }
        samples.push(row);
      }

      if (__dbgLastLandGraph) {
        EM.set(__dbgLastLandGraph, DeletedDef);
      }
      const graph = createGraph3D(
        V(-halfWidth * 1, -halfHeight * 1, 0),
        samples,
        ENDESGA16.red,
        createAABB(V(-halfWidth, -halfHeight, 0), V(halfWidth, halfHeight, 1)),
        createAABB(
          V(-halfWidth * 1, -halfHeight * 1, 0),
          V(halfWidth * 1, halfHeight * 1, 20)
        )
      );
      __dbgLastLandGraph = graph;
    }

    let hitLand = false;
    // go through each corner and sample along the edge between it and its neighbor

    for (let i = 0; i < corners.length; i++) {
      //console.log(`trying face ${i} -> ${i + (1 % 4)}`);
      const corner = corners[i];

      // first, see if the corner itself is making contact
      if (isLand(corner[0], corner[1])) {
        // nudge directly away from corner
        const nudge = tV(-cornersFromCenter[i][0], -cornersFromCenter[i][1], 0);
        console.log(`nudge is ${vec3Dbg(nudge)}`);
        vec3.norm(nudge, nudge);
        vec3.scale(nudge, NUDGE_DIST, nudge);
        // TODO: this should be in world space
        if (DBG_COLLISIONS)
          drawVector(nudge, {
            origin: tV(corner[0], corner[1], ship.position[2]),
            scale: 30,
            color: ENDESGA16.lightGreen,
          });
        console.log(`nudging (corner) by ${vec3Dbg(nudge)}`);
        vec3.add(ship.position, nudge, ship.position);
        vec3.norm(nudge, nudge);
        vec3.scale(nudge, NUDGE_SPEED, nudge);
        vec3.add(ship.linearVelocity, nudge, ship.linearVelocity);
        hitLand = true;
        break;
      }
      // now check for edges
      const neighbor = corners[(i + 1) % 4];
      for (let s = 1; s <= SAMPLES_PER_EDGE; s++) {
        const r = s / (SAMPLES_PER_EDGE + 1);
        // TODO(@darzu): replace with lerp?
        const point = vec2.lerp(corner, neighbor, r, pointTemp);
        // const point = vec2.add(
        //   vec2.scale(corner, 1 - r, scaledTemp1),
        //   vec2.scale(neighbor, r, scaledTemp2),
        //   pointTemp
        // );
        //console.log(point);

        if (isLand(point[0], point[1])) {
          //console.log(`touching land at face ${i}`);
          const dist = vec2.sub(neighbor, corner, pointTemp);
          const nudge = vec3.cross(
            UP,
            vec3.set(dist[0], dist[1], 0, nudgeTemp),
            nudgeTemp
          );
          vec3.norm(nudge, nudge);
          vec3.scale(nudge, NUDGE_DIST, nudge);
          if (DBG_COLLISIONS)
            drawVector(nudge, {
              origin: tV(corner[0], corner[1], ship.position[2]),
              scale: 30,
              color: ENDESGA16.red,
            });
          console.log(`nudging (edge '${s}) by ${vec3Dbg(nudge)}`);
          // TODO: this should be in world space
          vec3.add(ship.position, nudge, ship.position);
          vec3.scale(nudge, NUDGE_SPEED, nudge);
          vec3.add(ship.linearVelocity, nudge, ship.linearVelocity);
          hitLand = true;
          break;
        }
      }
      if (hitLand) break;
    }
    if (hitLand) {
      // TODO: take ship damage
    }

    //    console.log(corners);

    // const winYi =
    //   ((worldAABB.min[0] + res.land.worldHeight * 0.5) / res.land.worldHeight) *
    //   res.land.texReader.size[0];
    // const winXi =
    //   ((worldAABB.min[2] + res.land.worldWidth * 0.5) / res.land.worldWidth) *
    //   res.land.texReader.size[1];
    // // NOTE: width is based on world Z and tex X
    // //       height is based on world X and tex Y
    // const winWi = Math.ceil(worldAABB.max[2] - worldAABB.min[2]);
    // const winHi = Math.ceil(worldAABB.max[0] - worldAABB.min[0]);

    // if (
    //   winXi < 0 ||
    //   res.land.texReader.size[0] <= winXi + winWi ||
    //   winYi < 0 ||
    //   res.land.texReader.size[1] <= winYi + winHi
    // ) {
    //   console.log("off the map");
    //   return;
    // }
    // const shipW = selfAABB.max[2] - selfAABB.min[2];
    // const shipH = selfAABB.max[0] - selfAABB.min[0];

    // for (let xi = winXi; xi < winXi + winWi; xi++) {
    //   for (let yi = winYi; yi < winYi + winHi; yi++) {
    //     const z =
    //       xi * res.land.worldUnitPerTerraVerts - res.land.worldHeight * 0.5;
    //     const x =
    //       yi * res.land.worldUnitPerTerraVerts - res.land.worldWidth * 0.5;

    //     // NOTE: PERF! we inlined all the dot products and cross products here for a
    //     //  perf win.
    //     // TODO(@darzu): make it easier to do this inlining automatically?
    //     // let toParty = vec3.sub(V(x, 0, z), res.party.pos);
    //     // let zDist = vec3.dot(toParty, res.party.dir);
    //     // let partyX = vec3.cross(res.party.dir, V(0, 1, 0));
    //     // let xDist = vec3.dot(toParty, partyX);
    //     const toPartyX = x - res.party.pos[0];
    //     const toPartyZ = z - res.party.pos[2];
    //     const dirX = res.party.dir[0];
    //     const dirZ = res.party.dir[2];
    //     const zDist = toPartyX * dirX + toPartyZ * dirZ;
    //     const xDist = toPartyX * -dirZ + toPartyZ * dirX;
    //     console.log(`zDist: ${zDist}, xDist: ${xDist}`);

    //     if (Math.abs(zDist) < shipW * 0.5 && Math.abs(xDist) < shipH * 0.5) {
    //       const idx = xi + yi * res.land.worldWidth;

    //       const color = res.levelMap.land[idx];
    //       console.log(color);
    //     }
    //   }
    // }
  }
);
