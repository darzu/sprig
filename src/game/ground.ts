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
import { transformMesh } from "../render/mesh.js";
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
  hexDirCCW90,
  hexDirCW90,
  hexLeft,
  hexXYZ,
} from "../hex.js";
import { chance, jitter } from "../math.js";
import { LocalPlayerDef } from "./player.js";
import { CameraFollowDef } from "../camera.js";
import { ShipLocalDef } from "./ship.js";
import { AnimateToDef, EASE_INCUBE, EASE_OUTBACK } from "../animate-to.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { addSpawner, SpawnerDef } from "./spawn.js";
import { drawLine } from "../utils-game.js";
import { tempVec } from "../temp-pool.js";
import { eventWizard } from "../net/events.js";
import { vec3Dbg } from "../utils-3d.js";
import { GameState, GameStateDef } from "./gamestate.js";

/*
NOTES:
  https://www.redblobgames.com/grids/hexagons/
  https://www.redblobgames.com/grids/hexagons/implementation.html
  http://www-cs-students.stanford.edu/~amitp/gameprog.html#hex
*/

const SIZE = 24;
const WIDTH = SIZE * 2;
const HEIGHT = Math.sqrt(3) * SIZE;
const DEPTH = SIZE / 4;

const Y = -7;

const RIVER_WIDTH = 3;

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

type GroundTile = EntityW<
  [
    typeof GroundPropsDef,
    typeof GroundLocalDef,
    typeof PositionDef,
    typeof ColorDef,
    typeof RotationDef,
    typeof AngularVelocityDef
  ]
>;

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    grid: createHexGrid<GroundTile>(),
    currentPath: undefined as PathNode | undefined,
    objFreePool: [] as GroundTile[],
    lastShipQ: NaN,
    lastShipR: NaN,
    needsInit: true,
  };
});
export type GroundSystem = Component<typeof GroundSystemDef>;

export const GroundMeshDef = EM.defineComponent("groundMesh", () => {
  return {
    mesh: undefined as any as GameMesh,
  };
});

export const { GroundPropsDef, GroundLocalDef, createGroundNow } =
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
    defaultLocal: () => ({
      readyForSpawn: false,
    }),
    dynamicComponents: [],
    buildResources: [GroundMeshDef],
    build: (g, res) => {
      // console.log(`constructing ground ${g.id}`);
      const em: EntityManager = EM;
      // TODO(@darzu): change position via events?
      em.ensureComponentOn(g, PositionDef, g.groundProps.location);
      em.ensureComponentOn(g, ColorDef, g.groundProps.color);
      EM.ensureComponentOn(g, RotationDef);
      EM.ensureComponentOn(g, AngularVelocityDef);
      em.ensureComponentOn(
        g,
        RenderableConstructDef,
        res.groundMesh.mesh.proto
      );
      // TODO(@darzu): instead of individual colliders, I should have big, shared AABB colliders
      em.ensureComponentOn(
        g,
        ColliderDef,
        res.groundMesh.mesh.mkAabbCollider(true)
      );
      g.collider.targetLayers = []; // don't seek collision with anything
      return g;
    },
  });

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
  // init ground mesh
  em.registerOneShotSystem(null, [AssetsDef, RendererDef], (_, rs) => {
    const mesh = em.addSingletonComponent(GroundMeshDef);

    // create mesh
    const t = mat4.fromRotationTranslationScale(
      mat4.create(),
      quat.IDENTITY,
      [0, -DEPTH, 0],
      [WIDTH * 0.5, DEPTH, WIDTH * 0.5]
    );
    const m = transformMesh(rs.assets.hex.mesh, t);
    const gm = gameMeshFromMesh(m, rs.renderer.renderer);
    mesh.mesh = gm;
  });

  em.registerOneShotSystem(null, [MeDef, GroundMeshDef], (_, rs) => {
    // Only the host runs the ground system
    if (!rs.me.host) return;

    const sys = em.addSingletonComponent(GroundSystemDef);
    assert(GroundSystemDef.isOn(rs));

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
  });

  em.registerSystem(
    null,
    [MeDef, GroundSystemDef, GroundMeshDef],
    (_, rs) => {
      const sys = rs.groundSystem;

      if (!sys.needsInit) return;

      // TODO(@darzu): drop all existing grid tiles
      for (let g of sys.grid._grid.values()) {
        dropTileEvent(g, { delayMs: 0, durationMs: 500 });
      }

      // reset the grid
      sys.grid._grid.clear();

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

      sys.lastShipQ = NaN;
      sys.lastShipR = NaN;

      raiseNodeTiles(rs, sys.currentPath, 0, 0, false);

      let lastPath = sys.currentPath;
      for (let i = 0; i < 10; i++) {
        lastPath = continuePath(lastPath);
      }

      sys.needsInit = false;
    },
    "initGroundSystem"
  );
}

