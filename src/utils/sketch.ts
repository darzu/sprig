import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { defineResourceWithInit as defineResourceWithLazyInit } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { Phase } from "../ecs/sys-phase.js";
import { DotsDef } from "../graybox/dots.js";
import { ObjChildEnt, defineObj } from "../ecs/em-objects.js";
import { T } from "./util-no-import.js";
import { V3, cloneTmpsInObj, quat, tV } from "../matrix/sprig-matrix.js";
import { Mesh } from "../meshes/mesh.js";
import {
  mkLine,
  mkLineChain,
  mkLineSegs,
  mkPointCloud,
  mkTriangle,
} from "../meshes/primatives.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PositionDef,
  RotationDef,
  ScaleDef,
  TransformDef,
  identityFrame,
} from "../physics/transform.js";
import { CyMeshPoolPtr } from "../render/gpu-registry.js";
import {
  lineMeshPoolPtr,
  pointMeshPoolPtr,
} from "../render/pipelines/std-line.js";
import { meshPoolPtr } from "../render/pipelines/std-scene.js";
import {
  MeshLike,
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { createIdxRing } from "./idx-pool.js";
import {
  CompiledSVG,
  SVG,
  compileSVG,
  svgInstrIsStraight,
  svgToLineSeg,
} from "./svg.js";
import { never } from "./util-no-import.js";
import { assert, range } from "./util.js";
import { AABB } from "../physics/aabb.js";
import { MeshReg } from "../meshes/mesh-loader.js";
import {
  UnitCubeMesh,
  WireCubeMesh,
  WireUnitCubeMesh,
} from "../meshes/mesh-list.js";
import { Line, Ray, getLineEnd } from "../physics/broadphase.js";

export const WARN_DROPPED_EARLY_SKETCH = false;

// TODO(@darzu): RENAME:
//  blocks (block it out), sketcher / sketch, prototype, gizmo, adornment, widgets,

// TODO(@darzu): DBG DRAW STUFF:
/*
lifetime stragies:
  pool (ring buffer, throw)
  lifetime
  key
objects:
  for many structs like AABB, OBB, 
  primatives: ball, plane, line, box, dot
  advanced: pointCloudOnMeshSurface, checkeredOnMesh
  w/ transparency
scenarios:
  dbg a mat4 localToWorld,
  mat3 rot,
  a spline or path
  some "pure" mathy function, just viz it

maybe draw a scene in a seperate little window,
  composite it over the main ?
*/

// TODO(@darzu): sketchOBB
// TODO(@darzu): sketchEntity (sketchs collider)

// TODO(@darzu): use JS Proxy's to wrap e.g. vectors in a visualization.
// TODO(@darzu): sketches can be assigned "local space" that's a transform they belong to e.g. a direction vector relative to some entity's transform

// TODO(@darzu): pool mesh handles instead of / in addition to entities?

export const SketchObj = defineObj({
  name: "sketch",
  propsType: T<{ key: string }>(),
  components: [
    PositionDef,
    RotationDef,
    ScaleDef,
    TransformDef,
    // WorldFrameDef,
    ColorDef,
  ],
});
export type SketchEnt = ObjChildEnt<typeof SketchObj>;

export interface SketchBaseOpt {
  key?: string;
  // lifeMs?: number;
  color?: V3.InputT;
  alpha?: number;
  renderMask?: number;
}

export interface SketchLineOpt {
  shape: "line";
  start: V3.InputT;
  end: V3.InputT;
}
export interface SketchTriOpt {
  shape: "tri";
  v0: V3.InputT;
  v1: V3.InputT;
  v2: V3.InputT;
}
export interface SketchCubeOpt {
  shape: "cube";
  pos: V3.InputT;
  halfsize?: number;
}
export interface SketchPointsOpt {
  shape: "points";
  vs: V3.InputT[];
}
export interface SketchLinesOpt {
  shape: "lines";
  vs: V3.InputT[];
}

export interface SketchLineSegsOpt {
  shape: "lineSegs";
  lines: [V3.InputT, V3.InputT][];
}

export interface SketchDotOpt {
  shape: "dot";
  v: V3.InputT;
  radius?: number;
}

export interface SketchAABBOpt {
  shape: "aabb";
  aabb: AABB;
}

export type SketchPrimOpt = SketchBaseOpt &
  (
    | SketchLineOpt
    | SketchPointsOpt
    | SketchLinesOpt
    | SketchLineSegsOpt
    | SketchTriOpt
  );

const SketchPrimShapes: { [k in SketchPrimOpt["shape"]]: true } = {
  line: true,
  points: true,
  tri: true,
  lines: true,
  lineSegs: true,
};

// prettier-ignore
export type SketchInstanceOpt = SketchBaseOpt &
  (
    | SketchCubeOpt
    | SketchAABBOpt
  );

const SketchInstanceShapes: { [k in SketchInstanceOpt["shape"]]: true } = {
  cube: true,
  aabb: true,
};

// prettier-ignore
export type SketchParticleOpt = SketchBaseOpt &
(
  | SketchDotOpt
);

const SketchParticleShapes: { [k in SketchParticleOpt["shape"]]: true } = {
  dot: true,
};

export type SketchOpt = SketchPrimOpt | SketchParticleOpt | SketchInstanceOpt;

function isSketchPrimOpt(opt: SketchOpt): opt is SketchPrimOpt {
  return opt.shape in SketchPrimShapes;
}
function isSketchParticleOpt(opt: SketchOpt): opt is SketchParticleOpt {
  return opt.shape in SketchParticleShapes;
}
function isSketchInstanceOpt(opt: SketchOpt): opt is SketchInstanceOpt {
  return opt.shape in SketchInstanceShapes;
}

export interface Sketcher {
  sketchPrimOrInstance: (opt: SketchPrimOpt | SketchInstanceOpt) => SketchEnt;
  sketch: (opt: SketchOpt) => void;
}

const MAX_ENTS = 100;
const MAX_DOTS = 100;

export const SketcherDef = defineResourceWithLazyInit(
  "sketcher",
  [RendererDef, DotsDef],
  (res) => {
    const sketchEntMap = new Map<string, SketchEnt>();
    const sketchEntIdToLastKey = new Map<number, string>();

    let _numLeakedMeshHandles = 0;

    const pool = createEntityPool({
      max: MAX_ENTS,
      maxBehavior: "rand-despawn",
      create: () => {
        const e = SketchObj.new({
          props: {
            key: "invalid",
          },
          args: {
            position: undefined,
            transform: undefined,
            rotation: undefined,
            scale: undefined,
            world: undefined,
            color: undefined,
          },
        });

        return e;
      },
      onSpawn: (e) => {
        EM.tryRemoveComponent(e.id, DeadDef);
      },
      onDespawn: (e) => {
        // TODO(@darzu): this doesn't seem ideal.
        const key = sketchEntIdToLastKey.get(e.id);
        if (key) {
          sketchEntMap.delete(key);
        }
        if (RenderableDef.isOn(e)) {
          _numLeakedMeshHandles++;
          if (_numLeakedMeshHandles % 10 === 0) {
            console.warn(
              `Sketcher has leaked ${_numLeakedMeshHandles} mesh handles!`
            );
          }
        }
        EM.tryRemoveComponent(e.id, RenderableConstructDef); // TODO(@darzu): PERF. urgh, this isn't efficient
        EM.tryRemoveComponent(e.id, RenderableDef);
        EM.set(e, DeadDef);
        e.dead.processed = true;
      },
    });

    const dots = res.dots.allocDots(MAX_DOTS);
    const dotPool = createIdxRing(MAX_DOTS);
    const dotMap = new Map<string, number>();

    // TODO(@darzu): less hacky would be to have a pool per mesh type
    function sketchPrimOrInstance(
      opt: SketchPrimOpt | SketchInstanceOpt
    ): SketchEnt {
      let e: SketchEnt | undefined;
      if (opt.key) e = sketchEntMap.get(opt.key);
      if (!e) {
        const skipPool = opt.key || opt.renderMask;
        if (skipPool) {
          // NOTE: custom key sketches live outside the pool
          e = pool.params.create();
          pool.params.onSpawn(e);
        } else {
          e = pool.spawn();
        }
        const key = opt.key ?? `sketch_ent_${e.id}`;
        sketchEntMap.set(key, e);
        sketchEntIdToLastKey.set(e.id, key);
        e.sketch.key = key;
        // console.log(`new sketch ${key}=${e.id} ${opt.shape}`);
      }

      // update common properties
      V3.copy(e.color, opt.color ?? defaultColor);
      // TODO(@darzu): support alpha properly in lines and points?
      if (opt.alpha !== undefined) EM.set(e, AlphaDef, opt.alpha);
      identityFrame(e);
      // identityFrame(e.world);

      if (opt.renderMask)
        assert(
          !RenderableConstructDef.isOn(e),
          `TODO: support render mask w/ pooled ents`
        );

      if (isSketchPrimOpt(opt)) {
        updatePrimEnt(e, opt);
      } else if (isSketchInstanceOpt(opt)) {
        updateInstanceEnt(e, opt);
      }

      return e;
    }

    const defaultColor = ENDESGA16.lightGreen;

    function sketch(opt: SketchOpt): void {
      // console.log(`sketch ${opt.key ?? "_"} ${opt.shape}`);
      if (isSketchParticleOpt(opt)) {
        assert(opt.shape === "dot");
        let idx: number | undefined;
        if (opt.key) idx = dotMap.get(opt.key);
        if (!idx) {
          idx = dotPool.next();
          const key = opt.key ?? `sketch_dot_${idx}`;
          dotMap.set(key, idx);
        }
        dots.set(idx, opt.v, opt.color ?? defaultColor, opt.radius ?? 1);
        dots.queueUpdate();
      } else {
        sketchPrimOrInstance(opt);
      }
    }

    interface primMeshParam<O extends SketchPrimOpt> {
      newMesh: (o: O) => Mesh;
      updateMesh: (o: O, m: Mesh) => void;
      pool?: CyMeshPoolPtr<any, any>;
    }
    type optForShape<k extends SketchPrimOpt["shape"]> = SketchPrimOpt & {
      shape: k;
    };
    const primMeshParams: {
      [k in SketchPrimOpt["shape"]]: primMeshParam<optForShape<k>>;
    } = {
      line: {
        newMesh: (o) => mkLine(),
        updateMesh: (o, m) => {
          assert(m.dbgName === "line" && m.pos.length === 2);
          V3.copy(m.pos[0], o.start);
          V3.copy(m.pos[1], o.end);
        },
        pool: lineMeshPoolPtr,
      },
      lines: {
        newMesh: (o) => mkLineChain(o.vs.length),
        updateMesh: (o, m) => {
          assert(m.dbgName === "lines", `expected "lines" vs "${m.dbgName}"`);
          assert(
            m.pos.length === o.vs.length,
            `sketch line chain "${o.key}" must stay same size! old:${m.pos.length} vs new:${o.vs.length}`
          );
          for (let i = 0; i < o.vs.length; i++) V3.copy(m.pos[i], o.vs[i]);
        },
        pool: lineMeshPoolPtr,
      },
      lineSegs: {
        newMesh: (o) => mkLineSegs(o.lines.length),
        updateMesh: (o, m) => {
          assert(
            m.dbgName === "lineSegs",
            `expected "lineSegs" vs "${m.dbgName}"`
          );
          assert(
            m.lines!.length === o.lines.length,
            `sketch line segs "${o.key}" must stay same size! old:${
              m.lines!.length
            } vs new:${o.lines.length}`
          );
          for (let i = 0; i < o.lines.length; i++) {
            V3.copy(m.pos[i * 2], o.lines[i][0]);
            V3.copy(m.pos[i * 2 + 1], o.lines[i][1]);
          }
        },
        pool: lineMeshPoolPtr,
      },
      points: {
        newMesh: (o) => mkPointCloud(o.vs.length),
        updateMesh: (o, m) => {
          assert(
            m.dbgName === "points" && m.pos.length === o.vs.length,
            `sketch point cloud must stay same size! ${m.dbgName} ${m.pos.length} vs ${o.vs.length}`
          );
          for (let i = 0; i < o.vs.length; i++) V3.copy(m.pos[i], o.vs[i]);
        },
        pool: pointMeshPoolPtr,
      },
      tri: {
        newMesh: (o) => mkTriangle(),
        updateMesh: (o, m) => {
          assert(m.dbgName === "triangle" && m.pos.length === 3);
          V3.copy(m.pos[0], o.v0);
          V3.copy(m.pos[1], o.v1);
          V3.copy(m.pos[2], o.v2);
        },
        pool: meshPoolPtr,
      },
    };

    function updatePrimEnt(e: SketchEnt, opt: SketchPrimOpt): SketchEnt {
      const meshP = primMeshParams[opt.shape];

      if (!RenderableConstructDef.isOn(e)) {
        const m = meshP.newMesh(opt as any); // TODO(@darzu): hacky casts
        meshP.updateMesh(opt as any, m);
        EM.set(
          e,
          RenderableConstructDef,
          m,
          true,
          undefined,
          opt.renderMask ? opt.renderMask : undefined,
          meshP.pool ?? meshPoolPtr
        );
      } else {
        if (!RenderableDef.isOn(e)) {
          // TODO(@darzu): could queue these instead of dropping them.
          if (WARN_DROPPED_EARLY_SKETCH)
            console.warn(
              `Dropping early prototype draw() b/c .renderable isn't ready`
            );
          return e;
        }
        const h = e.renderable.meshHandle;
        const m = h.mesh;
        meshP.updateMesh(opt as any, m);
        h.pool.updateMeshVertices(h, m);
      }

      return e;
    }

    function updateInstanceEnt(
      e: SketchEnt,
      opt: SketchInstanceOpt
    ): SketchEnt {
      if (!RenderableConstructDef.isOn(e)) {
        let instance: MeshReg;
        let pool: CyMeshPoolPtr<any, any>;
        if (opt.shape === "cube") {
          instance = UnitCubeMesh;
          pool = meshPoolPtr;
        } else if (opt.shape === "aabb") {
          instance = WireUnitCubeMesh;
          pool = lineMeshPoolPtr;
        } else never(opt);

        EM.set(
          e,
          RenderableConstructDef,
          instance,
          true,
          undefined,
          opt.renderMask ? opt.renderMask : undefined,
          pool
        );
      } else {
        if (!RenderableDef.isOn(e)) {
          // TODO(@darzu): could queue these instead of dropping them.
          if (WARN_DROPPED_EARLY_SKETCH)
            console.warn(
              `Dropping early prototype draw() b/c .renderable isn't ready`
            );
          return e;
        }
        // nothing to do?
      }

      if (opt.shape === "cube") {
        const halfsize = opt.halfsize ?? 1;
        EM.set(e, ScaleDef, [halfsize, halfsize, halfsize]);
        EM.set(e, PositionDef, opt.pos);
      } else if (opt.shape === "aabb") {
        EM.set(e, PositionDef, opt.aabb.min);
        EM.set(e, ScaleDef, [
          opt.aabb.max[0] - opt.aabb.min[0],
          opt.aabb.max[1] - opt.aabb.min[1],
          opt.aabb.max[2] - opt.aabb.min[2],
        ]);
      } else never(opt);

      return e;
    }

    const result: Sketcher = {
      sketch,
      sketchPrimOrInstance,
    };

    return result;
  }
);

export async function sketch(opt: SketchOpt): Promise<void> {
  // TODO(@darzu): de-dupe
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) {
    sketcher.sketch(opt);
  } else {
    // NOTE: this should be rarely done b/c once the resource is present we'll skip this
    const cloneOpt = cloneTmpsInObj(opt);
    sketcher = (await EM.whenResources(SketcherDef)).sketcher;
    sketcher.sketch(cloneOpt);
  }
}
export async function sketchEnt(
  opt: SketchPrimOpt | SketchInstanceOpt
): Promise<SketchEnt> {
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) {
    return sketcher.sketchPrimOrInstance(opt);
  } else {
    // NOTE: this should be rarely done b/c once the resource is present we'll skip this
    const cloneOpt = cloneTmpsInObj(opt);
    sketcher = (await EM.whenResources(SketcherDef)).sketcher;
    return sketcher.sketchPrimOrInstance(cloneOpt);
  }
}

