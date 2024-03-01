import { ColorDef, TintsDef } from "../color/color-ecs.js";
import { DeadDef } from "../ecs/delete.js";
import { EM, Entity } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { ObjChildEnt, T, createObj, defineObj } from "../graybox/objects.js";
import {
  V3,
  cloneTmpsInObj,
  findAnyTmpVec,
  quat,
} from "../matrix/sprig-matrix.js";
import { mkLine } from "../meshes/primatives.js";
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
import { lineMeshPoolPtr } from "../render/pipelines/std-line.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
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
export type Sketch = ObjChildEnt<typeof SketchObj>;

export type SketchOpt = {
  key?: string;
  // lifeMs?: number;
  color?: V3.InputT;
} & (
  | {
      shape: "line";
      start: V3.InputT;
      end: V3.InputT;
    }
  | {
      shape: "cube";
      halfsize?: number;
    }
);

export interface Sketcher {
  sketch: (opt: SketchOpt) => Sketch;
}

export const SketcherDef = EM.defineResource("sketcher", (p: Sketcher) => p);

EM.addLazyInit([RendererDef], [SketcherDef], (res) => {
  const pool = createEntityPool({
    max: 100,
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

  const sketchMap = new Map<string, Sketch>();

  function sketch(opt: SketchOpt): Sketch {
    let e: Sketch | undefined;
    if (opt.key) e = sketchMap.get(opt.key);
    if (!e) {
      e = pool.spawn();
      const key = opt.key ?? `proto_${e.id}`;
      sketchMap.set(key, e);
      e.sketch.key = key;
    }

    update(e, opt);

    return e;
  }

  function update(e: Sketch, opt: SketchOpt): Sketch {
    if (opt.color) V3.copy(e.color, opt.color);

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
    } else if (opt.shape === "cube") {
      throw "TODO cube";
    } else never(opt);

    return e;
  }

  EM.addResource(SketcherDef, {
    sketch,
  });
});

export async function sketch(opt: SketchOpt): Promise<Sketch> {
  let sketcher = EM.getResource(SketcherDef);
  if (sketcher) {
    return sketcher.sketch(opt);
  } else {
    // NOTE: this should be rarely done b/c once the resource is present we'll skip this
    const cloneOpt = cloneTmpsInObj(opt);
    sketcher = (await EM.whenResources(SketcherDef)).sketcher;
    return sketcher.sketch(cloneOpt);
  }
}
