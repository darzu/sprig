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
  hexesWithin,
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
import {
  AnimateToDef,
  EASE_INBACK,
  EASE_INQUAD,
  EASE_INVERSE,
  EASE_LINEAR,
  EASE_OUTBACK,
  EASE_OUTQUAD,
} from "../animate-to.js";
import { tempVec } from "../temp-pool.js";
import { AngularVelocityDef } from "../physics/motion.js";

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

const REVEAL_DIST = 2;
const FALLOUT_DIST = 4;
const TILE_FALL_DIST = 100;

export type GroundProps = Component<typeof GroundPropsDef>;

interface PathNode {
  q: number;
  r: number;
  width: number;
  dirIdx: number;
  state: "ahead" | "inplay" | "behind";
}

type GroundTile = EntityW<[typeof GroundPropsDef]>;
type GroundTileInited = EntityW<
  [typeof GroundPropsDef, typeof PositionDef, typeof ColorDef]
>;

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    grid: createHexGrid<GroundTile>(),
    path: [] as PathNode[],
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

  const n: PathNode = {
    q: lastNode.q + dq,
    r: lastNode.r + dr,
    width,
    dirIdx,
    state: "ahead",
  };
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

      sys.path[0] = {
        q: 0,
        r: 0,
        dirIdx: 0,
        width: RIVER_WIDTH,
        state: "inplay",
      };

      raiseNodeTiles(sys, sys.path[0], 0, 0);

      for (let i = 0; i < 10; i++) {
        const n = continuePath(sys.path);
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
    y - TILE_FALL_DIST,
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
  n: { q: number; r: number; width: number },
  easeDelayMs: number,
  easeMsPer: number
): Entity[] {
  let nextEaseDelayMs = easeDelayMs;
  const w = Math.floor(n.width / 2);
  let newTiles: Entity[] = [];
  for (let [q, r] of hexesWithin(n.q, n.r, w)) {
    if (!sys.grid.has(q, r)) {
      const color: vec3 = [
        0.03 + jitter(0.01),
        0.03 + jitter(0.01),
        0.2 + jitter(0.02),
      ];
      const t = raiseTile(sys, q, r, color, nextEaseDelayMs, easeMsPer);
      nextEaseDelayMs += easeMsPer * 0.5;
      newTiles.push(t);
    }
  }
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
        easeFn: EASE_INQUAD,
      });
      nextEaseDelayMs += easeMsPer * 0.5;

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

      // where is our ship?
      const ship = em.filterEntities([ShipLocalDef, PositionDef])[0];
      if (!ship) return;
      const [shipQ, shipR] = xzToHex(ship.position[0], ship.position[2], SIZE);

      // have we changed tiles?
      if (shipQ === lastShipQ && shipR === lastShipR) return;

      const sys = res.groundSystem;

      // check for tiles to reveal
      {
        const pathToReveal = sys.path.filter(
          (n) =>
            n.state === "ahead" &&
            hexDist(n.q, n.r, shipQ, shipR) <= REVEAL_DIST
        );
        let easeStart = 0;
        const easeMs = 500;
        for (let n of pathToReveal) {
          n.state = "inplay";
          const ts = raiseNodeTiles(sys, n, easeStart, easeMs);
          easeStart += ts.length * easeMs * 0.5;
        }
      }

      // check for tiles to drop
      const pathOutOfRangeIdx = sys.path.findIndex(
        (n) =>
          n.state === "inplay" &&
          hexDist(n.q, n.r, shipQ, shipR) >= FALLOUT_DIST
      );
      if (pathOutOfRangeIdx >= 0) {
        let easeStart = 0;
        const easeMs = 500;
        for (let i = 0; i <= pathOutOfRangeIdx; i++) {
          const n = sys.path[i];
          n.state = "behind";
          const ts = dropNodeTiles(sys, n, easeStart, easeMs);
          easeStart += ts.length * easeMs * 0.5;
        }
      }

      // check if we need to extend the path
      const numAhead = sys.path.filter((n) => n.state === "ahead").length;
      if (numAhead < 3) for (let i = 0; i < 10; i++) continuePath(sys.path);

      // TODO(@darzu): drop old path nodes?

      lastShipQ = shipQ;
      lastShipR = shipR;
    },
    "groundSystem"
  );
}
