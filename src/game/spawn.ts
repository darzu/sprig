import { AnimateToDef } from "../animate-to.js";
import { createRef, Ref } from "../em_helpers.js";
import { EM, Entity } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { spawnBoat } from "./enemy-boat.js";

export interface SpawnerOpts {
  towardsPlayerDir: vec3;
  side: "left" | "right" | "center";
}
const ChildCS = [
  PositionDef,
  RotationDef,
  WorldFrameDef,
  PhysicsParentDef,
] as const;
export interface Spawner extends SpawnerOpts {
  hasSpawned: boolean;
  childrenToRelease: Ref<[...typeof ChildCS]>[];
}
export const SpawnerDef = EM.defineComponent(
  "toSpawn",
  (s?: Partial<Spawner>) => ({
    towardsPlayerDir: [0, 0, 0],
    childrenToRelease: [],
    hasSpawned: false,
    side: "center",
    ...s,
  })
);

export function addSpawner(e: Entity, opts: SpawnerOpts) {
  // TODO(@darzu):
  EM.ensureComponentOn(e, SpawnerDef, opts);
}

onInit((em) => {
  em.registerSystem(
    [SpawnerDef, AuthorityDef, ColliderDef],
    [MeDef],
    (tiles, res) => {
      for (let t of tiles) {
        if (t.authority.pid !== res.me.pid) continue;
        if (t.toSpawn.hasSpawned) continue;

        if (t.toSpawn.side !== "center") {
          const angle = Math.atan2(
            t.toSpawn.towardsPlayerDir[2],
            -t.toSpawn.towardsPlayerDir[0]
          );

          const y = (t.collider as AABBCollider).aabb.max[1] + 1;
          const b = spawnBoat(
            [0, y, 0],
            t.id,
            angle,
            t.toSpawn.side === "left"
          );

          // console.log(`spawning ${b.id} from ${t.id} at ${performance.now()}`);

          t.toSpawn.childrenToRelease.push(createRef(b.id, [...ChildCS]));
        }

        t.toSpawn.hasSpawned = true;
      }
    },
    "spawnOnTile"
  );

  // TODO(@darzu): this seems really general
  const runUnparent = eventWizard(
    "unparent",
    [[PhysicsParentDef, PositionDef, RotationDef, WorldFrameDef]] as const,
    ([c]) => {
      vec3.copy(c.position, c.world.position);
      quat.copy(c.rotation, c.world.rotation);
      c.physicsParent.id = 0;
    }
  );

  // TODO(@darzu): can we make this more ground agnostic?
  em.registerSystem(
    [SpawnerDef, AuthorityDef, RotationDef, PositionDef],
    [MeDef],
    (tiles, res) => {
      const toRemove: number[] = [];

      for (let t of tiles) {
        if (t.authority.pid !== res.me.pid) continue;

        // TODO(@darzu): is spawner still relevant?
        // is the ground ready?
        // if (!t.groundLocal.readyForSpawn) continue;

        // are we still animating?
        if (AnimateToDef.isOn(t)) continue;

        // unparent children
        for (let i = t.toSpawn.childrenToRelease.length - 1; i >= 0; i--) {
          const c = t.toSpawn.childrenToRelease[i]();
          if (c) {
            // console.log(
            //   `unparenting ${c.id} from ${t.id} at ${performance.now()}`
            // );
            // TODO(@darzu): we're doing duplicate work here. we do it so that at least
            //  on the host there is less position flickering
            vec3.copy(c.position, c.world.position);
            quat.copy(c.rotation, c.world.rotation);
            c.physicsParent.id = 0;
            runUnparent(c);

            t.toSpawn.childrenToRelease.splice(i);
          }
        }

        // do we still have children to release?
        if (!t.toSpawn.childrenToRelease.length) {
          toRemove.push(t.id); // if not, remove the spawner
        }
      }

      for (let id of toRemove) {
        EM.removeComponent(id, SpawnerDef);
      }
    },
    "spawnFinishAnimIn"
  );
});
