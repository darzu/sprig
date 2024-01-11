import { ComponentDef, EM, EntityW } from "../ecs/entity-manager.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { Intersect } from "../utils/util.js";

/*
OBJECTS
goals:
  hierarchy of entities w/ nice bi pointer syntax
  declarative components instead of imperative code

an object has:
  [x] a set of components
  [x] and any number of nested objects
  [ ] optionally those are physics parented
  [x] optionally custom component (w/ properties or just tag)
  [ ] optional constructor w/ build resources
  [ ] optionally entity-pool'ed
    [ ] "just" add onSpawn/onDespawn ?
  [ ] optionally works w/ multiplayer and netEntityHelper etc.
    note: defineNetEntityHelper has local vs props component distinction

  e.g.
    ship
      { cuttingEnable: true }
      mast
        sail
      rudder
      cannonL
      cannonR
*/
// TODO(@darzu): MULTIPLAYER: this uses non-updatable component
// TODO(@darzu): POOLS: this doesn't work with entity pools
//    To work with pools we just need onSpawn, onDespawn
// TODO(@darzu): NAMESPACES? each object and in-line child defines a new component so
//    the component namespaces could become quite cluttered?
// TODO(@darzu): SYSTEMS: how do objects interact w/ systems? Can you match against
//  an object instead of (or in addition to?) a set of components?

// defines an "object" which is an entity w/ a set of components
//   and children objects
export interface ObjDefOpts<
  N extends string = string,
  CS extends readonly ComponentDef[] = any[],
  C extends undefined | Record<string, ObjDefOpts | ObjDef> = {},
  P extends object = any
  // CArgs extends any[] = any,
  // UArgs extends any[] = any
> {
  name: N;
  components: readonly [...CS];
  // TODO(@darzu): dang TS doesn't let you partially pass type parameters.
  //   So defineObject<MyPropsType>() doesn't work.
  //   And I can't seem to make it work using:
  //      dataType: (d: D) => void;
  //    plus helper function: "function T<N>() {}"
  //  actually using "D extends {} = any" works, but T doesn't.
  // TODO(@darzu): HACK. this is a function b/c that lets us annotate a type in
  //  a data structure. Otherwise there's no good way to pass a type parameter.
  propsType?: (p: P) => void;
  // props?: () => P;
  // updateProps?: (p: P, ...args: UArgs) => P;
  children?: C;
}

export interface ObjDef<D extends ObjDefOpts = ObjDefOpts> {
  opts: D;
  props: ObjComponentDef<D>;
  children: Record<string, ObjDef>;
}

function isObjDef(d: ObjDef | ObjDefOpts): d is ObjDef {
  return "opts" in d;
}

// helper to grab opts from def or opts
type ObjOpts<D extends ObjDef | ObjDefOpts> = D extends ObjDef ? D["opts"] : D;

// the component def the tracks the children and custom data of the object
type _ObjComponentP<
  C extends undefined | Record<string, ObjDefOpts | ObjDef>,
  P extends Object
> = C extends Record<string, ObjDefOpts | ObjDef>
  ? { [n in keyof C]: ObjEnt<ObjOpts<C[n]>> } & P
  : P;
type ObjComponentDef<D extends ObjDefOpts> = D extends ObjDefOpts<
  infer N,
  any,
  infer C,
  infer P
>
  ? ComponentDef<N, _ObjComponentP<C, P>, [ObjArgs<D>], []>
  : never;

// the entity and all components of an object
export type ObjEnt<D extends ObjDefOpts = ObjDefOpts> = D extends ObjDefOpts<
  any,
  infer CS
>
  ? EntityW<[ObjComponentDef<D>, ...CS]>
  : never;

// the arguments needed to construct an object
type _ObjArgs<D extends ObjDefOpts> = D extends ObjDefOpts<any, infer CS>
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
export type ObjArgs<D extends ObjDefOpts = ObjDefOpts> = D extends ObjDefOpts<
  any,
  any,
  infer C,
  infer P
>
  ? {
      args: _ObjArgs<D>;
    } & (C extends Record<any, any>
      ? {
          children: C extends Record<any, any>
            ? {
                [n in keyof C]: ObjArgs<ObjOpts<C[n]>>;
              }
            : undefined;
        }
      : { children?: undefined }) &
      ({} extends P
        ? {
            props?: undefined;
          }
        : {
            props: P;
          })
  : never;

export function defineObj<
  N extends string,
  CS extends readonly ComponentDef[],
  C extends undefined | Record<string, ObjDefOpts | ObjDef>,
  P extends object
  // O extends ObjDefOpts<N, CS, C, P> = ObjDefOpts<N, CS, C, P>
  // CArgs extends any[],
  // UArgs extends any[]
  // >(opts: O): ObjDef<O> {
