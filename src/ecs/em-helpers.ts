import {
  ComponentDef,
  EntityW,
  Entity,
  EM,
  ResourceDef,
  Resources,
} from "./entity-manager.js";
import { Authority, AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import { assert } from "../utils/util.js";
import { capitalize } from "../utils/util.js";
import { Phase } from "./sys-phase.js";
import { InitFn } from "./em-init.js";

export function defineSerializableComponent<
  N extends string,
  P,
  UArgs extends any[]
>(
  name: N,
  // TODO(@darzu): change to use update/make
  // construct: (...args: Pargs) => P,
  make: () => P,
  update: (p: P, ...args: UArgs) => P,
  serialize: (obj: P, buf: Serializer) => void,
  deserialize: (obj: P, buf: Deserializer) => void
): ComponentDef<N, P, [], UArgs> {
  const def = EM.defineComponent(name, make, update, { multiArg: true });
  EM.registerSerializerPair(def, serialize, deserialize);
  return def;
}

function registerConstructorSystem<
  C extends ComponentDef,
  RS extends ResourceDef[]
>(
  def: C,
  rs: [...RS],
  callback: (e: EntityW<[C]>, resources: Resources<RS>) => void
) {
  EM.addSystem(
    `${def.name}Build`,
    Phase.PRE_GAME_WORLD,
    [def],
    rs,
    (es, res) => {
      for (let e of es) {
        if (FinishedDef.isOn(e)) continue;
        callback(e as EntityW<[C]>, res);
        EM.set(e, FinishedDef);
      }
    }
  );
  return callback;
  // console.log(`reg ${def.name}Build`);
}

export type NetEntityDefs<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  RS extends ResourceDef[],
  INITED
> = {
  [_ in `${Capitalize<N>}PropsDef`]: ComponentDef<`${N}Props`, P1, [], Pargs1>;
} & {
  [_ in `${Capitalize<N>}LocalDef`]: ComponentDef<`${N}Local`, P2, [], []>;
} & {
  [_ in `create${Capitalize<N>}`]: (
    ...args: Pargs1
  ) => EntityW<[ComponentDef<`${N}Props`, P1, Pargs1>]>;
} & {
  [_ in `create${Capitalize<N>}Now`]: (
    res: Resources<RS>,
    ...args: Pargs1
  ) => INITED;
} & {
  [_ in `create${Capitalize<N>}Async`]: (...args: Pargs1) => Promise<INITED>;
};

/*
SAMPLE:

const { createLd53ShipAsync } = defineNetEntityHelper({
  name: "ld53Ship",
  defaultProps: () => {},
  updateProps: (p) => p,
  serializeProps: (o, buf) => {},
  deserializeProps: (o, buf) => {},
  defaultLocal: () => {},
  dynamicComponents: [PositionDef, RotationDef],
  buildResources: [LD53MeshesDef, MeDef],
  build: (p, res) => {
    // TODO(@darzu):
  },
});
*/

export interface NetEntityOpts<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  DS extends ComponentDef[],
  RS extends ResourceDef[],
  INITED
> {
  name: N;
  // TODO(@darzu): Hmmm. Actually, on the owner we'll only call "construct" w/ args + serialize, on remote
  //    we'll call "construct" w/o args and then deserialize. We could potentially simplify this
  //    by having "localConstruct" and "emptyConstruct" or something.
  // TODO(@darzu): Maybe we should have a updatable & serialzable component type and then
  //    just take in two component defs
  defaultProps: () => P1;
  // TODO(@darzu): maybe make updateProps optional and have default impl:
  //   updateProps: (p, p2: Partial<typeof p>): typeof p => Object.assign(p, p2)
  updateProps: (p: P1, ...args: Pargs1) => P1;
  // TODO(@darzu): it'd be nice if we could enforce that data in probs is serialized/deserialzed; easy to forget a new field
  serializeProps: (obj: P1, buf: Serializer) => void;
  deserializeProps: (obj: P1, buf: Deserializer) => void;
  defaultLocal: () => P2;
  dynamicComponents: [...DS];
  // TODO(@darzu): probably get rid of this in favor of "whenResources", then
  //    maybe bring it back if we need the perf.
  buildResources: [...RS];
  build: (
    e: EntityW<
      [
        ComponentDef<`${N}Props`, P1, [], Pargs1>,
        ComponentDef<`${N}Local`, P2, [], []>,
        typeof AuthorityDef,
        typeof SyncDef,
        ...DS
      ]
    >,
    resources: Resources<RS>
  ) => INITED;
}

// TODO(@darzu): what happens if build() is async???!
// TODO(@darzu): I think i'd prefer this to be a struct, not a function call
//                also this might need to be merged with entity pool helper?
export function defineNetEntityHelper<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  DS extends ComponentDef[],
  RS extends ResourceDef[],
  INITED
>(
  opts: NetEntityOpts<N, P1, Pargs1, P2, DS, RS, INITED>
): NetEntityDefs<N, P1, Pargs1, P2, RS, INITED> {
  const propsDef = defineSerializableComponent(
    `${opts.name}Props`,
    opts.defaultProps,
    opts.updateProps,
    opts.serializeProps,
    opts.deserializeProps
  );
  const localDef = EM.defineComponent(
    `${opts.name}Local`,
    opts.defaultLocal,
    (p) => p
  );

  const constructFn = registerConstructorSystem(
    propsDef,
    [...opts.buildResources, MeDef],
    (e, res) => {
      const me = (res as any as Resources<[typeof MeDef]>).me; // TYPE HACK
      EM.setOnce(e, AuthorityDef, me.pid);
      // console.log(
      //   `making ent ${e.id} w/ pid ${me.pid}; actual: ${e.authority.pid}`
      // );

      EM.setOnce(e, localDef);
      EM.setOnce(e, SyncDef);
      e.sync.fullComponents = [propsDef.id];
      e.sync.dynamicComponents = opts.dynamicComponents.map((d) => d.id);
      for (let d of opts.dynamicComponents) EM.setOnce(e, d); // TODO(@darzu): this makes me nervous, calling .set without parameters

      // TYPE HACK
      const _e = e as any as EntityW<
        [
          ComponentDef<`${N}Props`, P1, [], Pargs1>,
          ComponentDef<`${N}Local`, P2, [], []>,
          typeof AuthorityDef,
          typeof SyncDef,
          ...DS
        ]
      >;

      opts.build(_e, res as Resources<RS>);
    }
  );

  const createNew = (...args: Pargs1) => {
    const e = EM.mk();
    EM.set(e, propsDef, ...args);
    return e;
  };

  const createNewNow = (res: Resources<RS>, ...args: Pargs1) => {
    const e = EM.mk();
    EM.set(e, propsDef, ...args);
    // TODO(@darzu): maybe we should force users to give us the MeDef? it's probably always there tho..
    // TODO(@darzu): Think about what if buid() is async...
    constructFn(e, res as Resources<[...RS, typeof MeDef]>);
    EM.set(e, FinishedDef);
    return e;
  };

  const createNewAsync = async (...args: Pargs1) => {
    const e = EM.mk();
    EM.set(e, propsDef, ...args);
    await EM.whenEntityHas(e, FinishedDef);
    return e as INITED;
  };

  const capitalizedN = capitalize(opts.name);

  const result = {
    [`${capitalizedN}PropsDef`]: propsDef,
    [`${capitalizedN}LocalDef`]: localDef,
    [`create${capitalizedN}`]: createNew,
    [`create${capitalizedN}Now`]: createNewNow,
    [`create${capitalizedN}Async`]: createNewAsync,
  } as const;

  // TYPE HACK: idk how to make Typscript accept this...
  // TODO(@darzu): would be nice to have proper type checking on these fns
  return result as any;
}

export type Ref<CS extends ComponentDef[] = []> = (() =>
  | EntityW<CS>
  | undefined) & {
  readonly id: number;
};

export function createRef<CS extends ComponentDef[]>(e: EntityW<CS>): Ref<CS>;
export function createRef<CS extends ComponentDef[]>(
  id: number,
  cs: [...CS]
): Ref<CS>;
export function createRef<CS extends ComponentDef[]>(
  idOrE: EntityW<CS> | number,
  cs?: [...CS]
): Ref<CS> {
  if (typeof idOrE === "number") {
    if (idOrE <= 0) {
      const thunk = () => undefined;
      thunk.id = idOrE;
      return thunk;
    } else {
      let found: EntityW<CS> | undefined;
      assert(!!cs, "Ref must be given ComponentDef witnesses w/ id");
      const thunk = () => {
        if (!found) found = EM.findEntity<CS, number>(idOrE, cs);
        return found;
      };
      thunk.id = idOrE;
      return thunk;
    }
  } else {
    const thunk = () => idOrE;
    thunk.id = idOrE.id;
    return thunk;
  }
}

export const FinishedDef = EM.defineComponent(
  "finished",
  () => true,
  (p) => p
);

export function defineResourceWithInit<
  N extends string,
  P extends object,
  RS extends ResourceDef[]
>(name: N, requires: [...RS], create: InitFn<RS, P>): ResourceDef<N, P, [P]> {
  const resDef = EM.defineResource<N, P, [P]>(name, (p: P) => p);
  EM.addLazyInit([...requires], [resDef], async (rs) => {
    // TODO(@darzu): wish we could make this await optional
    const p = await create(rs);
    EM.addResource(resDef, p);
  });

  return resDef;
}