const raiseGroundEvent = eventWizard(
  "raiseGround",
  [
    [
      GroundPropsDef,
      GroundLocalDef,
      PositionDef,
      RotationDef,
      AngularVelocityDef,
      ColorDef,
    ],
  ] as const,
  (
    [g],
    args: { endPos: vec3; delayMs: number; durationMs: number; color: vec3 }
  ) => {
    // console.log(`raiseRaiseGroundAnim ${g.id}`);

    const startPos = vec3.add(vec3.create(), args.endPos, [
      0,
      -TILE_SPAWN_DIST,
      0,
    ]);

    vec3.copy(g.position, startPos);
    vec3.copy(g.color, args.color);
    quat.identity(g.rotation);
    vec3.zero(g.angularVelocity);

    EM.ensureComponentOn(g, AnimateToDef);

    // console.log(
    //   `startPos: ${vec3Dbg(startPos)} endPos: ${vec3Dbg(args.endPos)}`
    // );
    Object.assign(g.animateTo, {
      startPos,
      endPos: args.endPos,
      progressMs: -args.delayMs,
      durationMs: args.durationMs,
      easeFn: EASE_OUTBACK,
    });

    g.groundLocal.readyForSpawn = true;
  },
  {
    serializeExtra: (buf, a) => {
      buf.writeVec3(a.endPos);
      buf.writeUint32(a.delayMs);
      buf.writeUint32(a.durationMs);
      buf.writeVec3(a.color);
    },
    deserializeExtra: (buf) => {
      return {
        endPos: buf.readVec3()!,
        delayMs: buf.readUint32(),
        durationMs: buf.readUint32(),
        color: buf.readVec3()!,
      };
    },
  }
);

function raiseTile(
  res: EntityW<[typeof GroundSystemDef, typeof GroundMeshDef]>,
  q: number,
  r: number,
  color: vec3,
  delayMs: number,
  durationMs: number
) {
  const endPos: vec3 = [hexX(q, r, SIZE), Y, hexZ(q, r, SIZE)];

  let g: GroundTile;
  if (res.groundSystem.objFreePool.length > RIVER_WIDTH * 2) {
    // TODO(@darzu): it'd be nice to have a general way to have object pooling
    g = res.groundSystem.objFreePool.pop()!;
  } else {
    g = createGroundNow(res, vec3.clone(endPos), color);
    // console.log(`createGroundNow ${g.id}`);
  }

  raiseGroundEvent(g, {
    endPos,
    delayMs,
    durationMs,
    color,
  });

  res.groundSystem.grid.set(q, r, g);
  return g;
}