>(opts: ObjDefOpts<N, CS, C, P>): ObjDef<ObjDefOpts<N, CS, C, P>> {
  type O = ObjDefOpts<N, CS, C, P>;

  // define children
  const childDefs: Record<string, ObjDef> = {};
  if (opts.children) {
    for (let cName of Object.keys(opts.children)) {
      const defOrOpts = opts.children[cName];
      childDefs[cName] = isObjDef(defOrOpts) ? defOrOpts : defineObj(defOrOpts);
    }
  }

  const createChildrenObjsAndProps = function (
    args: ObjArgs<O>
  ): _ObjComponentP<C, P> {
    // create children objects
    const childEnts: Record<string, ObjEnt> = {};
    if (args.children) {
      for (let cName of Object.keys(args.children)) {
        const cArgs: ObjArgs = args.children[cName];
        const cDef: ObjDef = childDefs[cName];
        const cEnt = createObj(cDef, cArgs);
        childEnts[cName] = cEnt;
      }
    }

    const p: P | {} = args.props ?? {};

    // TODO(@darzu): we could probably strengthen these types to remove all casts
    const res = {
      ...childEnts,
      ...p,
    } as _ObjComponentP<C, P>;

    return res;
  };

  // TODO(@darzu): Use updatable componets instead; see notes in entity-manager.ts
  const props: ObjComponentDef<O> = EM.defineNonupdatableComponent(
    opts.name,
    createChildrenObjsAndProps
  );

  const def: ObjDef<O> = {
    opts,
    props,
    children: childDefs,
  };

  return def;
}

export function createObj<D extends ObjDef, A extends ObjArgs<D["opts"]>>(
  def: D,
  args: A
): ObjEnt<D["opts"]> {
  // create entity
  const e = EM.new();

  // add components
  const cArgs = args.args as Record<string, any[]>;
  for (let cDef of def.opts.components as ComponentDef[]) {
    cArgs[cDef.name];
    EM.set(e, cDef, ...cArgs[cDef.name]);
  }

  // add props (which creates children)
  EM.set(e, def.props, args);

  // TODO(@darzu): there's probably some extreme type-foo that could do this impl w/o cast
  return e as ObjEnt<D["opts"]>;
}

export function T<N extends {}>(): (p: N) => void {
  return (p: N) => {};
}

export function testObjectTS() {
  const CannonObj = defineObj({
    name: "cannon",
    components: [PositionDef],
  });
  const ShipObj = defineObj({
    name: "ship",
    propsType: T<{ myProp: number }>(),
    // updateProps: (p, n: number) => {
    //   p.myProp = n;
    //   return p;
    // },
    // dataType: (p: { myProp: number }) => {},
    components: [PositionDef, RenderableConstructDef],
    children: {
      mast: {
        name: "mast2",
        components: [ScaleDef],
        children: {
          sail: {
            name: "sail2",
            components: [RotationDef],
          },
        },
      },
      cannonL: CannonObj,
      cannonR: CannonObj,
    },
  } as const);

  type __t0 = (typeof ShipObj)["opts"];
  type __t5 = (typeof ShipObj)["opts"]["children"];
  type __t3<D extends ObjDefOpts> = D extends ObjDefOpts<infer N, any, infer C>
    ? // Intersect<{ [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }>
      // { [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }
      {
        [n in keyof C]: C[n] extends ObjDefOpts<infer CN, infer CS>
          ? // ? Obj<ObjDefinition<N2, [...CS]>>
            EntityW<[...CS]>
          : never;
      }
    : // Obj<COS[0][1]>

      never;
  type __t4 = __t3<__t0>;

  if (!"true") {
    let __o4 = null as unknown as __t4;
    const l23 = __o4.mast.scale;
  }

  type __t1 = ObjComponentDef<__t0>;
  type __t2 = ObjEnt<__t0>;
  // type __t1 = ReturnType<typeof createObject<typeof ShipObj>>;

  type __t6<D extends ObjDefOpts> = D extends ObjDefOpts<
    infer N,
    any,
    infer C,
    infer P
  >
    ? P
    : never;
  type __t7 = __t6<__t0>;

  type __t8 = ObjArgs<__t0>["children"];

  console.log("testGrayHelpers".toUpperCase());
  console.dir(ShipObj);
  const ship = createObj(ShipObj, {
    props: {
      myProp: 7,
    },
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
  console.dir(ship);

  ship.ship.myProp = 8;
  ship.position;
  // const cl = ship.ship["cannonL"];
  const cl = ship.ship.cannonL;
  const m = ship.ship.mast.mast2.sail;
  const mp = m.rotation;

  // const ShipDef = defineObject("ship", {
  //   position: [V(0,0,0)],
  //   scale: [V(1,1,1)],
  //   renderableConstruct: [CubeMesh, true],
  // }
}
