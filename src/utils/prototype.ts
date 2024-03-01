import { ColorDef, TintsDef } from "../color/color-ecs.js";
import { DeadDef } from "../ecs/delete.js";
import { EM, Entity } from "../ecs/entity-manager.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { ObjChildEnt, T, createObj, defineObj } from "../graybox/objects.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PositionDef,
  RotationDef,
  ScaleDef,
  createFrame,
} from "../physics/transform.js";
import { isMeshHandle } from "../render/mesh-pool.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { never } from "./util-no-import.js";

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

const ProtoObj = defineObj({
  name: "proto",
  propsType: T<{ key: string }>(),
  components: [PositionDef, RotationDef, ScaleDef, WorldFrameDef, ColorDef],
});
type Proto = ObjChildEnt<typeof ProtoObj>;

type ProtoOpt = {
  key: string;
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

interface Prototyper {
  draw: (opt: ProtoOpt) => Proto;
}

export const PrototyperDef = EM.defineResource(
  "prototyper",
  (p: Prototyper) => p
);

EM.addLazyInit([RendererDef], [PrototyperDef], (res) => {
  const pool = createEntityPool(
    // < [typeof ColorDef, typeof PositionDef, typeof ScaleDef]>
    {
      max: 100,
      maxBehavior: "rand-despawn",
      create: () => {
        const e = ProtoObj.new({
          props: {
            key: "invalid",
          },
          args: {
            position: undefined,
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
    }
  );

  const protoMap = new Map<string, Proto>();

  function draw(opt: ProtoOpt): Proto {
    let e = protoMap.get(opt.key);
    if (!e) {
      e = pool.spawn();
      protoMap.set(opt.key, e);
      e.proto.key = opt.key;
    }

    updateProto(e, opt);

    return e;
  }

  EM.addResource(PrototyperDef, {
    draw,
  });
});

function updateProto(e: Proto, opt: ProtoOpt): Proto {
  if (opt.color) V3.copy(e.color, opt.color);

  if (opt.shape === "line") {
    throw "TODO line";
  } else if (opt.shape === "cube") {
    throw "TODO cube";
  } else never(opt);

  return e;
}

export async function draw(opt: ProtoOpt): Promise<Proto> {
  const { prototyper } = await EM.whenResources(PrototyperDef);
  return prototyper.draw(opt);
}
