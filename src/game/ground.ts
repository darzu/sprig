import { ColliderDef } from "../physics/collider.js";
import {
  Component,
  EM,
  Entity,
  EntityManager,
  EntityW,
} from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ScoreDef } from "./game.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { Serializer, Deserializer } from "../serialize.js";
import { FinishedDef } from "../build.js";
import {
  Assets,
  AssetsDef,
  DARK_BLUE,
  GameMesh,
  gameMeshFromMesh,
  LIGHT_BLUE,
} from "./assets.js";
import {
  cloneMesh,
  getAABBFromMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
} from "../render/mesh-pool.js";
import { defineNetEntityHelper } from "../em_helpers.js";
import { assert } from "../test.js";
import { ColorDef } from "../color.js";
import { RendererDef } from "../render/render_init.js";
import {
  createHexGrid,
  hexDist,
  hexX,
  hexZ,
  HEX_DIRS,
  xzToHex,
} from "../hex.js";
import { chance, jitter } from "../math.js";
import { LocalPlayerDef } from "./player.js";
import { CameraFollowDef } from "../camera.js";
import { ShipLocalDef } from "./ship.js";
import { onInit } from "../init.js";
import { PhysicsTimerDef } from "../time.js";
import { AnimateToDef, EASE_OUTBACK, EASE_OUTQUAD } from "../animate-to.js";

/*
NOTES:
  https://www.redblobgames.com/grids/hexagons/
  https://www.redblobgames.com/grids/hexagons/implementation.html
  http://www-cs-students.stanford.edu/~amitp/gameprog.html#hex
*/

const SIZE = 48;
export const WIDTH = SIZE * 2;
const HEIGHT = Math.sqrt(3) * SIZE;
const DEPTH = SIZE / 4;

const Y = -DEPTH - 7;

const X_SPC = (WIDTH * 3) / 4;
const Z_SPC = HEIGHT;

// const RIVER_TURN_FACTOR = 0.0;
const RIVER_TURN_FACTOR = 0.0;

export type GroundProps = Component<typeof GroundPropsDef>;

interface PathNode {
  q: number;
  r: number;
  width: number;
  dirIdx: number;
}

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    grid: createHexGrid<EntityW<[typeof GroundPropsDef]>>(),
    path: [] as PathNode[],
  };
});
export type GroundSystem = Component<typeof GroundSystemDef>;

export const GroundMeshDef = EM.defineComponent("groundMesh", () => {
  return {
    mesh: undefined as any as GameMesh,
  };
});

export const { GroundPropsDef, GroundLocalDef, createGround } =
  defineNetEntityHelper(EM, {
    name: "ground",
    defaultProps: (location?: vec3, color?: vec3) => ({
      location: location ?? vec3.fromValues(0, 0, 0),
      color: color ?? vec3.fromValues(0, 0, 0),
    }),
    serializeProps: (o, buf) => {
      buf.writeVec3(o.location);
      buf.writeVec3(o.color);
    },
    deserializeProps: (o, buf) => {
      buf.readVec3(o.location);
      buf.readVec3(o.color);
    },
    defaultLocal: () => true,
    dynamicComponents: [PositionDef],
    buildResources: [MeDef, GroundMeshDef],
    build: (g, res) => {
      const em: EntityManager = EM;
      // TODO(@darzu): change position via events?
      vec3.copy(g.position, g.groundProps.location);
      em.ensureComponentOn(g, ColorDef, g.groundProps.color);
      em.ensureComponentOn(
        g,
        RenderableConstructDef,
        res.groundMesh.mesh.proto
      );
      // TODO(@darzu): instead of individual colliders, I should have big, shared AABB colliders
      em.ensureComponentOn(
        g,
        ColliderDef,
        res.groundMesh.mesh.aabbCollider(true)
      );
      g.collider.targetLayers = []; // don't seek collision with anything
    },
  });

const RIVER_WIDTH = 3;

