import { ColliderDef } from "../physics/collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
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

/*
NOTES:
  https://www.redblobgames.com/grids/hexagons/
  https://www.redblobgames.com/grids/hexagons/implementation.html
  http://www-cs-students.stanford.edu/~amitp/gameprog.html#hex
*/

const SIZE = 6;
export const WIDTH = SIZE * 2;
const HEIGHT = Math.sqrt(3) * SIZE;
const DEPTH = 2;

const X_SPC = (WIDTH * 3) / 4;
const Z_SPC = HEIGHT;

// TODO(@darzu): rm
const THIRDSIZE = WIDTH / 3;

export type GroundProps = Component<typeof GroundPropsDef>;

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    groundPool: [] as number[],
    initialScore: (THIRDSIZE * 2) / 10,
    nextScore: (THIRDSIZE * 2) / 10,
    nextGroundIdx: 0,
    totalPlaced: 0,
    initialPlace: true,
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
    buildResources: [MeDef, GroundSystemDef],
    build: (g, res) => {
      const em: EntityManager = EM;
      // TODO(@darzu): change position via events?
      vec3.copy(g.position, g.groundProps.location);
      em.ensureComponent(g.id, ColorDef, g.groundProps.color);
      em.ensureComponent(
        g.id,
        RenderableConstructDef,
        res.groundSystem.mesh.proto
      );
      em.ensureComponent(
        g.id,
        ColliderDef,
        res.groundSystem.mesh.aabbCollider(true)
      );
    },
  });

const NUM_X = 3;
const NUM_Z = 4;

export function initGroundSystem(em: EntityManager) {
  em.registerOneShotSystem(
    null,
    [ScoreDef, MeDef, AssetsDef, RendererDef],
    (_, rs) => {
      const sys = em.addSingletonComponent(GroundSystemDef);

      // create mesh
      const t = mat4.fromScaling(mat4.create(), [
        WIDTH * 0.5,
        DEPTH,
        WIDTH * 0.5,
      ]);
      const m = transformMesh(rs.assets.hex.mesh, t);
      const gm = gameMeshFromMesh(m, rs.renderer.renderer);
      sys.mesh = gm;

      // init ground system
      assert(sys.groundPool.length === 0);

      for (let x = 0; x < NUM_X; x++) {
        for (let z = 0; z < NUM_Z; z++) {
          const color = (x + z) % 2 === 0 ? LIGHT_BLUE : DARK_BLUE;
          const g = em.newEntity();
          em.ensureComponentOn(g, GroundPropsDef, [0, 0, 0], color);
          sys.groundPool.push(g.id);
        }
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

      if (
        sys.groundPool.length === 0 ||
        sys.groundPool.some((id) => !em.findEntity(id, [GroundLocalDef]))
      )
        // not inited
        return;

      // initial placement
      if (sys.initialPlace) {
        sys.initialPlace = false;
        sys.nextScore = sys.initialScore;
        sys.totalPlaced = 0;
        sys.nextGroundIdx = 0;

        for (let x = 0; x < NUM_X; x++) {
          for (let z = 0; z < NUM_Z; z++) {
            placeNextGround();
          }
        }
      } else {
        // ship progress
        const score = res.score.currentScore;
        while (score > sys.nextScore) {
          placeNextGround();
          sys.nextScore += THIRDSIZE / 10;
        }
      }

      function placeNextGround() {
        // move ground
        const gId = sys.groundPool[sys.nextGroundIdx];
        const g = em.findEntity(gId, [GroundLocalDef, PositionDef]);
        if (g) {
          vec3.copy(g.position, calcLoc(sys.totalPlaced));

          sys.nextGroundIdx = (sys.nextGroundIdx + 1) % sys.groundPool.length;
          sys.totalPlaced += 1;
        }
      }
    },
    "groundSystem"
  );

  function calcLoc(num: number): vec3 {
    const x = num % NUM_X;
    const z = Math.floor(num / NUM_X);
    return [(x - 1) * WIDTH, -7, z * WIDTH];
  }
}
