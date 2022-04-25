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
import { createHexGrid, hexX, hexZ } from "../hex.js";
import { jitter } from "../math.js";
import { LocalPlayerDef } from "./player.js";
import { CameraFollowDef } from "../camera.js";

/*
NOTES:
  https://www.redblobgames.com/grids/hexagons/
  https://www.redblobgames.com/grids/hexagons/implementation.html
  http://www-cs-students.stanford.edu/~amitp/gameprog.html#hex
*/

const SIZE = 16;
export const WIDTH = SIZE * 2;
const HEIGHT = Math.sqrt(3) * SIZE;
const DEPTH = 2;

const Y = -7;

const X_SPC = (WIDTH * 3) / 4;
const Z_SPC = HEIGHT;

// TODO(@darzu): rm
const THIRDSIZE = WIDTH / 3;

export type GroundProps = Component<typeof GroundPropsDef>;

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    grid: createHexGrid<EntityW<[typeof GroundPropsDef]>>(),
    initialScore: (THIRDSIZE * 2) / 10,
    nextScore: (THIRDSIZE * 2) / 10,
    nextGroundIdx: 0,
    totalPlaced: 0,
    initialPlace: true,
  };
});

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
      em.ensureComponentOn(
        g,
        ColliderDef,
        res.groundMesh.mesh.aabbCollider(true)
      );
      g.collider.targetLayers = []; // don't seek collision with anything
    },
  });

const RIVER_WIDTH = 8;

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
        vec3.copy(e.position, [34.4, 47.92, -28.68]);
        quat.copy(e.rotation, [0.0, 0.92, 0.0, 0.38]);
        vec3.copy(e.cameraFollow.positionOffset, [2.0, 2.0, 8.0]);
        e.cameraFollow.yawOffset = 0;
        e.cameraFollow.pitchOffset = -0.8150000000000003;
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

      const w = Math.floor(RIVER_WIDTH / 2);

      createTile(0, -2, [0.1, 0.2, 0.1]);
      createTile(2, -2, [0.2, 0.1, 0.1]);
      createTile(-2, 0, [0.1, 0.1, 0.2]);
      createTile(0, 0, [0.1, 0.1, 0.1]);

      // TODO(@darzu):
      for (let i = 0; i < 10; i++) {
        for (let q = -w; q <= w; q++) {
          for (let r = -w; r <= w; r++) {
            for (let s = -w; s <= w; s++) {
              if (q + r + s === 0) {
                if (!sys.grid.has(q, r - i)) {
                  const color: vec3 = [
                    0.03 + jitter(0.01),
                    0.03 + jitter(0.01),
                    0.2 + jitter(0.02),
                  ];
                  createTile(q, r - i, color);
                }
              }
            }
          }
        }
      }

      function createTile(q: number, r: number, color: vec3) {
        console.log(`created`);
        const g = em.newEntity();
        const pos: vec3 = [hexX(q, r, SIZE), Y, hexZ(q, r, SIZE)];
        em.ensureComponentOn(g, GroundPropsDef, pos, color);
        sys.grid.set(q, r, g);
      }
    }
  );
}

export function registerGroundSystems(em: EntityManager) {
  em.registerSystem(
    null,
    [GroundSystemDef, ScoreDef, MeDef],
    (_, res) => {
      if (!res.me.host) return;

      const sys = res.groundSystem;

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
