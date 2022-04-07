import { FinishedDef } from "./build.js";
import { EntityManager, ComponentDef, EntityW } from "./entity-manager.js";
import { AuthorityDef, MeDef, SyncDef } from "./net/components.js";
import { Serializer, Deserializer } from "./serialize.js";

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

export function registerConstructorSystem<
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
    `build_${def.name}`
  );
  return def;
}

export type NetEntityDef = {};

export function defineNetEntityHelper<
  N extends string,
  P1,
  Pargs1 extends any[],
  P2,
  DS extends ComponentDef[],
  RS extends ComponentDef[]
>(
  em: EntityManager,
  opts: {
    name: N;
    defaultProps: (...args: Pargs1) => P1;
    serializeProps: (obj: P1, buf: Serializer) => void;
    deserializeProps: (obj: P1, buf: Deserializer) => void;
    defaultLocal: () => P2;
    dynamicComponents?: [...DS];
    buildResources: [...RS];
    build: (
      e: EntityW<
        [
          ComponentDef<`${N}Props`, P1, Pargs1>,
          ComponentDef<`${N}Local`, P2, []>
        ]
      >,
      resources: EntityW<RS>
    ) => void;
  }
): [ComponentDef<`${N}Props`, P1, Pargs1>, ComponentDef<`${N}Local`, P2, []>] {
  const propsDef = defineSerializableComponent(
    em,
    `${opts.name}Props`,
    opts.defaultProps,
    opts.serializeProps,
    opts.deserializeProps
  );
  const localDef = em.defineComponent(`${opts.name}Local`, opts.defaultLocal);

  registerConstructorSystem(
    em,
    propsDef,
    [...opts.buildResources, MeDef],
    (e, res) => {
      em.ensureComponentOn(e, localDef);
      // HACK
      const me = (res as any as EntityW<[typeof MeDef]>).me;
      em.ensureComponentOn(e, AuthorityDef, me.pid);
      em.ensureComponentOn(e, SyncDef);
      e.sync.fullComponents = [propsDef.id];
      if (opts.dynamicComponents)
        e.sync.dynamicComponents = opts.dynamicComponents.map((d) => d.id);

      opts.build(e, res as EntityW<RS>);
    }
  );

  return [propsDef, localDef];
}