function continuePath(path: PathNode[]): PathNode {
  assert(path.length >= 1, "assumes non-empty path");
  const lastNode = path[path.length - 1];

  // change directions?
  let dirIdx = lastNode.dirIdx;
  let lastTurn = path.reduce(
    (p, n, i) => (path[i].dirIdx !== dirIdx ? i : p),
    0
  );
  let lastTurnDist = path.length - lastTurn;
  let cwOrccw = chance(0.5) ? +1 : -1;
  if (chance(RIVER_TURN_FACTOR * lastTurnDist))
    dirIdx = (dirIdx + HEX_DIRS.length + cwOrccw) % HEX_DIRS.length;
  if (dirIdx === 2 || dirIdx === 3 || dirIdx === 4) {
    // dont allow going south to prevent river crossing itself
    // TODO(@darzu): is there some other way we can disallow this while still
    //    having interesting bends in the river? In RL this can't happen b/c of
    //    elevation.
    cwOrccw = -cwOrccw;
    dirIdx = (dirIdx + HEX_DIRS.length + cwOrccw * 2) % HEX_DIRS.length;
  }
  let { q: dq, r: dr } = HEX_DIRS[dirIdx];

  // change width?
  let width = lastNode.width;

  const n = { q: lastNode.q + dq, r: lastNode.r + dr, width, dirIdx };
  path.push(n);
  return n;
}

export function initGroundSystem(em: EntityManager) {
  em.registerOneShotSystem(
    null,
    [ScoreDef, MeDef, AssetsDef, RendererDef],
    (_, rs) => {
      const sys = em.addSingletonComponent(GroundSystemDef);
      const mesh = em.addSingletonComponent(GroundMeshDef);

      // DEBUG CAMERA
      {
        const e = em.findEntity(em.getResource(LocalPlayerDef)!.playerId, [
          CameraFollowDef,
          PositionDef,
          RotationDef,
        ])!;
        // vec3.copy(e.position, [54.72, 2100.0, 33.17]);
        // quat.copy(e.rotation, [0.0, 1.0, 0.0, 0.02]);
        // vec3.copy(e.cameraFollow.positionOffset, [2.0, 2.0, 8.0]);
        // e.cameraFollow.yawOffset = 0.0;
        // e.cameraFollow.pitchOffset = -1.042;
      }

      // create mesh
      const t = mat4.fromScaling(mat4.create(), [
        WIDTH * 0.5,
        DEPTH,
        WIDTH * 0.5,
      ]);
      const m = transformMesh(rs.assets.hex.mesh, t);
      const gm = gameMeshFromMesh(m, rs.renderer.renderer);
      mesh.mesh = gm;

      // init ground system
      assert(sys.grid._grid.size === 0);

      // createTile(0, -2, [0.1, 0.2, 0.1]);
      // createTile(2, -2, [0.2, 0.1, 0.1]);
      // createTile(-2, 0, [0.1, 0.1, 0.2]);
      // createTile(0, 0, [0.1, 0.1, 0.1]);

      sys.path[0] = {
        q: 0,
        r: 0,
        dirIdx: 0,
        width: RIVER_WIDTH,
      };

      fillNode(sys, sys.path[0], 0, 0);

      for (let i = 0; i < 50; i++) {
        const n = continuePath(sys.path);
      }
    }
  );
}

function createTile(
  sys: GroundSystem,
  q: number,
  r: number,
  color: vec3,
  easeDelayMs: number,
  easeMs: number
) {
  console.log(`created!`);
  const g = EM.newEntity();
  // TODO(@darzu): waves?
  // const y = Y + jitter(0.5);
  const y = Y;
  const startPos: vec3 = [hexX(q, r, SIZE), y - 100, hexZ(q, r, SIZE)];
  const endPos: vec3 = [hexX(q, r, SIZE), y, hexZ(q, r, SIZE)];
  EM.ensureComponentOn(g, GroundPropsDef, startPos, color);
  EM.ensureComponentOn(g, AnimateToDef, {
    startPos,
    endPos,
    progressMs: -easeDelayMs,
    durationMs: easeMs,
    easeFn: EASE_OUTBACK,
  });
  sys.grid.set(q, r, g);
  return g;
}

