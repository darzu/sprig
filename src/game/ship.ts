import { FinishedDef } from "../build.js";
import {
  Component,
  ComponentDef,
  EM,
  Entities,
  Entity,
  EntityManager,
  EntityW,
  SystemFN,
  WithComponent,
} from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef, BARGE_AABBS } from "./assets.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { ColorDef, ScoreDef, TextDef } from "./game.js";
import { setCubePosScaleToAABB } from "../physics/phys-debug.js";
import { BOAT_COLOR } from "./boat.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { max, min } from "../math.js";
import { assert } from "../test.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { LifetimeDef } from "./lifetime.js";
import { CannonConstructDef } from "./cannon.js";
import { MusicDef } from "../music.js";
import { CameraDef, PlayerEntDef } from "./player.js";
import { InputsDef } from "../inputs.js";
import { GroundSystemDef } from "./ground.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { GameState, GameStateDef } from "./gamestate.js";

// TODO(@darzu): impl. occassionaly syncable components with auto-versioning

export const ShipDef = EM.defineComponent("ship", () => {
  return {
    partIds: [] as number[],
    gemId: 0,
    speed: 0,
    cannonLId: 0,
    cannonRId: 0,
  };
});

export const ShipPartDef = EM.defineComponent(
  "shipPart",
  (critical: boolean) => ({
    critical,
    damaged: false,
  })
);

// export const ShipConstructDef = EM.defineComponent("shipConstruct", () => {
//   return {
//     loc: vec3.create(),
//     rot: quat.create(),
//     gemId: 0,
//   };
// });
// export type ShipConstruct = Component<typeof ShipConstructDef>;

// EM.registerSerializerPair(
//   ShipConstructDef,
//   (c, buf) => {
//     buf.writeVec3(c.loc);
//     buf.writeQuat(c.rot);
//   },
//   (c, buf) => {
//     buf.readVec3(c.loc);
//     buf.readQuat(c.rot);
//   }
// );

function defineSerializableComponent<N extends string, P, Pargs extends any[]>(
  em: EntityManager,
  name: N,
  construct: (...args: Pargs) => P,
  serialize: (obj: P, buf: Serializer) => void,
  deserialize: (obj: P, buf: Deserializer) => void
): ComponentDef<N, P, Pargs> {
  const def = em.defineComponent(name, construct);
  em.registerSerializerPair(def, serialize, deserialize);
  return def;
}

function registerConstructorSystem<
  C extends ComponentDef,
  RS extends ComponentDef[]
>(
  em: EntityManager,
  def: C,
  rs: [...RS],
  callback: (e: EntityW<[C]>, resources: EntityW<RS>) => void
) {
  em.registerSystem(
    [def],
    rs,
    (es, res) => {
      for (let e of es) {
        if (FinishedDef.isOn(e)) continue;
        callback(e as EntityW<[C]>, res);
        em.ensureComponentOn(e, FinishedDef);
      }
    },
    `build_${def.name}`
  );
  return def;
}

// TODO(@darzu):
// em.ensureComponentOn(e, SyncDef);
// e.sync.fullComponents.push(def.id);

export const ShipConstructDef = defineSerializableComponent(
  EM,
  "shipConstruct",
  () => ({
    loc: vec3.create(),
    rot: quat.create(),
    gemId: 0,
  }),
  (c, buf) => {
    buf.writeVec3(c.loc);
    buf.writeQuat(c.rot);
  },
  (c, buf) => {
    buf.readVec3(c.loc);
    buf.readQuat(c.rot);
  }
);

export const GemDef = EM.defineComponent("gem", () => {
  // TODO(@darzu):
  true;
});

const criticalPartIdxes = [0, 3, 5, 6];

export function createNewShip(em: EntityManager) {
  em.registerOneShotSystem(null, [AssetsDef], (_, res) => {
    // create ship
    const s = em.newEntity();
    em.ensureComponentOn(s, ShipConstructDef);
    s.shipConstruct.loc = [0, -2, 0];

    // create gem
    const gem = em.newEntity();
    em.ensureComponentOn(
      gem,
      RenderableConstructDef,
      res.assets.spacerock.proto
    );
    em.ensureComponentOn(gem, PositionDef, [0, 0, -1]);
    em.ensureComponentOn(gem, PhysicsParentDef, s.id);
    em.ensureComponentOn(gem, GemDef);
    em.ensureComponentOn(gem, ColorDef);

    // create seperate hitbox for interacting with the gem
    const interactBox = em.newEntity();
    const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
    em.ensureComponentOn(interactBox, PhysicsParentDef, gem.id);
    em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(interactBox, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: interactAABB,
    });

    em.ensureComponentOn(gem, InteractableDef, interactBox.id);

    s.shipConstruct.gemId = gem.id;

    // creating a ship:
    //  props (synced once)
    //  local state (never synced)
    //  dynamic state (synced many times)

    // if you're gonna have ANY local-only state that EACH player
    //  needs, you must have a constructor
  });
}

