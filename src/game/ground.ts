import { ColliderDef } from "../physics/collider.js";
import {
  Component,
  EM,
  Entity,
  EntityManager,
  EntityW,
} from "../entity-manager.js";
import { mat4, quat, vec2, vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ScoreDef } from "./game.js";
import { MeDef } from "../net/components.js";
import { AssetsDef, GameMesh, gameMeshFromMesh } from "./assets.js";
import { transformMesh } from "../render/mesh-pool.js";
import { defineNetEntityHelper } from "../em_helpers.js";
import { assert } from "../test.js";
import { ColorDef } from "../color.js";
import { RendererDef } from "../render/render_init.js";
import {
  createHexGrid,
  hexDist,
  hexesWithin,
  hexX,
  hexZ,
  HEX_DIRS,
  HEX_LEFT,
  HEX_RIGHT,
  xzToHex,
} from "../hex.js";
import { chance, jitter } from "../math.js";
import { LocalPlayerDef } from "./player.js";
import { CameraFollowDef } from "../camera.js";
import { ShipLocalDef } from "./ship.js";
import { AnimateToDef, EASE_INCUBE, EASE_OUTBACK } from "../animate-to.js";
import { AngularVelocityDef } from "../physics/motion.js";

/*
NOTES:
  https://www.redblobgames.com/grids/hexagons/
  https://www.redblobgames.com/grids/hexagons/implementation.html
  http://www-cs-students.stanford.edu/~amitp/gameprog.html#hex
*/

const SIZE = 48;
const WIDTH = SIZE * 2;
const HEIGHT = Math.sqrt(3) * SIZE;
const DEPTH = SIZE / 4;

const Y = -DEPTH - 7;

const RIVER_TURN_FACTOR = 0.2;
// const RIVER_TURN_FACTOR = 0.0;

const REVEAL_DIST = 2;
const FALLOUT_DIST = 4;
const TILE_SPAWN_DIST = 100;
const TILE_FALL_DIST = 200;

export type GroundProps = Component<typeof GroundPropsDef>;

interface PathNode {
  q: number;
  r: number;
  width: number;
  dirIdx: number;
  state: "ahead" | "inplay" | "behind";
  next: PathNode | undefined;
  prev: PathNode | undefined;
}

type GroundTile = EntityW<[typeof GroundPropsDef]>;
type GroundTileInited = EntityW<
  [typeof GroundPropsDef, typeof PositionDef, typeof ColorDef]
>;

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    grid: createHexGrid<GroundTile>(),
    currentPath: undefined as PathNode | undefined,
    objFreePool: [] as GroundTileInited[],
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

function continuePath(path: PathNode): PathNode {
  // walk to the end
  if (path.next) return continuePath(path.next);

  // how far back did we last turn?
  let dirIdx = path.dirIdx;
  let lastTurnDist = 0;
  let lastTurn: PathNode | undefined = path;
  while (lastTurn && lastTurn.dirIdx === path.dirIdx) {
    lastTurn = lastTurn.prev;
    lastTurnDist++;
  }

  // should we turn?
  let cwOrccw = chance(0.5) ? +1 : -1;
  if (chance(RIVER_TURN_FACTOR * lastTurnDist))
    dirIdx = (dirIdx + HEX_DIRS.length + cwOrccw) % HEX_DIRS.length;

  // dont allow going south to prevent river crossing itself
  if (dirIdx === 2 || dirIdx === 3 || dirIdx === 4) {
    // TODO(@darzu): is there some other way we can disallow this while still
    //    having interesting bends in the river? In RL this can't happen b/c of
    //    elevation.
    cwOrccw = -cwOrccw;
    dirIdx = (dirIdx + HEX_DIRS.length + cwOrccw * 2) % HEX_DIRS.length;
  }
  let [dq, dr] = HEX_DIRS[dirIdx];

  // change width?
  let width = path.width;

  const n: PathNode = {
    q: path.q + dq,
    r: path.r + dr,
    width,
    dirIdx,
    state: "ahead",
    prev: path,
    next: undefined,
  };
  path.next = n;

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
        // high up
        // vec3.copy(e.position, [54.72, 2100.0, 33.17]);
        // quat.copy(e.rotation, [0.0, 1.0, 0.0, 0.02]);
        // vec3.copy(e.cameraFollow.positionOffset, [2.0, 2.0, 8.0]);
        // e.cameraFollow.yawOffset = 0.0;
        // e.cameraFollow.pitchOffset = -1.042;

        // watching from afar side
        // vec3.copy(e.position, [-495.02,241.17,-35.16]);
        // quat.copy(e.rotation, [0.00,0.70,0.00,-0.72]);
        // vec3.copy(e.cameraFollow.positionOffset, [2.00,2.00,8.00]);
        // e.cameraFollow.yawOffset = 0.000;
        // e.cameraFollow.pitchOffset = -0.655;
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

      sys.currentPath = {
        q: 0,
        r: 0,
        dirIdx: 0,
        width: RIVER_WIDTH,
        state: "inplay",
        prev: undefined,
        next: undefined,
      };

      raiseNodeTiles(sys, sys.currentPath, 0, 0);

      let lastPath = sys.currentPath;
      for (let i = 0; i < 10; i++) {
        lastPath = continuePath(lastPath);
      }
    }
  );
}

