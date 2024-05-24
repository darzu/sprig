// TODO(@darzu): hacky file split

import { ColorDef } from "../color/color-ecs.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { AllMeshesDef, BLACK } from "../meshes/mesh-list.js";
import { GravityDef } from "../motion/gravity.js";
import { V2, V3, V4, quat, mat4, V, tV } from "../matrix/sprig-matrix.js";
import { jitter, randRadian } from "../utils/math.js";
import { getLineMid } from "../physics/broadphase.js";
import { LinearVelocityDef, AngularVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { normalizeMesh } from "../meshes/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { randNormalVec3, vec3Reverse, vec4Reverse } from "../utils/utils-3d.js";
import { SegState, createEmptyMesh, createTimberBuilder } from "./wood.js";
import { RenderDataStdDef } from "../render/pipelines/std-scene.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_LOG } from "../flags.js";

const DBG_SPLINTER_POOL_TIME = true;

// TODO(@darzu): generalize for any entity pool

export type SplinterPart = EntityW<[typeof PositionDef, typeof ColorDef]>;

export type SplinterPool = ReturnType<typeof createSplinterPool>;

export const SplinterParticleDef = EM.defineComponent("splinter", () => {
  return {};
});

export const SplinterPoolsDef = EM.defineResource("splinterPools", () => {
  const _pools = new Map<string, SplinterPool>();

  function getOrCreatePool(seg: SegState) {
    const poolKey: string = `w${seg.xWidth.toFixed(1)}_d${seg.zDepth.toFixed(
      1
    )}}`;
    let pool = _pools.get(poolKey);
    if (!pool) {
      if (VERBOSE_LOG) console.log(`new splinter pool!: ${poolKey}`);
      pool = createSplinterPool(seg.xWidth, seg.zDepth, 1, 40);
      _pools.set(poolKey, pool);
    }
    return pool;
  }

  return {
    getOrCreatePool,
    _pools,
  };
});

let _accumPoolCreationTimeMs = 0;
function createSplinterPool(
  width: number,
  depth: number,
  length: number,
  numInPool: number
) {
  const _start = performance.now();
  const pool: SplinterPart[] = [];
  let nextIdx = 0;

  function getNext(): SplinterPart {
    if (nextIdx >= pool.length) nextIdx = 0;
    return pool[nextIdx++];
  }
  // const { allMeshes} = await EM.whenResources(AssetsDef);

  for (let i = 0; i < numInPool; i++) {
    // create flying splinter
    const topW = 0.6 + jitter(0.4);
    const botW = 0.6 + jitter(0.4);

    // TODO(@darzu): PERF. use instances instead of seperate meshes for splinters
    const _splinterMesh = mkTimberSplinterFree(
      topW,
      botW,
      length,
      width,
      depth
    );
    const splinterMesh = normalizeMesh(_splinterMesh);
    const splinter = EM.mk();
    EM.set(
      splinter,
      RenderableConstructDef,
      splinterMesh,
      true,
      0,
      undefined,
      undefined,
      true // hidden
    );
    EM.set(splinter, ColorDef);
    EM.set(splinter, PositionDef);
    EM.set(splinter, RotationDef);
    EM.set(splinter, AngularVelocityDef);
    EM.set(splinter, LinearVelocityDef);
    EM.set(splinter, GravityDef);
    EM.set(splinter, SplinterParticleDef);
    pool.push(splinter);
  }

  if (DBG_SPLINTER_POOL_TIME) {
    const _end = performance.now();
    _accumPoolCreationTimeMs += _end - _start;
    console.log(
      `createSplinterPool ${_accumPoolCreationTimeMs.toFixed(
        1
      )}ms (accumulated)`
    );
  }

  return {
    width,
    depth,
    length,
    numInPool,
    getNext,
  };
}

export const mkTimberSplinterFree = (
  topWidth: number,
  botWidth: number,
  height: number,
  width: number,
  depth: number
) => {
  // const b = createTimberBuilder(.5, .2);
  const b = createTimberBuilder(createEmptyMesh("splinter"));
  b.xLen = width;
  b.zLen = depth;

  // mat4.rotateY(b.cursor, b.cursor, Math.PI * -0.5); // TODO(@darzu): DBG

  // const Wtop = 1 + jitter(0.9);
  // const Wbot = 1 + jitter(0.9);
  const Wtop = topWidth;
  const Wbot = botWidth;
  // const W = 0.75 + jitter(0.25);
  const H = height;

  const topJags = Math.round(10 * width * Wtop);
  const botJags = Math.round(10 * width * Wbot);

  mat4.translate(b.cursor, [0, -H * 0.5, 0], b.cursor);
  mat4.scale(b.cursor, [Wbot, 1, 1], b.cursor);
  b.addLoopVerts();
  const loopBotEndIdx = b.mesh.pos.length;
  mat4.translate(b.cursor, [0, +H, 0], b.cursor);
  mat4.scale(b.cursor, [(1 / Wbot) * Wtop, 1, 1], b.cursor);
  const splinLoopStart = b.mesh.pos.length;
  const splinLoop = tV(
    splinLoopStart + 0,
    splinLoopStart + 1,
    splinLoopStart + 2,
    splinLoopStart + 3
  );
  b.addLoopVerts();
  const loopTopEndIdx = b.mesh.pos.length;
  b.addSideQuads();

  // top splinters
  b.addSplinteredEnd(splinLoop, topJags);

  // mat4.translate(b.cursor, b.cursor, [0, -0.2, 0]);
  {
    mat4.scale(b.cursor, [(1 / Wtop) * Wbot, 1, 1], b.cursor);
    mat4.translate(b.cursor, [0, -H, 0], b.cursor);
    mat4.scale(b.cursor, [1, -1, 1], b.cursor);

    const tIdx = b.mesh.tri.length;
    const qIdx = b.mesh.quad.length;
    b.addSplinteredEnd(splinLoop, botJags);
    for (let ti = tIdx; ti < b.mesh.tri.length; ti++)
      vec3Reverse(b.mesh.tri[ti]);
    for (let ti = qIdx; ti < b.mesh.quad.length; ti++)
      vec4Reverse(b.mesh.quad[ti]);
  }

  // b.addEndQuad(false);

  // TODO(@darzu): triangle vs quad coloring doesn't work
  b.mesh.quad.forEach((_) => b.mesh.colors.push(V3.clone(BLACK)));
  b.mesh.tri.forEach((_) => b.mesh.colors.push(V3.clone(BLACK)));

  // console.dir(b.mesh);

  return b.mesh;
};

EM.addLazyInit([], [SplinterPoolsDef], () => {
  EM.addResource(SplinterPoolsDef);
});

EM.addEagerInit([SplinterParticleDef], [], [], () => {
  const splinterObjId = 7654;
  EM.addSystem(
    "splintersOnFloor",
    Phase.GAME_WORLD,
    [
      SplinterParticleDef,
      LinearVelocityDef,
      AngularVelocityDef,
      GravityDef,
      PositionDef,
      RotationDef,
      RenderDataStdDef,
    ],
    [],
    (splinters, res) => {
      for (let s of splinters) {
        if (s.position[2] < 0) {
          V3.zero(s.linearVelocity);
          V3.zero(s.gravity);
          V3.zero(s.angularVelocity);

          s.position[2] = 0;
          quat.fromYawPitchRoll(randRadian(), 0, 0, s.rotation);
          s.renderDataStd.id = splinterObjId; // stops z-fighting
        }
      }
    }
  );
});