export function registerShipSystems(em: EntityManager) {
  registerConstructorSystem(
    em,
    ShipConstructDef,
    [MeDef, AssetsDef],
    (s, res) => {
      // networked state
      em.ensureComponentOn(s, PositionDef, s.shipConstruct.loc);
      em.ensureComponentOn(s, RotationDef, s.shipConstruct.rot);
      em.ensureComponentOn(s, SyncDef);
      s.sync.dynamicComponents = [RotationDef.id, PositionDef.id];
      em.ensureComponentOn(s, AuthorityDef, res.me.pid);

      // local only state
      em.ensureComponentOn(s, ShipDef);
      s.ship.speed = 0.005;
      em.ensureComponentOn(s, LinearVelocityDef, [0, -0.01, 0]);

      const mc: MultiCollider = {
        shape: "Multi",
        solid: true,
        // TODO(@darzu): integrate these in the assets pipeline
        children: BARGE_AABBS.map((aabb) => ({
          shape: "AABB",
          solid: true,
          aabb,
        })),
      };
      em.ensureComponentOn(s, ColliderDef, mc);

      // NOTE: since their is no network important state on the parts themselves
      //    they can be created locally
      const boatFloor = min(BARGE_AABBS.map((c) => c.max[1]));
      for (let i = 0; i < res.assets.ship_broken.length; i++) {
        const m = res.assets.ship_broken[i];
        const part = em.newEntity();
        em.ensureComponentOn(part, PhysicsParentDef, s.id);
        em.ensureComponentOn(part, RenderableConstructDef, m.proto);
        em.ensureComponentOn(part, ColorDef, vec3.clone(BOAT_COLOR));
        em.ensureComponentOn(part, PositionDef, [0, 0, 0]);
        const isCritical = criticalPartIdxes.includes(i);
        em.ensureComponentOn(part, ShipPartDef, isCritical);
        em.ensureComponentOn(part, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: m.aabb,
        });
        (part.collider as AABBCollider).aabb.max[1] = boatFloor;
        s.ship.partIds.push(part.id);
      }

      // create cannons

      const cannonPitch = Math.PI * -0.05;

      const cannonR = em.newEntity();
      em.ensureComponentOn(cannonR, PhysicsParentDef, s.id);
      em.addComponent(
        cannonR.id,
        CannonConstructDef,
        [-6, 3, 5],
        0,
        cannonPitch
      );
      s.ship.cannonRId = cannonR.id;
      const cannonL = em.newEntity();
      em.ensureComponentOn(cannonL, PhysicsParentDef, s.id);
      em.addComponent(
        cannonL.id,
        CannonConstructDef,
        [6, 3, 5],
        Math.PI,
        cannonPitch
      );
      s.ship.cannonLId = cannonL.id;

      // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
      // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
    }
  );

  em.registerSystem(
    [GemDef, InRangeDef],
    [GameStateDef, PhysicsResultsDef, MeDef, InputsDef],
    (gems, res) => {
      for (let gem of gems) {
        if (DeletedDef.isOn(gem)) continue;
        if (res.gameState.state !== GameState.LOBBY) continue;
        if (res.inputs.keyClicks["e"]) res.gameState.state = GameState.PLAYING;
      }
    },
    "startGame"
  );

  em.registerSystem(
    [ShipDef, PositionDef],
    [MusicDef, InputsDef, CameraDef, GroundSystemDef, GameStateDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      const numCritical = criticalPartIdxes.length;
      for (let ship of ships) {
        let numCriticalDamaged = 0;
        for (let partId of ship.ship.partIds) {
          const part = em.findEntity(partId, [ShipPartDef]);
          if (part && part.shipPart.critical && part.shipPart.damaged) {
            numCriticalDamaged += 1;
          }
        }
        if (
          numCriticalDamaged === numCritical ||
          res.inputs.keyClicks["backspace"]
        ) {
          res.music.playChords([1, 2, 3, 4, 4], "minor");
          res.gameState.state = GameState.GAMEOVER;
        }
      }
    },
    "shipDead"
  );

  em.registerSystem(
    [ShipDef, LinearVelocityDef],
    [GameStateDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        s.linearVelocity[2] = s.ship.speed;
        s.linearVelocity[1] = -0.01;
      }
    },
    "shipMove"
  );

  em.registerSystem(
    null,
    [TextDef, ScoreDef],
    (_, res) => {
      // update score
      res.text.setText(
        `current: ${res.score.currentScore}, max: ${res.score.maxScore}`
      );
    },
    "shipUI"
  );

  em.registerSystem(
    [ShipDef],
    [PhysicsResultsDef, MusicDef],
    (ships, res) => {
      for (let s of ships) {
        for (let partId of s.ship.partIds) {
          const part = em.findEntity(partId, [
            ShipPartDef,
            ColorDef,
            RenderableDef,
          ]);
          if (part) {
            if (!part.renderable.enabled) continue;
            const bullets = res.physicsResults.collidesWith
              .get(partId)
              ?.map((h) => em.findEntity(h, [BulletDef]))
              .filter((h) => h && h.bullet.team === 2);
            if (bullets && bullets.length) {
              for (let b of bullets)
                if (b) em.ensureComponent(b.id, DeletedDef);
              // part.color[0] += 0.1;
              part.renderable.enabled = false;
              part.shipPart.damaged = true;

              res.music.playChords([2, 3], "minor", 0.2, 5.0, -2);
            }
          }
        }
      }
    },
    "shipBreakParts"
  );
}
