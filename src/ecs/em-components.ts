import { Entity, _entities } from "./em-entities.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import { assert, hashCode } from "../utils/util.js";
import { ResourceDef } from "./em-resources.js";
import { EntityW } from "./em-entities.js";

// TODO(@darzu): RENAME: all "xxxxDef" -> "xxxxC" ?

export function componentNameToId(name: string): number {
  return hashCode(name);
}

export interface ComponentDef<
  N extends string = string,
  P = any,
  CArgs extends any[] = any,
  UArgs extends any[] = any,
  MA extends boolean = boolean
> {
  _brand: "componentDef";
  updatable: boolean;
  multiArg: MA;
  readonly name: N;
  construct: (...args: CArgs) => P;
  update: (p: P, ...args: UArgs) => P;
  readonly id: CompId;
  isOn: <E extends Entity>(
    e: E
  ) => e is E & {
    [K in N]: P;
  };
}

export type NonupdatableComponentDef<
  N extends string,
  P,
  CArgs extends any[],
  MA extends boolean = boolean
> = ComponentDef<N, P, CArgs, [], MA>;

export type UpdatableComponentDef<
  N extends string,
  P,
  UArgs extends any[],
  MA extends boolean = boolean
> = ComponentDef<N, P, [], UArgs, MA>;

export type CompId = number;

export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never; // TODO(@darzu): Not entirely sure this "Nonupdatable" split is worth the extra complexity

export const componentsToString = (cs: (ComponentDef | ResourceDef)[]) =>
  `(${cs.map((c) => c.name).join(", ")})`;

export type EDef<CS extends ComponentDef[]> = readonly [...CS];
export type ESet<DS extends EDef<any>[]> = {
  [K in keyof DS]: DS[K] extends EDef<infer CS> ? EntityW<CS, number> : never;
};
export function isDeadC(e: ComponentDef) {
  return "dead" === e.name;
}
export function isDeadE(e: Entity) {
  return "dead" in e;
} // TODO(@darzu): hacky, special components
export function isDeletedE(e: Entity) {
  return "deleted" in e;
}

export interface EMComponents {
  // TODO(@darzu):
  componentDefs: Map<CompId, ComponentDef>;

  defineComponent<
    N extends string,
    P,
    UArgs extends any[] & { length: 0 | 1 } = []
  >(
    name: N,
    construct: () => P,
    update?: (p: P, ...args: UArgs) => P
  ): UpdatableComponentDef<N, P, UArgs, false>;
  defineComponent<N extends string, P, UArgs extends any[] = []>(
    name: N,
    construct: () => P,
    update: (p: P, ...args: UArgs) => P,
    opts: { multiArg: true }
  ): UpdatableComponentDef<N, P, UArgs, true>;

  defineNonupdatableComponent<
    N extends string,
    P,
    CArgs extends any[] & { length: 0 | 1 }
  >(
    name: N,
    construct: (...args: CArgs) => P
  ): NonupdatableComponentDef<N, P, CArgs, false>;
  defineNonupdatableComponent<N extends string, P, CArgs extends any[]>(
    name: N,
    construct: (...args: CArgs) => P,
    opts: { multiArg: true }
  ): NonupdatableComponentDef<N, P, CArgs, true>;

  registerSerializerPair<N extends string, P, UArgs extends any[]>(
    def: ComponentDef<N, P, [], UArgs>,
    serialize: (obj: P, buf: Serializer) => void,
    deserialize: (obj: P, buf: Deserializer) => void
  ): void;

  // TODO(@darzu): serialize/derserialize onto an entity
  serialize(id: number, componentId: number, buf: Serializer): void;
  deserialize(id: number, componentId: number, buf: Deserializer): void;

