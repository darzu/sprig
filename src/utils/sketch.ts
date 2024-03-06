import { ColorDef, TintsDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { defineResourceWithInit as defineResourceWithLazyInit } from "../ecs/em-helpers.js";
import { EM, Entity } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { DotsDef } from "../graybox/dots.js";
import { ObjChildEnt, T, createObj, defineObj } from "../graybox/objects.js";
import {
  V3,
  cloneTmpsInObj,
  findAnyTmpVec,
  quat,
} from "../matrix/sprig-matrix.js";
import { mkLine, mkLineChain, mkPointCloud } from "../meshes/primatives.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PositionDef,
  RotationDef,
  ScaleDef,
  TransformDef,
  createFrame,
  identityFrame,
} from "../physics/transform.js";
import { isMeshHandle } from "../render/mesh-pool.js";
import {
  lineMeshPoolPtr,
  pointMeshPoolPtr,
} from "../render/pipelines/std-line.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { createIdxPool, createIdxRing } from "./idx-pool.js";
import { never } from "./util-no-import.js";
import { assert, dbgLogOnce } from "./util.js";

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

// obj key, poo

export const SketchObj = defineObj({
  name: "sketch",
  propsType: T<{ key: string }>(),
  components: [
    PositionDef,
    RotationDef,
    ScaleDef,
    TransformDef,
    WorldFrameDef,
    ColorDef,
  ],
});
export type SketchEnt = ObjChildEnt<typeof SketchObj>;

export interface SketchBaseOpt {
  key?: string;
  // lifeMs?: number;
  color?: V3.InputT;
}

export interface SketchLineOpt {
  shape: "line";
  start: V3.InputT;
  end: V3.InputT;
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
  (SketchLineOpt | SketchPointsOpt | SketchLinesOpt | SketchCubeOpt);

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
        EM.set(e, DeadDef);
        e.dead.processed = true;
      },
    });

    const sketchEntMap = new Map<string, SketchEnt>();

    const dots = res.dots.allocDots(MAX_DOTS);
    const dotPool = createIdxRing(MAX_DOTS);
    const dotMap = new Map<string, number>();

    function sketchEnt(opt: SketchEntOpt): SketchEnt {
      let e: SketchEnt | undefined;
      if (opt.key) e = sketchEntMap.get(opt.key);
      if (!e) {
        e = pool.spawn();
        const key = opt.key ?? `sketch_ent_${e.id}`;
        sketchEntMap.set(key, e);
        e.sketch.key = key;
      }

      updateEnt(e, opt);

      return e;
    }

    const defaultColor = ENDESGA16.lightGreen;

    function sketch(opt: SketchOpt): void {
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

    function updateEnt(e: SketchEnt, opt: SketchEntOpt): SketchEnt {
      V3.copy(e.color, opt.color ?? defaultColor);

      identityFrame(e);
      identityFrame(e.world);

      if (opt.shape === "line") {
        if (!RenderableConstructDef.isOn(e)) {
          const m = mkLine();
          V3.copy(m.pos[0], opt.start);
          V3.copy(m.pos[1], opt.end);
          EM.set(
            e,
            RenderableConstructDef,
            m,
            true,
            undefined,
            undefined,
            lineMeshPoolPtr
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
          assert(m.dbgName === "line" && m.pos.length === 2);
          V3.copy(m.pos[0], opt.start);
          V3.copy(m.pos[1], opt.end);
          h.pool.updateMeshVertices(h, m, 0, 2);
        }
      } else if (opt.shape === "points") {
        if (!RenderableConstructDef.isOn(e)) {
          const m = mkPointCloud(opt.vs.length);
          for (let i = 0; i < opt.vs.length; i++) V3.copy(m.pos[i], opt.vs[i]);
          EM.set(
            e,
            RenderableConstructDef,
            m,
            true,
            undefined,
            undefined,
            pointMeshPoolPtr
          );
        } else {
          if (!RenderableDef.isOn(e)) {
            if (WARN_DROPPED_EARLY_SKETCH)
              console.warn(
                `Dropping early prototype draw() b/c .renderable isn't ready`
              );
            return e;
          }
          const h = e.renderable.meshHandle;
          const m = h.mesh;
          assert(
            m.dbgName === "points" && m.pos.length === opt.vs.length,
            `sketch point cloud must stay same size! ${m.dbgName} ${m.pos.length} vs ${opt.vs.length}`
          );
          for (let i = 0; i < opt.vs.length; i++) V3.copy(m.pos[i], opt.vs[i]);
          h.pool.updateMeshVertices(h, m);
        }
      } else if (opt.shape === "lines") {
        if (!RenderableConstructDef.isOn(e)) {
          const m = mkLineChain(opt.vs.length);
          for (let i = 0; i < opt.vs.length; i++) V3.copy(m.pos[i], opt.vs[i]);
          EM.set(
            e,
            RenderableConstructDef,
            m,
            true,
            undefined,
            undefined,
            lineMeshPoolPtr
          );
        } else {
          if (!RenderableDef.isOn(e)) {
            if (WARN_DROPPED_EARLY_SKETCH)
              console.warn(
                `Dropping early prototype draw() b/c .renderable isn't ready`
              );
            return e;
          }
          const h = e.renderable.meshHandle;
          const m = h.mesh;
          assert(
            m.dbgName === "lines" && m.pos.length === opt.vs.length,
            `sketch line chain must stay same size! ${m.dbgName} ${m.pos.length} vs ${opt.vs.length}`
          );
          for (let i = 0; i < opt.vs.length; i++) V3.copy(m.pos[i], opt.vs[i]);
          h.pool.updateMeshVertices(h, m);
        }
      } else if (opt.shape === "cube") {
        throw "TODO cube";
      } else never(opt);

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