function raiseNodeTiles(
  res: EntityW<[typeof GroundSystemDef, typeof GroundMeshDef]>,
  n: PathNode,
  easeDelayMs: number,
  easeMsPer: number,
  doSpawn: boolean
): Entity[] {
  let nextEaseDelayMs = easeDelayMs;
  const w = Math.floor(n.width / 2);
  let newTiles: Entity[] = [];

  const nextDirIdx = n.next ? n.next.dirIdx : n.dirIdx;
  const leftDir = hexDirCCW90(nextDirIdx);
  const rightDir = hexDirCW90(nextDirIdx);
  const backDirQR = vec2.negate(vec2.create(), HEX_DIRS[n.dirIdx]);
  const backDirXYZ = hexXYZ(vec3.create(), backDirQR[0], backDirQR[1], SIZE);
  vec3.normalize(backDirXYZ, backDirXYZ);

  const sys = res.groundSystem;

  for (let qr of hexesWithin(n.q, n.r, w)) {
    const [q, r] = qr;
    if (!sys.grid.has(q, r)) {
      // TODO(@darzu): DEBUG left/right/forward tiles
      const relQR = vec2.sub([0, 0], qr, [n.q, n.r]);
      const relQRS: vec3 = [relQR[0], relQR[1], -relQR[0] - relQR[1]];
      const isOnPath: (p: PathNode) => boolean = (p) =>
        vec2.exactEquals(qr, [p.q, p.r]) || (p.next ? isOnPath(p.next) : false);
      const isForward = isOnPath(n);
      const isLeft = !isForward && vec3.dot(relQRS, leftDir) > 0;
      const isRight = !isForward && vec3.dot(relQRS, rightDir) > 0;
      // const color: vec3 = [
      //   isLeft ? 0.2 : 0.1,
      //   isRight ? 0.2 : 0.1,
      //   isForward ? 0.2 : 0.1,
      // ];
      const color: vec3 = [
        0.03 + jitter(0.01),
        0.03 + jitter(0.01),
        0.2 + jitter(0.02),
      ];
      const t = raiseTile(res, q, r, color, nextEaseDelayMs, easeMsPer);
      nextEaseDelayMs += easeMsPer * 0.5;

      if (doSpawn) {
        // TODO(@darzu): debugging spawn direction
        // assert(AnimateToDef.isOn(t));
        // const start = vec3.add(vec3.create(), t.animateTo.endPos, [0, 5, 0]);
        // const end = vec3.add(
        //   vec3.create(),
        //   start,
        //   vec3.scale(tempVec(), backDirXYZ, 10)
        // );
        // drawLine(start, end, [0, 1, 0]);
        // // TODO(@darzu): debug atan2
        // const angle = Math.atan2(backDirXYZ[2], -backDirXYZ[0]);
        // const rot = quat.rotateY(quat.create(), quat.IDENTITY, angle);
        // const dir2 = vec3.transformQuat(vec3.create(), [-1, 0, 0], rot);
        // const start2 = vec3.add(vec3.create(), t.animateTo.endPos, [0, 6, 0]);
        // const end2 = vec3.add(
        //   vec3.create(),
        //   start2,
        //   vec3.scale(tempVec(), dir2, 10)
        // );
        // drawLine(start2, end2, [1, 0, 0]);

        addSpawner(t, {
          towardsPlayerDir: backDirXYZ,
          side: isLeft ? "left" : isRight ? "right" : "center",
        });
      }

      newTiles.push(t);
    }
  }

  // TODO(@darzu): spawn enemies on these new tiles. Would like to know:
  //    left or right of river
  // paint NeedsSpawn and have a SpawnSystem elsewhere

  return newTiles;
}

const dropTileEvent = eventWizard(
  "dropTile",
  [[GroundPropsDef, PositionDef, AngularVelocityDef]] as const,
  ([g], args: { delayMs: number; durationMs: number }) => {
    const startPos = vec3.clone(g.position);
    const endPos = vec3.add(vec3.create(), startPos, [0, -TILE_FALL_DIST, 0]);
    // NOTE: since this is an event, these might be played back-to-back as some
    //    client catches up
    EM.ensureComponentOn(g, AnimateToDef);
    Object.assign(g.animateTo, {
      startPos,
      endPos,
      progressMs: -args.delayMs,
      durationMs: args.durationMs,
      easeFn: EASE_INCUBE,
    });

    // some random spin
    const spin = g.angularVelocity;
    vec3.copy(spin, [
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ]);
    vec3.normalize(spin, spin);
    vec3.scale(spin, spin, 0.001);
  },
  {
    serializeExtra: (buf, a) => {
      buf.writeUint32(a.delayMs);
      buf.writeUint32(a.durationMs);
    },
    deserializeExtra: (buf) => {
      return {
        delayMs: buf.readUint32(),
        durationMs: buf.readUint32(),
      };
    },
  }
);

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
    if (g) {
      dropTileEvent(g, { delayMs: nextEaseDelayMs, durationMs: easeMsPer });

      sys.objFreePool.unshift(g);
      sys.grid.delete(q, r);
      droppedTiles.push(g);
    }
  }
  return droppedTiles;
}

export function registerGroundSystems(em: EntityManager) {
  em.registerSystem(
    null,
    [GroundSystemDef, GroundMeshDef, ScoreDef, MeDef, GameStateDef],
    (_, res) => {
      // host only
      if (!res.me.host) return;

      // is our path inited?
      const sys = res.groundSystem;
      if (!sys.currentPath) return;

      // are we playing?
      if (res.gameState.state !== GameState.PLAYING) return;

      // where is our ship?
      const ship = em.filterEntities([ShipLocalDef, PositionDef])[0];
      if (!ship) return;
      const [shipQ, shipR] = xzToHex(ship.position[0], ship.position[2], SIZE);

      // have we changed tiles?
      if (shipQ === sys.lastShipQ && shipR === sys.lastShipR) return;

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
          const ts = raiseNodeTiles(res, ahead, easeStart, easeMs, true);
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

      sys.lastShipQ = shipQ;
      sys.lastShipR = shipR;
    },
    "groundSystem"
  );
}