  checkComponent(def: ComponentDef): void;
}
export function createEMComponents(): EMComponents {
  const componentDefs: Map<CompId, ComponentDef> = new Map(); // TODO(@darzu): rename to componentDefs ?

  const forbiddenComponentNames = new Set<string>(["id"]);

  const serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  // TODO(@darzu): allow components to specify sibling components or component sets
  //  so that if the marker component is present, the others will be also
  function defineComponent<
    N extends string,
    P,
    UArgs extends any[] & { length: 0 | 1 } = []
  >(
    name: N,
    construct: () => P,
    update?: (p: P, ...args: UArgs) => P
  ): UpdatableComponentDef<N, P, UArgs, false>;
  function defineComponent<N extends string, P, UArgs extends any[] = []>(
    name: N,
    construct: () => P,
    update: (p: P, ...args: UArgs) => P,
    opts: { multiArg: true }
  ): UpdatableComponentDef<N, P, UArgs, true>;
  function defineComponent<
    N extends string,
    P,
    UArgs extends any[] = [],
    MA extends boolean = boolean
  >(
    name: N,
    construct: () => P,
    update: (p: P, ...args: UArgs) => P = (p, ..._) => p,
    opts: { multiArg: MA } = { multiArg: false as MA } // TODO(@darzu): any way around this cast?
  ): UpdatableComponentDef<N, P, UArgs, MA> {
    const id = componentNameToId(name);
    assert(!componentDefs.has(id), `Component '${name}' already defined`);
    assert(!forbiddenComponentNames.has(name), `forbidden name: ${name}`);
    const component: UpdatableComponentDef<N, P, UArgs, MA> = {
      _brand: "componentDef", // TODO(@darzu): remove?
      updatable: true,
      name,
      construct,
      update,
      id,
      isOn: <E extends Entity>(
        e: E
      ): e is E & {
        [K in N]: P;
      } =>
        // (e as Object).hasOwn(name),
        name in e,
      multiArg: opts.multiArg,
    };
    // TODO(@darzu): I don't love this cast. feels like it should be possible without..
    componentDefs.set(id, component as unknown as ComponentDef);
    return component;
  }

  function defineNonupdatableComponent<
    N extends string,
    P,
    CArgs extends any[] & { length: 0 | 1 }
  >(
    name: N,
    construct: (...args: CArgs) => P
  ): NonupdatableComponentDef<N, P, CArgs, false>;
  function defineNonupdatableComponent<
    N extends string,
    P,
    CArgs extends any[]
  >(
    name: N,
    construct: (...args: CArgs) => P,
    opts: { multiArg: true }
  ): NonupdatableComponentDef<N, P, CArgs, true>;
  function defineNonupdatableComponent<
    N extends string,
    P,
    CArgs extends any[],
    MA extends boolean
  >(
    name: N,
    construct: (...args: CArgs) => P,
    opts: { multiArg: MA } = { multiArg: false as MA }
  ): NonupdatableComponentDef<N, P, CArgs, MA> {
    const id = componentNameToId(name);
    if (componentDefs.has(id)) {
      throw `Component with name ${name} already defined--hash collision?`;
    }

    // TODO(@darzu): it'd be nice to a default constructor that takes p->p
    // const _construct = construct ?? ((...args: CArgs) => args[0]);
    const component: NonupdatableComponentDef<N, P, CArgs, MA> = {
      _brand: "componentDef", // TODO(@darzu): remove?
      updatable: false,
      name,
      construct,
      update: (p) => p,
      // make,
      // update,
      id,
      isOn: <E extends Entity>(
        e: E
      ): e is E & {
        [K in N]: P;
      } =>
        // (e as Object).hasOwn(name),
        name in e,
      multiArg: opts.multiArg,
    };
    componentDefs.set(id, component);
    return component;
  }

  function checkComponent(def: ComponentDef) {
    if (!componentDefs.has(def.id))
      throw `Component ${def.name} (id ${def.id}) not found`;
    if (componentDefs.get(def.id)!.name !== def.name)
      throw `Component id ${def.id} has name ${
        componentDefs.get(def.id)!.name
      }, not ${def.name}`;
  }

  function registerSerializerPair<N extends string, P, UArgs extends any[]>(
    def: ComponentDef<N, P, [], UArgs>,
    serialize: (obj: P, buf: Serializer) => void,
    deserialize: (obj: P, buf: Deserializer) => void
  ) {
    assert(
      def.updatable,
      `Can't attach serializers to non-updatable component '${def.name}'`
    );
    serializers.set(def.id, { serialize, deserialize });
  }

  function serialize(id: number, componentId: number, buf: Serializer) {
    const def = componentDefs.get(componentId);
    if (!def) throw `Trying to serialize unknown component id ${componentId}`;
    const entity = _entities.findEntity(id, [def]);
    if (!entity)
      throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
    const serializerPair = serializers.get(componentId);
    if (!serializerPair)
      throw `No serializer for component ${def.name} (for entity ${id})`;

    // TODO(@darzu): DBG
    // if (componentId === 1867295084) {
    //   console.log(`serializing 1867295084`);
    // }
    serializerPair.serialize(entity[def.name], buf);
  }

  function deserialize(id: number, componentId: number, buf: Deserializer) {
    const def = componentDefs.get(componentId);
    if (!def) throw `Trying to deserialize unknown component id ${componentId}`;
    if (!_entities.hasEntity(id)) {
      throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
    }
    let entity = _entities.findEntity(id, [def]);

    const serializerPair = serializers.get(componentId);
    if (!serializerPair)
      throw `No deserializer for component ${def.name} (for entity ${id})`;
    const deserialize = (p: any) => {
      serializerPair.deserialize(p, buf);
      return p;
    };

    // TODO: because of this usage of dummy, deserializers don't
    // actually need to read buf.dummy
    if (buf.dummy) {
      deserialize({});
    } else if (!entity) {
      assert(
        def.updatable,
        `Trying to deserialize into non-updatable component '${def.name}'!`
      );
      _entities.addComponentInternal(id, def, deserialize, ...[]);
    } else {
      deserialize(entity[def.name]);
    }

    // TODO(@darzu): DBG
    // if (componentId === 1867295084) {
    //   console.log(`deserializing 1867295084, dummy: ${buf.dummy}`);
    // }
  }

  const res: EMComponents = {
    componentDefs,

    defineComponent,
    defineNonupdatableComponent,

    registerSerializerPair,
    serialize,
    deserialize,

    checkComponent,
  };

  return res;
}

export const _components: EMComponents = createEMComponents();
