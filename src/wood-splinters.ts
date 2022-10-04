// TODO(@darzu): hacky file split

import { ColorDef } from "./color-ecs.js";
import { EntityW, EntityManager, EM } from "./entity-manager.js";
import { AssetsDef, mkTimberSplinterFree } from "./game/assets.js";
import { GravityDef } from "./game/gravity.js";
import { vec3, quat } from "./gl-matrix.js";
import { jitter } from "./math.js";
import { getLineMid } from "./physics/broadphase.js";
import { LinearVelocityDef, AngularVelocityDef } from "./physics/motion.js";
import { PositionDef, RotationDef } from "./physics/transform.js";
import { normalizeMesh } from "./render/mesh.js";
import { RenderableConstructDef } from "./render/renderer-ecs.js";
import { randNormalVec3 } from "./utils-3d.js";
import { SplinterParticleDef } from "./wood.js";

// TODO(@darzu): generalize for any entity pool

export type SplinterPart = EntityW<[typeof PositionDef, typeof ColorDef]>;

export type SplinterPool = ReturnType<typeof createSplinterPool>;

export function createSplinterPool(
  width: number,
  depth: number,
  length: number,
  color: vec3,
  numInPool: number
) {
  const em: EntityManager = EM;

  const pool: SplinterPart[] = [];
  let nextIdx = 0;

  function getNext(): SplinterPart {
    if (nextIdx >= pool.length) nextIdx = 0;
    return pool[nextIdx++];
  }
  // const { assets } = await em.whenResources(AssetsDef);

  for (let i = 0; i < numInPool; i++) {
    // create flying splinter
    const topW = 0.6 + jitter(0.4);
    const botW = 0.6 + jitter(0.4);

    const _splinterMesh = mkTimberSplinterFree(
      topW,
      botW,
      length,
      width,
      depth
    );
    const splinterMesh = normalizeMesh(_splinterMesh);
    const splinter = em.newEntity();
    em.ensureComponentOn(splinter, RenderableConstructDef, splinterMesh);
    em.ensureComponentOn(splinter, ColorDef, vec3.clone(color));
    em.ensureComponentOn(splinter, PositionDef);
    em.ensureComponentOn(splinter, RotationDef);
    em.ensureComponentOn(splinter, AngularVelocityDef);
    em.ensureComponentOn(splinter, LinearVelocityDef);
    em.ensureComponentOn(splinter, GravityDef);
    em.ensureComponentOn(splinter, SplinterParticleDef);
    pool.push(splinter);
  }

  return {
    width,
    depth,
    length,
    color,
    numInPool,
    getNext,
  };
}