export function sketchEntNow(opt: SketchPrimOpt): SketchEnt | undefined {
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) return sketcher.sketchPrimOrInstance(opt);
  return undefined;
}

export async function sketchLine(
  start: V3.InputT,
  end: V3.InputT,
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ start, end, shape: "line", ...opt });
}
export async function sketchRay(
  ray: Ray,
  opt: SketchBaseOpt & { length?: number } = {}
): Promise<SketchEnt> {
  const end = V3.addScaled(ray.org, ray.dir, opt.length ?? 10);
  return sketchEnt({ start: ray.org, end, shape: "line", ...opt });
}
export async function sketchLine2(
  line: Line,
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  const end = getLineEnd(V3.tmp(), line);
  return sketchEnt({ start: line.ray.org, end, shape: "line", ...opt });
}

export async function sketchQuat(
  orig: V3.InputT,
  rot: quat.InputT,
  opt: SketchBaseOpt & { length?: number } = {}
) {
  const len = opt.length ?? 10;
  const fwd = quat.fwd(rot);
  V3.scale(fwd, len, fwd);
  V3.add(fwd, orig, fwd);
  return sketchLine(orig, fwd, opt);
}

export async function sketchYawPitch(
  orig: V3.InputT,
  yaw: number = 0,
  pitch: number = 0,
  opt: SketchBaseOpt & { length?: number } = {}
) {
  const rot = quat.fromYawPitchRoll(yaw, pitch);
  return sketchQuat(orig, rot, opt);
}

