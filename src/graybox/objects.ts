import { ComponentDef, EntityW } from "../ecs/entity-manager.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { Intersect } from "../utils/util.js";

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
// TODO(@darzu): NAMESPACES? each object and in-line child defines a new component so
//    the component namespaces could become quite cluttered?
// TODO(@darzu): SYSTEMS: how do objects interact w/ systems? Can you match against
//  an object instead of (or in addition to?) a set of components?

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
  // data ?
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

function createObj<D extends ObjDef, A extends ObjArgs<D>>(
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
  const ship = createObj(ShipObj, {
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
