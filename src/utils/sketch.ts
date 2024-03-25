import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { defineResourceWithInit as defineResourceWithLazyInit } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { Phase } from "../ecs/sys-phase.js";
import { DotsDef } from "../graybox/dots.js";
import { ObjChildEnt, T, defineObj } from "../graybox/objects.js";
import { V3, cloneTmpsInObj, quat, tV } from "../matrix/sprig-matrix.js";
import { Mesh } from "../meshes/mesh.js";
import {
  mkLine,
  mkLineChain,
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
import { CompiledSVG, SVG, compileSVG } from "./svg.js";
import { never } from "./util-no-import.js";
import { assert, range } from "./util.js";

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

export interface SketchDotOpt {
  shape: "dot";
  v: V3.InputT;
  radius?: number;
}

export type SketchEntOpt = SketchBaseOpt &
  (
    | SketchLineOpt
    | SketchPointsOpt
    | SketchLinesOpt
    | SketchCubeOpt
    | SketchTriOpt
  );

export type SketchOpt = SketchEntOpt | (SketchBaseOpt & SketchDotOpt);

export interface Sketcher {
  sketchEnt: (opt: SketchEntOpt) => SketchEnt;
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
        EM.tryRemoveComponent(e.id, RenderableConstructDef);
        EM.tryRemoveComponent(e.id, RenderableDef);
        EM.set(e, DeadDef);
        e.dead.processed = true;
      },
    });

    const dots = res.dots.allocDots(MAX_DOTS);
    const dotPool = createIdxRing(MAX_DOTS);
    const dotMap = new Map<string, number>();

    // TODO(@darzu): less hacky would be to have a pool per mesh type
    function sketchEnt(opt: SketchEntOpt): SketchEnt {
      let e: SketchEnt | undefined;
      if (opt.key) e = sketchEntMap.get(opt.key);
      if (!e) {
        if (opt.key) {
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

      updateEnt(e, opt);

      return e;
    }

    const defaultColor = ENDESGA16.lightGreen;

    function sketch(opt: SketchOpt): void {
      // console.log(`sketch ${opt.key ?? "_"} ${opt.shape}`);
      if (opt.shape === "dot") {
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
        sketchEnt(opt);
      }
    }

    interface meshParam<O extends SketchEntOpt> {
      newMesh: (o: O) => Mesh;
      updateMesh: (o: O, m: Mesh) => void;
      pool?: CyMeshPoolPtr<any, any>;
    }

    type optForShape<k extends SketchEntOpt["shape"]> = SketchEntOpt & {
      shape: k;
    };
    const meshParams: {
      [k in SketchEntOpt["shape"]]: meshParam<optForShape<k>>;
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
      cube: {
        newMesh: (o) => {
          throw "todo cube";
        },
        updateMesh: (o, m) => {
          throw "todo cube";
        },
      },
    };

    function updateEnt(e: SketchEnt, opt: SketchEntOpt): SketchEnt {
      V3.copy(e.color, opt.color ?? defaultColor);

      // TODO(@darzu): support alpha properly in lines and points?
      if (opt.alpha !== undefined) EM.set(e, AlphaDef, opt.alpha);

      identityFrame(e);
      // identityFrame(e.world);

      const meshP = meshParams[opt.shape];

      if (!RenderableConstructDef.isOn(e)) {
        const m = meshP.newMesh(opt as any); // TODO(@darzu): hacky casts
        meshP.updateMesh(opt as any, m);
        EM.set(
          e,
          RenderableConstructDef,
          m,
          true,
          undefined,
          undefined,
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

    const result: Sketcher = {
      sketch,
      sketchEnt,
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
export async function sketchEnt(opt: SketchEntOpt): Promise<SketchEnt> {
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) {
    return sketcher.sketchEnt(opt);
  } else {
    // NOTE: this should be rarely done b/c once the resource is present we'll skip this
    const cloneOpt = cloneTmpsInObj(opt);
    sketcher = (await EM.whenResources(SketcherDef)).sketcher;
    return sketcher.sketchEnt(cloneOpt);
  }
}

export function sketchEntNow(opt: SketchEntOpt): SketchEnt | undefined {
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) return sketcher.sketchEnt(opt);
  return undefined;
}

export async function sketchLine(
  start: V3.InputT,
  end: V3.InputT,
  opt: SketchBaseOpt = {}
): Promise<SketchEnt> {
  return sketchEnt({ start, end, shape: "line", ...opt });
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
    num?: number;
  } = {}
): Promise<SketchEnt> {
  const num = opt.num ?? 10;
  assert(num >= 1);
  const vs: V3.InputT[] = [];
  for (let i = 0; i < num; i++) {
    const t = i / num - 1;
    const v2 = svgC.fn(t);
    const v3 = tV(v2[0], v2[1], 0);
    if (opt.origin) V3.add(v3, opt.origin, v3);
    vs.push(v3);
  }
  vs.push(V3.copy(V3.tmp(), vs[0]));
  return sketchLines(vs, opt);
}
export async function sketchSvg(
  svg: SVG,
  opt: SketchBaseOpt & {
    origin?: V3.InputT;
    num?: number;
  } = {}
): Promise<SketchEnt> {
  return sketchSvgC(compileSVG(svg), opt);
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