export async function sketchPoints(
  vs: V3.InputT[],
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ vs, shape: "points", ...opt });
}

export async function sketchLines(
  vs: V3.InputT[],
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ vs, shape: "lines", ...opt });
}
export async function sketchLineSegs(
  lines: [V3.InputT, V3.InputT][],
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ lines, shape: "lineSegs", ...opt });
}

export async function sketchDot(
  v: V3.InputT,
  radius?: number,
  opt: SketchBaseOpt = {}
): Promise<void> {
  return sketch({ v, radius, shape: "dot", ...opt });
}

export function sketchTri(
  v0: V3.InputT,
  v1: V3.InputT,
  v2: V3.InputT,
  opt: SketchBaseOpt = {}
): Promise<void> {
  return sketch({ v0, v1, v2, shape: "tri", ...opt });
}

const _t3 = V3.mk();
const _t4 = V3.mk();
export function sketchFan(
  origin: V3.InputT,
  dir1: V3.InputT,
  dir2: V3.InputT,
  opt: SketchBaseOpt = {}
): Promise<void> {
  const v0 = origin;
  const v1 = V3.add(origin, dir1, _t3);
  const v2 = V3.add(origin, dir2, _t4);
  return sketchTri(v0, v1, v2, opt);
}

export async function sketchSvgC(
  svgC: CompiledSVG,
  opt: SketchBaseOpt & {
    origin?: V3.InputT;
    numPerInstr?: number;
  } = {}
): Promise<SketchEnt> {
  // vs.push(V3.copy(V3.tmp(), vs[0]));
  const segs = svgToLineSeg(svgC, opt);
  return sketchLineSegs(segs, opt);
}
export async function sketchSvg(
  svg: SVG,
  opt: SketchBaseOpt & {
    origin?: V3.InputT;
    numPerInstr?: number;
  } = {}
): Promise<SketchEnt> {
  return sketchSvgC(compileSVG(svg), opt);
}

