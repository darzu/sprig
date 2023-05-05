import { FinishedDef } from "../build.js";
import {
  EntityManager,
  ComponentDef,
  EntityW,
  Entity,
  EM,
} from "./entity-manager.js";
import { Authority, AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { Serializer, Deserializer } from "../serialize.js";
import { assert } from "../util.js";
import { capitalize } from "../util.js";

export function defineSerializableComponent<
  N extends string,
  P,
  Pargs extends any[]
>(
  em: EntityManager,
  name: N,
  construct: (...args: Pargs) => P,
  serialize: (obj: P, buf: Serializer) => void,
  deserialize: (obj: P, buf: Deserializer) => void
): ComponentDef<N, P, Pargs> {
  const def = em.defineComponent(name, construct);
  em.registerSerializerPair(def, serialize, deserialize);
  return def;
}

function registerConstructorSystem<
  C extends ComponentDef,
  RS extends ComponentDef[]
>(
  em: EntityManager,
  def: C,
  rs: [...RS],
  callback: (e: EntityW<[C]>, resources: EntityW<RS>) => void
) {
  em.registerSystem(
    [def],
    rs,
    (es, res) => {
      for (let e of es) {
        if (FinishedDef.isOn(e)) continue;
        callback(e as EntityW<[C]>, res);
        em.ensureComponentOn(e, FinishedDef);
      }
    },
    `${def.name}Build`
  );
  return callback;
  // console.log(`reg ${def.name}Build`);
}

export type NetEntityDefs<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  RS extends ComponentDef[],
  INITED
> = {
  [_ in `${Capitalize<N>}PropsDef`]: ComponentDef<`${N}Props`, P1, Pargs1>;
} & {
  [_ in `${Capitalize<N>}LocalDef`]: ComponentDef<`${N}Local`, P2, []>;
} & {
  [_ in `create${Capitalize<N>}`]: (
    ...args: Pargs1
  ) => EntityW<[ComponentDef<`${N}Props`, P1, Pargs1>]>;
} & {
  [_ in `create${Capitalize<N>}Now`]: (
    res: EntityW<RS>,
    ...args: Pargs1
  ) => INITED;
};

// TODO(@darzu): what happens if build() is async???!
// TODO(@darzu): I think i'd prefer this to be a struct, not a function call
//                also this might need to be merged with entity pool helper?
export function defineNetEntityHelper<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  DS extends ComponentDef[],
  RS extends ComponentDef[],
  INITED
>(
  em: EntityManager,
  opts: {
    name: N;
    defaultProps: (...args: Pargs1) => P1;
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
          ComponentDef<`${N}Props`, P1, Pargs1>,
          ComponentDef<`${N}Local`, P2, []>,
          typeof AuthorityDef,
          typeof SyncDef,
          ...DS
        ]
      >,
      resources: EntityW<RS>
    ) => INITED;
  }
): NetEntityDefs<N, P1, Pargs1, P2, RS, INITED> {
  const propsDef = defineSerializableComponent(
    em,
    `${opts.name}Props`,
    opts.defaultProps,
    opts.serializeProps,
    opts.deserializeProps
  );
  const localDef = em.defineComponent(`${opts.name}Local`, opts.defaultLocal);

  const constructFn = registerConstructorSystem(
    em,
    propsDef,
    [...opts.buildResources, MeDef],
    (e, res) => {
      // TYPE HACK
      const me = (res as any as EntityW<[typeof MeDef]>).me;
      em.ensureComponentOn(e, AuthorityDef, me.pid);

      em.ensureComponentOn(e, localDef);
      em.ensureComponentOn(e, SyncDef);
      e.sync.fullComponents = [propsDef.id];
      e.sync.dynamicComponents = opts.dynamicComponents.map((d) => d.id);
      for (let d of opts.dynamicComponents) em.ensureComponentOn(e, d);

      // TYPE HACK
      const _e = e as any as EntityW<
        [
          ComponentDef<`${N}Props`, P1, Pargs1>,
          ComponentDef<`${N}Local`, P2, []>,
          typeof AuthorityDef,
          typeof SyncDef,
          ...DS
        ]
      >;

      opts.build(_e, res as EntityW<RS>);
    }
  );

  const createNew = (...args: Pargs1) => {
    const e = em.new();
    em.ensureComponentOn(e, propsDef, ...args);
    return e;
  };

  const createNewNow = (res: EntityW<RS>, ...args: Pargs1) => {
    const e = em.new();
    em.ensureComponentOn(e, propsDef, ...args);
    // TODO(@darzu): maybe we should force users to give us the MeDef? it's probably always there tho..
    // TODO(@darzu): Think about what if buid() is async...
    constructFn(e, res as EntityW<[...RS, typeof MeDef]>);
    em.ensureComponentOn(e, FinishedDef);
    return e;
  };

  const capitalizedN = capitalize(opts.name);

  const result = {
    [`${capitalizedN}PropsDef`]: propsDef,
    [`${capitalizedN}LocalDef`]: localDef,
    [`create${capitalizedN}`]: createNew,
    [`create${capitalizedN}Now`]: createNewNow,
  } as const;

  // TYPE HACK: idk how to make Typscript accept this...
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