function fillNode(
  sys: GroundSystem,
  n: PathNode,
  easeDelayMs: number,
  easeMsPer: number
): Entity[] {
  let nextEaseDelayMs = easeDelayMs;
  const w = Math.floor(n.width / 2);
  let newTiles: Entity[] = [];
  for (let q = -w; q <= w; q++) {
    for (let r = -w; r <= w; r++) {
      for (let s = -w; s <= w; s++) {
        if (q + r + s === 0) {
          if (!sys.grid.has(q + n.q, r + n.r)) {
            const color: vec3 = [
              0.03 + jitter(0.01),
              0.03 + jitter(0.01),
              0.2 + jitter(0.02),
            ];
            const t = createTile(
              sys,
              q + n.q,
              r + n.r,
              color,
              nextEaseDelayMs,
              easeMsPer
            );
            nextEaseDelayMs += easeMsPer * 0.5;
            newTiles.push(t);
          }
        }
      }
    }
  }
  return newTiles;
}

const REVEAL_DIST = 3;

export function registerGroundSystems(em: EntityManager) {
  let lastShipQ = NaN;
  let lastShipR = NaN;
  em.registerSystem(
    null,
    [GroundSystemDef, ScoreDef, MeDef],
    (_, res) => {
      if (!res.me.host) return;

      const ship = em.filterEntities([ShipLocalDef, PositionDef])[0];
      if (!ship) return;

      const sys = res.groundSystem;

      const [shipQ, shipR] = xzToHex(ship.position[0], ship.position[2], SIZE);

      // haven't changed tiles
      if (shipQ === lastShipQ && shipR === lastShipR) return;

      // // highlight current tile
      // const curr = sys.grid.get(shipQ, shipR);
      // if (curr) {
      //   if (!ColorDef.isOn(curr)) return; // not initialized yet
      //   curr.color[1] = 0.2;
      // }
      // // de-highlight last tile
      // const last = sys.grid.get(lastShipQ, lastShipR);
      // if (last) {
      //   assert(ColorDef.isOn(last));
      //   last.color[0] *= 0.1;
      //   last.color[1] *= 0.1;
      //   last.color[2] *= 0.1;
      // }

      const pathInRange = sys.path.filter(
        (n) => hexDist(n.q, n.r, shipQ, shipR) < REVEAL_DIST
      );
      let easeStart = 0;
      const easeMs = 500;
      for (let n of pathInRange) {
        const ts = fillNode(sys, n, easeStart, easeMs);
        easeStart += ts.length * easeMs * 0.5;
      }

      lastShipQ = shipQ;
      lastShipR = shipR;

      // for (let n of sys.path) {
      //   if (hexDist(n.q, n.r,
      // }

      // if (
      //   sys.groundPool.length === 0 ||
      //   sys.groundPool.some((id) => !em.findEntity(id, [GroundLocalDef]))
      // )
      //   // not inited
      //   return;

      // // initial placement
      // if (sys.initialPlace) {
      //   sys.initialPlace = false;
      //   sys.nextScore = sys.initialScore;
      //   sys.totalPlaced = 0;
      //   sys.nextGroundIdx = 0;

      //   for (let x = 0; x < NUM_X; x++) {
      //     for (let z = 0; z < NUM_Z; z++) {
      //       placeNextGround();
      //     }
      //   }
      // } else {
      //   // ship progress
      //   const score = res.score.currentScore;
      //   while (score > sys.nextScore) {
      //     placeNextGround();
      //     sys.nextScore += THIRDSIZE / 10;
      //   }
      // }

      // function placeNextGround() {
      //   // move ground
      //   const gId = sys.groundPool[sys.nextGroundIdx];
      //   const g = em.findEntity(gId, [GroundLocalDef, PositionDef]);
      //   if (g) {
      //     vec3.copy(g.position, calcLoc(sys.totalPlaced));

      //     sys.nextGroundIdx = (sys.nextGroundIdx + 1) % sys.groundPool.length;
      //     sys.totalPlaced += 1;
      //   }
      // }
    },
    "groundSystem"
  );

  // function calcLoc(num: number): vec3 {
  //   const x = num % NUM_X;
  //   const z = Math.floor(num / NUM_X);
  //   return [(x - 1) * WIDTH, -7, z * WIDTH];
  // }
}