export async function sketchAABB(
  aabb: AABB,
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ shape: "aabb", aabb, ...opt });
}

export const SketchTrailDef = EM.defineComponent("sketchTrail", () => true);

EM.addEagerInit([SketchTrailDef], [], [], () => {
  const N = 20;
  const eToVs = new Map<number, V3[]>();
  const getVs = (id: number) => {
    let vs = eToVs.get(id);
    if (!vs) {
      vs = range(N).map((_) => V3.mk());
      eToVs.set(id, vs);
    }
    return vs;
  };
  // TODO(@darzu): MOVE. And is this at all performant?
  function rotate<T>(ts: T[]): T[] {
    const tl = ts.pop();
    ts.unshift(tl!);
    return ts;
  }
  EM.addSystem(
    "sketchEntityTrail",
    Phase.GAME_WORLD,
    [SketchTrailDef, WorldFrameDef],
    [TimeDef, SketcherDef],
    (es, res) => {
      for (let e of es) {
        const vs = getVs(e.id);
        if (V3.equals(vs[0], e.world.position)) continue;
        if (res.time.step % 10 === 0) rotate(vs);
        V3.copy(vs[0], e.world.position);

        let lastI = 0;
        for (let i = 0; i < vs.length; i++) {
          if (V3.equals(vs[i], V3.ZEROS)) {
            V3.copy(vs[i], vs[lastI]);
          } else {
            lastI = i;
          }
        }

        const key = "sketchTrail_" + e.id;
        assert(vs.length === N);
        const color = ColorDef.isOn(e) ? e.color : ENDESGA16.lightGray;
        res.sketcher.sketch({ shape: "lines", vs, key, color });
      }
    }
  );
});
