import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import {
  ComponentDef,
  EM,
  EntityW,
  _ComponentDef,
} from "../ecs/entity-manager.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh } from "../meshes/mesh-list.js";
import { HEX_AABB } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { Intersect } from "../utils/util.js";
import { addWorldGizmo } from "../utils/utils-game.js";

/*
OBJECTS
goals:
  hierarchy of entities w/ nice bi pointer syntax
  declarative components instead of code

an object has:
  a set of components
  and any number of nested objects
  optionally those are physics parented
  optionally custom component (w/ properties or just tag)
  optional constructor w/ build resources
  optionally pool'ed
  optionally works w/ net constructors etc.

  e.g.
    ship
      { cuttingEnable: true }
      mast
        sail
      rudder
      cannonL
      cannonR
*/

// TODO(@darzu): custom component properties on object definition
// TODO(@darzu): Refactor abstraction?
//  1. child-tracking component,
//  2. set of components,
//  3. and custom component
// could all be seperate concerns.
// TODO(@darzu): MULTIPLAYER: this doesn't work w/ netEntityHelper
// TODO(@darzu): POOLS: this doesn't work with entity pools

function defineObj<
  N extends string,
  CS extends readonly ComponentDef[],
  C extends undefined | Record<string, ObjDef>
>(def: ObjDef<N, CS, C>): ObjDef<N, CS, C> {
  // TODO(@darzu): define the custom components here
  throw `todo defineObject`;
  return def;
}

// defines an "object" which is an entity w/ a set of components
//   and children objects
interface ObjDef<
  N extends string = string,
  CS extends readonly ComponentDef[] = any[],
  C extends undefined | Record<string, ObjDef> = {}
> {
  name: N;
  components: readonly [...CS];
  children?: C;
}

// the component def the tracks the children and custom data of the object
type ObjComponentDef<D extends ObjDef> = D extends ObjDef<infer N, any, infer C>
  ? C extends Record<string, ObjDef>
    ? ComponentDef<N, { [n in keyof C]: ObjEnt<C[n]> }, [], []>
    : ComponentDef<N, {}, [], []>
  : never;

// the entity and all components of an object
type ObjEnt<D extends ObjDef> = D extends ObjDef<any, infer CS>
  ? EntityW<[ObjComponentDef<D>, ...CS]>
  : never;

// the arguments needed to construct an object
type _ObjArgs<D extends ObjDef> = D extends ObjDef<any, infer CS>
  ? Intersect<{
      [i in keyof CS]: CS[i] extends ComponentDef<
        infer N,
        any,
        infer CArgs,
        infer UArgs
      >
        ? { [_ in N]: [...CArgs, ...UArgs] }
        : never;
    }>
  : undefined;
type ObjArgs<D extends ObjDef> = D extends ObjDef<any, any, infer C>
  ? C extends Record<any, any>
    ? {
        args: _ObjArgs<D>;
        children: C extends Record<any, any>
          ? {
              [n in keyof C]: ObjArgs<C[n]>;
            }
          : undefined;
      }
    : {
        args: _ObjArgs<D>;
      }
  : never;

function createObject<D extends ObjDef, A extends ObjArgs<D>>(
  def: D,
  args: A
): ObjEnt<D> {
  throw "TODO createObject";
}

const CannonObj = defineObj({
  name: "cannon",
  components: [PositionDef],
});
const ShipObj = defineObj({
  name: "ship",
  components: [PositionDef, RenderableConstructDef],
  children: {
    mast: {
      name: "mast",
      components: [ScaleDef],
      children: {
        sail: {
          name: "sail",
          components: [RotationDef],
        },
      },
    },
    cannonL: CannonObj,
    cannonR: CannonObj,
  },
} as const);

type __t5 = (typeof ShipObj)["children"];
type __t3<D extends ObjDef> = D extends ObjDef<infer N, any, infer C>
  ? // Intersect<{ [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }>
    // { [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }
    {
      [n in keyof C]: C[n] extends ObjDef<infer CN, infer CS>
        ? // ? Obj<ObjDefinition<N2, [...CS]>>
          EntityW<[...CS]>
        : never;
    }
  : // Obj<COS[0][1]>

    never;
type __t4 = __t3<typeof ShipObj>;
let __o4 = null as unknown as __t4;
const l23 = __o4.mast.scale;

type __t1 = ObjComponentDef<typeof ShipObj>;
type __t2 = ObjEnt<typeof ShipObj>;
// type __t1 = ReturnType<typeof createObject<typeof ShipObj>>;

function testGrayHelpers() {
  const ship = createObject(ShipObj, {
    args: {
      position: [V(0, 0, 0)],
      renderableConstruct: [CubeMesh],
    },
    children: {
      mast: {
        args: {
          scale: [V(1, 1, 1)],
        },
        children: {
          sail: {
            args: {
              rotation: [],
            },
          },
        },
      },
      cannonL: {
        args: {
          position: [V(1, 0, 0)],
        },
      },
      cannonR: {
        args: {
          position: [V(1, 0, 0)],
        },
      },
    },
  });

  ship.position;
  // const cl = ship.ship["cannonL"];
  const cl = ship.ship.cannonL;
  const m = ship.ship.mast.mast.sail;
  const mp = m.rotation;
}
// const ShipDef = defineObject("ship", {
//   position: [V(0,0,0)],
//   scale: [V(1,1,1)],
//   renderableConstruct: [CubeMesh, true],
// }

export async function initWorld() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  vec3.set(-200, -200, -200, camera.maxWorldAABB.min);
  vec3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // light
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, RenderableConstructDef, CubeMesh, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 10, 300));

  // pedestal
  const pedestal = EM.new();
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
  EM.set(pedestal, PositionDef, V(0, 0, -10));
  EM.set(pedestal, ScaleDef, V(10, 10, 10));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });

  // gizmo
  addWorldGizmo(V(0, 0, 0), 5);
}

export function initGhost() {
  const g = createGhost(CubeMesh);
  g.controllable.speed *= 10;
  g.controllable.sprintMul = 0.2;
  g.position[2] = 5;

  // hover near origin
  vec3.copy(g.position, [7.97, -12.45, 10.28]);
  quat.copy(g.rotation, [0.0, 0.0, 0.27, 0.96]);
  vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.55;

  return g;
}