function raiseTile(
  sys: GroundSystem,
  q: number,
  r: number,
  color: vec3,
  easeDelayMs: number,
  easeMs: number
) {
  const y = Y;
  const startPos: vec3 = [
    hexX(q, r, SIZE),
    y - TILE_SPAWN_DIST,
    hexZ(q, r, SIZE),
  ];
  const endPos: vec3 = [hexX(q, r, SIZE), y, hexZ(q, r, SIZE)];

  let g: GroundTile;
  if (sys.objFreePool.length > RIVER_WIDTH * 2) {
    let oldG = sys.objFreePool.pop()!;
    vec3.copy(oldG.position, startPos);
    vec3.copy(oldG.color, color);
    if (RotationDef.isOn(oldG)) quat.identity(oldG.rotation);
    if (AngularVelocityDef.isOn(oldG)) vec3.zero(oldG.angularVelocity);
    g = oldG;
  } else {
    let newG = EM.newEntity();
    EM.ensureComponentOn(newG, GroundPropsDef, startPos, color);
    g = newG;
  }
  // NOTE: animateTo will only be on the host but that's fine, the host owns all
  //    these anyway
  // TODO(@darzu): we might want to animate on clients b/c it'd be smoother
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

function raiseNodeTiles(
  sys: GroundSystem,
  n: PathNode,
  easeDelayMs: number,
  easeMsPer: number
): Entity[] {
  let nextEaseDelayMs = easeDelayMs;
  const w = Math.floor(n.width / 2);
  let newTiles: Entity[] = [];

  const forward = vec2.add(vec2.create(), [n.q, n.r], HEX_DIRS[n.dirIdx]);
  const left = vec2.add(
    vec2.create(),
    [n.q, n.r],
    HEX_DIRS[HEX_LEFT(n.dirIdx)]
  );
  const right = vec2.add(
    vec2.create(),
    [n.q, n.r],
    HEX_DIRS[HEX_RIGHT(n.dirIdx)]
  );

  for (let qr of hexesWithin(n.q, n.r, w)) {
    const [q, r] = qr;
    if (!sys.grid.has(q, r)) {
      // TODO(@darzu): DEBUG left/right/forward tiles
      const color: vec3 = [
        vec2.exactEquals(qr, left) ? 0.2 : 0.1,
        vec2.exactEquals(qr, right) ? 0.2 : 0.1,
        vec2.exactEquals(qr, forward) ? 0.2 : 0.1,
      ];
      // const color: vec3 = [
      //   0.03 + jitter(0.01),
      //   0.03 + jitter(0.01),
      //   0.2 + jitter(0.02),
      // ];
      const t = raiseTile(sys, q, r, color, nextEaseDelayMs, easeMsPer);
      nextEaseDelayMs += easeMsPer * 0.5;
      newTiles.push(t);
    }
  }

  // TODO(@darzu): spawn enemies on these new tiles. Would like to know:
  //    left or right of river
  // paint NeedsSpawn and have a SpawnSystem elsewhere

  return newTiles;
}

function dropNodeTiles(
  sys: GroundSystem,
  n: { q: number; r: number; width: number },
  easeDelayMs: number,
  easeMsPer: number
): Entity[] {
  let nextEaseDelayMs = easeDelayMs;
  const w = Math.floor(n.width / 2);
  let droppedTiles: Entity[] = [];
  for (let [q, r] of hexesWithin(n.q, n.r, w)) {
    const g = sys.grid.get(q, r);
    if (g && PositionDef.isOn(g) && ColorDef.isOn(g)) {
      console.log(
        `dropping ${q},${r} in ${nextEaseDelayMs}ms for ${easeMsPer}`
      );
      const startPos = vec3.clone(g.position);
      const endPos = vec3.add(vec3.create(), startPos, [0, -TILE_FALL_DIST, 0]);
      assert(
        !AnimateToDef.isOn(g),
        "Oops, we can't animate the tile out when it's already being animated."
      );
      EM.ensureComponentOn(g, AnimateToDef, {
        startPos,
        endPos,
        progressMs: -nextEaseDelayMs,
        durationMs: easeMsPer,
        easeFn: EASE_INCUBE,
      });
      // nextEaseDelayMs += easeMsPer * 0.5;

      // some random spin
      EM.ensureComponentOn(g, RotationDef);
      EM.ensureComponentOn(g, AngularVelocityDef);
      const spin = g.angularVelocity;
      vec3.copy(spin, [
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ]);
      vec3.normalize(spin, spin);
      vec3.scale(spin, spin, 0.001);

      sys.objFreePool.unshift(g);
      sys.grid.delete(q, r);
      droppedTiles.push(g);
    }
  }
  return droppedTiles;
}

export function registerGroundSystems(em: EntityManager) {
  let lastShipQ = NaN;
  let lastShipR = NaN;
  em.registerSystem(
    null,
    [GroundSystemDef, ScoreDef, MeDef],
    (_, res) => {
      // host only
      if (!res.me.host) return;

      // is our path inited?
      const sys = res.groundSystem;
      if (!sys.currentPath) return;

      // where is our ship?
      const ship = em.filterEntities([ShipLocalDef, PositionDef])[0];
      if (!ship) return;
      const [shipQ, shipR] = xzToHex(ship.position[0], ship.position[2], SIZE);

      // have we changed tiles?
      if (shipQ === lastShipQ && shipR === lastShipR) return;

      // check for tiles to reveal
      {
        const firstAheadFn: (p?: PathNode) => PathNode | undefined = (p) =>
          !p || p.state === "ahead" ? p : firstAheadFn(p?.next);
        let ahead = firstAheadFn(sys.currentPath);
        let easeStart = 0;
        const easeMs = 500;
        while (
          ahead &&
          hexDist(ahead.q, ahead.r, shipQ, shipR) <= REVEAL_DIST
        ) {
          ahead.state = "inplay";
          const ts = raiseNodeTiles(sys, ahead, easeStart, easeMs);
          easeStart += ts.length * easeMs * 0.5;

          // advance out path pointer
          sys.currentPath = ahead;

          ahead = firstAheadFn(ahead.next);
        }
      }

      // check for tiles to drop
      let numDropped = 0;
      {
        assert(
          sys.currentPath.state === "inplay",
          "The current path should always be inplay"
        );
        const lastInPlayFn: (p: PathNode) => PathNode | undefined = (p) =>
          p.prev && p.prev.state === "inplay"
            ? lastInPlayFn(p.prev)
            : p.state === "inplay"
            ? p
            : undefined;
        let behind = lastInPlayFn(sys.currentPath);
        let easeStart = 0;
        const easeMs = 1000;
        while (
          behind &&
          behind !== sys.currentPath &&
          hexDist(behind.q, behind.r, shipQ, shipR) >= FALLOUT_DIST
        ) {
          behind.state = "behind";
          const ts = dropNodeTiles(sys, behind, easeStart, easeMs);
          // easeStart += ts.length * easeMs * 0.25;
          behind = lastInPlayFn(behind);
          numDropped++;
        }
      }

      // check if we need to extend the path
      for (let i = 0; i < numDropped; i++) {
        continuePath(sys.currentPath);
      }

      // TODO(@darzu): drop old path nodes?

      lastShipQ = shipQ;
      lastShipR = shipR;
    },
    "groundSystem"
  );
}
