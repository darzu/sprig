import {
  DBG_ASSERT,
  DBG_VERBOSE_ENTITY_PROMISE_CALLSITES,
  DBG_VERBOSE_INIT_CALLSITES,
  DBG_INIT_CAUSATION,
  DBG_VERBOSE_INIT_SEQ,
  DBG_SYSTEM_ORDER,
} from "../flags.js";
import { resetTempMatrixBuffer, V3 } from "../matrix/sprig-matrix.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import { getCallStack } from "../utils/util-no-import.js";
import {
  assert,
  assertDbg,
  dbgLogOnce,
  dbgOnce,
  hashCode,
  Intersect,
  isPromise,
  toMap,
} from "../utils/util.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { EMInit, _init } from "./em-init.js";
import { Resources } from "./em-resources.js";
import { ResourceDef } from "./em-resources.js";
import { EMResources, _resources } from "./em-resources.js";
import { Phase, PhaseValueList } from "./sys-phase.js";

// TODO(@darzu): re-check all uses of "any" and prefer "unknown"
//    see: https://github.com/Microsoft/TypeScript/pull/24439

// TODO(@darzu): PERF. we really need to move component data to be
//  colocated in arrays; and maybe introduce "arch-types" for commonly grouped
//  components and "worlds" to section off entities.

/*
Components need/can support:
  EM.add (or first EM.set)
  EM.update (or EM.addOrUpdate, subsequent EM.set; skippable if we're not worried about efficiency!)
  for (de)serialization:
    a. (efficient) default constructor + deserialize-as-update
    b. (efficient) deserialize-as-new + deserialize-as-update
    c. (slow) deserialize-as-new
    d. (slow) Cy-style auto-deserialize (TODO: could be fast w/ code-gen)
    
TODO(@darzu): impl this \/
Component feautres:
  (expressed in type and w/ boolean)
  R: type (default constructor takes whole type) -(gives)-> EM.add
  O: custom constructor -(gives)-> CArgs-based EM.add
  O: update -(gives)-> EM.update / EM.addOrUpdate
  O: serialize
  O: deserialize-as-new -(gives)-> deserialzie like EM.add
  O: deserialize-as-update -(gives)-> deserialize like EM.update
  O: default constructor -(gives)-> skip deserialize-as-new
  O: type witness can be using Cy shader types for free serializers
        can include warning when used >X times per frame
  Common library of component types like vec3, mat4, etc.

Maybe change syntax: (i think this has problems w/ type assertions)
  "myEnt.add/set/update(PositionDef, [1,2,3])" 
  "EM.add/set/update(myEnt, PositionDef, [1,2,3])"

Benefits of having a default constructor or witness:
  potentially auto-serializer?
  allows you to "alloc". Maybe helps w/ efficient layout? Sub for sizeof() ?

Maybe there should be two component types: Direct and Object.
  Direct for things like vectors, numbers, Map, directly as the component.
  Object for all {}-y, json-y objects w/ multiple proprties
  Objects could have default update w/ Object.assign + Partial<T> ?

In Bevy, you don't get access to myEnt.myComp, instead you're 
  given (myComp1, myComp2, ...) tuple in systems

Bevy ECS nice-to-have features:
  Added/Changed/Removed for components queries
*/

// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)

// TODO(@darzu): PERF TRACKING. Thinking:
/*
goal: understand what's happening between 0 and first-playable

could use "milestone" event trackers

perhaps we have frame phases:
executing systems,
executing inits,
waiting for next draw

attribute system time to systems
  are systems every async?

perhaps entity promises could check to see if they're being created in System, Init, or Other
  What would "Other" be?
And then they'd resume themselves in the appropriate system's scheduled time?

How do we track time on vanilla init functions?

I could always resume entity promises in the same phase as what requested them so
either init time or GAME_WORLD etc

  if we did that i think we could accurately measure self-time for systems
  but that might not capture other time like file downloading
*/

// TODO(@darzu): use defineProperty, Object.preventExtensions(), and such to have more robust entities?

export interface Entity {
  readonly id: number;
}

export type CompId = number;

// TODO(@darzu): RENAME: all "xxxxDef" -> "xxxxC" ?
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
  isOn: <E extends Entity>(e: E) => e is E & { [K in N]: P };
}
export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

// TODO(@darzu): Not entirely sure this "Nonupdatable" split is worth the extra complexity
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

export type _ComponentDef<
  N extends string,
  P,
  PArgs extends any[],
  MA extends boolean = boolean
> =
  | NonupdatableComponentDef<N, P, PArgs, MA>
  | UpdatableComponentDef<N, P, PArgs, MA>;

export const componentsToString = (cs: (ComponentDef | ResourceDef)[]) =>
  `(${cs.map((c) => c.name).join(", ")})`;

export type WithComponent<D> = D extends ComponentDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
export type EntityW1<N extends string, P> = {
  readonly id: number;
} & { [k in N]: P };
export type EntityW<
  CS extends readonly ComponentDef[],
  ID extends number = number
> = {
  readonly id: ID;
} & Intersect<{ [i in keyof CS]: WithComponent<CS[i]> }>;

export type Entities<CS extends ComponentDef[]> = EntityW<CS>[];
export type ReadonlyEntities<CS extends ComponentDef[]> =
  readonly EntityW<CS>[];

export type SystemFn<
  CS extends ComponentDef[] | null = ComponentDef[] | null,
  RS extends ResourceDef[] = ResourceDef[]
> = (
  es: CS extends ComponentDef[] ? ReadonlyEntities<CS> : [],
  resources: Resources<RS>
) => void | Promise<void>;

export interface SystemFlags {
  // If set, won't warn you if you remove component during a system that queries that component
  allowQueryEdit?: boolean;
}
export interface PublicSystemReg {
  readonly id: number;
  readonly name: string;
  readonly phase: Phase;
  flags: SystemFlags;
}

interface SystemReg {
  cs: ComponentDef[] | null;
  rs: ResourceDef[];
  callback: SystemFn;
  name: string;
  phase: Phase;
  id: number;
  flags: SystemFlags;
}

// export function initFnToKey(init: InitFnReg) {
//   return `${init.eager ? "E" : "L"}:${init.requireRs
//     .map((c) => c.name)
//     .join("+")}&${
//     init.requireCompSet?.map((c) => c.name).join("+") ?? ""
//   }->${init.provideRs.map((c) => c.name).join("+")}`;
// }

// type _InitFNReg = InitFNReg & {
//   id: number;
// }

// TODO(@darzu): think about naming some more...
type EntityPromise<
  //eCS extends ComponentDef[],
  CS extends ComponentDef[],
  ID extends number
> = {
  id: number;
  e: EntityW<any[], ID>;
  cs: CS;
  callback: (e: EntityW<[...CS], ID>) => void;
  // name: string;
};

// TODO(@darzu): remove? i think these r unused
type EDefId<ID extends number, CS extends ComponentDef[]> = [ID, ...CS];
type ESetId<DS extends EDefId<number, any>[]> = {
  [K in keyof DS]: DS[K] extends EDefId<infer ID, infer CS>
    ? EntityW<CS, ID> | undefined
    : never;
};

// TODO(@darzu): don't love these...
export type EDef<CS extends ComponentDef[]> = readonly [...CS];
export type ESet<DS extends EDef<any>[]> = {
  [K in keyof DS]: DS[K] extends EDef<infer CS> ? EntityW<CS, number> : never;
};

export function nameToId(name: string): number {
  return hashCode(name);
}

interface SystemStats {
  callTime: number;
  maxCallTime: number;
  queries: number;
  calls: number;
}
interface _EntityManager {
  entities: Map<number, Entity>;

  allSystemsByName: Map<string, SystemReg>;

  emStats: { queryTime: number; dbgLoops: number };
  sysStats: Record<string, SystemStats>;

  componentDefs: Map<CompId, ComponentDef>;

  seenComponents: Set<CompId>;

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

  serialize(id: number, componentId: number, buf: Serializer): void;
  deserialize(id: number, componentId: number, buf: Deserializer): void;

  setDefaultRange(rangeName: string): void;
  setIdRange(rangeName: string, nextId: number, maxId: number): void;

  mk(rangeName?: string): Entity;
  registerEntity(id: number): Entity;

  addComponent<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): P;

  addComponentByName(id: number, name: string, ...args: any): any;

  ensureComponent<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): P;

  set<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: UpdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[UpdatableComponentDef<N, P, PArgs>]>;
  set<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: NonupdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[NonupdatableComponentDef<N, P, PArgs>]>;

  setOnce<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: UpdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[UpdatableComponentDef<N, P, PArgs>]>;
  setOnce<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: NonupdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[NonupdatableComponentDef<N, P, PArgs>]>;

  hasEntity(id: number): boolean;

  removeComponent<C extends ComponentDef>(id: number, def: C): void;

  tryRemoveComponent<C extends ComponentDef>(id: number, def: C): boolean;
  keepOnlyComponents<CS extends ComponentDef[]>(id: number, cs: [...CS]): void;

  hasComponents<CS extends ComponentDef[], E extends Entity>(
    e: E,
    cs: [...CS]
  ): e is E & EntityW<CS>;

  findEntity<CS extends ComponentDef[], ID extends number>(
    id: ID,
    cs: readonly [...CS]
  ): EntityW<CS, ID> | undefined;

  findEntitySet<ES extends EDefId<number, any>[]>(es: [...ES]): ESetId<ES>;

  filterEntities_uncached<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS>;

  dbgGetSystemsForEntity(id: number): SystemReg[];

  dbgFilterEntitiesByKey(cs: string | string[]): Entities<any>;

  addSystem<CS extends ComponentDef[], RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS],
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): PublicSystemReg;
  addSystem<CS extends null, RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): PublicSystemReg;

  hasSystem(name: string): boolean;

  whenEntityHas<
    // eCS extends ComponentDef[],
    CS extends ComponentDef[],
    ID extends number
  >(
    e: EntityW<ComponentDef[], ID>,
    ...cs: CS
  ): Promise<EntityW<CS, ID>>;

  whenSingleEntity<CS extends ComponentDef[]>(
    ...cs: [...CS]
  ): Promise<EntityW<CS>>;

  update(): void;
}

interface EntityManager extends _EntityManager, EMInit, EMResources {}

// TODO(@darzu): split this apart! Shouldn't be a class and should be in as many pieces as is logical
function createEntityManager(): _EntityManager {
  const entities: Map<number, Entity> = new Map();
  const allSystemsByName: Map<string, SystemReg> = new Map();
  const activeSystemsById: Map<number, SystemReg> = new Map();
  const phases: Map<Phase, string[]> = toMap(
    PhaseValueList,
    (n) => n,
    (_) => [] as string[]
  );
  const entityPromises: Map<number, EntityPromise<ComponentDef[], any>[]> =
    new Map();
  const componentDefs: Map<CompId, ComponentDef> = new Map(); // TODO(@darzu): rename to componentDefs ?

  const seenComponents = new Set<CompId>();

  const serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  const ranges: Record<string, { nextId: number; maxId: number }> = {};
  let defaultRange: string = "";
  const sysStats: Record<string, SystemStats> = {};
  const emStats = {
    queryTime: 0,
    dbgLoops: 0,
  };

  // QUERY SYSTEM
  // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
  //    would make certain scan operations (like updating them on component add/remove)
  //    cheaper. And perhaps better gameplay code too.
  const _systemsToEntities: Map<number, Entity[]> = new Map();
  // NOTE: _entitiesToSystems is only needed because of DeadDef
  const _entitiesToSystems: Map<number, number[]> = new Map();
  const _systemsToComponents: Map<number, string[]> = new Map();
  const _componentToSystems: Map<string, number[]> = new Map();

  const forbiddenComponentNames = new Set<string>(["id"]);

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
    const id = nameToId(name);
    assert(!componentDefs.has(id), `Component '${name}' already defined`);
    assert(!forbiddenComponentNames.has(name), `forbidden name: ${name}`);
    const component: UpdatableComponentDef<N, P, UArgs, MA> = {
      _brand: "componentDef", // TODO(@darzu): remove?
      updatable: true,
      name,
      construct,
      update,
      id,
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } =>
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
    const id = nameToId(name);
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
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } =>
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
    const entity = findEntity(id, [def]);
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
    if (!hasEntity(id)) {
      throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
    }
    let entity = findEntity(id, [def]);

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
      addComponentInternal(id, def, deserialize, ...[]);
    } else {
      deserialize(entity[def.name]);
    }

    // TODO(@darzu): DBG
    // if (componentId === 1867295084) {
    //   console.log(`deserializing 1867295084, dummy: ${buf.dummy}`);
    // }
  }

  function setDefaultRange(rangeName: string) {
    defaultRange = rangeName;
  }

  function setIdRange(rangeName: string, nextId: number, maxId: number) {
    ranges[rangeName] = { nextId, maxId };
  }

  // TODO(@darzu): dont return the entity!
  function mk(rangeName?: string): Entity {
    if (rangeName === undefined) rangeName = defaultRange;
    const range = ranges[rangeName];
    if (!range) {
      throw `Entity manager has no ID range (range specifier is ${rangeName})`;
    }
    if (range.nextId >= range.maxId)
      throw `EntityManager has exceeded its id range!`;
    // TODO(@darzu): does it matter using Object.create(null) here? It's kinda cleaner
    //  to not have a prototype (toString etc).
    // const e = { id: range.nextId++ };
    const e = Object.create(null);
    e.id = range.nextId++;
    if (e.id > 2 ** 15)
      console.warn(
        `We're halfway through our local entity ID space! Physics assumes IDs are < 2^16`
      );
    entities.set(e.id, e);
    _entitiesToSystems.set(e.id, []);

    // if (e.id === 10052) throw new Error("Created here!");

    return e;
  }

  function registerEntity(id: number): Entity {
    assert(!entities.has(id), `EntityManager already has id ${id}!`);
    /* TODO: should we do the check below but for all ranges?
    if (nextId <= id && id < maxId)
    throw `EntityManager cannot register foreign ids inside its local range; ${nextId} <= ${id} && ${id} < ${maxId}!`;
    */
    // const e = { id: id };
    const e = Object.create(null); // no prototype
    e.id = id;
    entities.set(e.id, e);
    _entitiesToSystems.set(e.id, []);
    return e;
  }

  // TODO(@darzu): hacky, special components
  function isDeletedE(e: Entity) {
    return "deleted" in e;
  }
  function isDeadE(e: Entity) {
    return "dead" in e;
  }
  function isDeadC(e: ComponentDef) {
    return "dead" === e.name;
  }

  function addComponent<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): P {
    return addComponentInternal(id, def, undefined, ...args);
  }

  function addComponentInternal<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    customUpdate: undefined | ((p: P, ...args: PArgs) => P),
    ...args: PArgs
  ): P {
    checkComponent(def);
    if (id === 0) throw `hey, use addResource!`;
    const e = entities.get(id)!;
    // TODO: this is hacky--EM shouldn't know about "deleted"
    if (DBG_ASSERT && isDeletedE(e)) {
      console.error(
        `Trying to add component ${def.name} to deleted entity ${id}`
      );
    }
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
    let c: P;
    if (def.updatable) {
      c = def.construct();
      c = customUpdate ? customUpdate(c, ...args) : def.update(c, ...args);
    } else {
      c = def.construct(...args);
    }

    (e as any)[def.name] = c;

    // update query caches
    {
      let _beforeQueryCache = performance.now();
      seenComponents.add(def.id);
      const eSystems = _entitiesToSystems.get(e.id)!;
      if (isDeadC(def)) {
        // remove from every current system
        eSystems.forEach((s) => {
          const es = _systemsToEntities.get(s)!;
          // TODO(@darzu): perf. sorted removal
          const indx = es.findIndex((v) => v.id === id);
          if (indx >= 0) es.splice(indx, 1);
        });
        eSystems.length = 0;
      }
      const systems = _componentToSystems.get(def.name);
      for (let sysId of systems ?? []) {
        const allNeededCs = _systemsToComponents.get(sysId);
        if (allNeededCs?.every((n) => n in e)) {
          // TODO(@darzu): perf. sorted insert
          _systemsToEntities.get(sysId)!.push(e);
          eSystems.push(sysId);
        }
      }
      emStats.queryTime += performance.now() - _beforeQueryCache;
    }

    // track changes for entity promises
    // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
    _changedEntities.add(e.id);

    return c;
  }

  function addComponentByName(id: number, name: string, ...args: any): any {
    console.log(
      "addComponentByName called, should only be called for debugging"
    );
    let component = componentDefs.get(nameToId(name));
    if (!component) {
      throw `no component named ${name}`;
    }
    return addComponent(id, component, ...args);
  }

  function ensureComponent<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): P {
    checkComponent(def);
    const e = entities.get(id)!;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return addComponent(id, def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }

  // TODO(@darzu): use MA arg here?
  function set<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: UpdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[UpdatableComponentDef<N, P, PArgs>]>;
  function set<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: NonupdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[NonupdatableComponentDef<N, P, PArgs>]>;
  function set<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[_ComponentDef<N, P, PArgs>]> {
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      addComponent(e.id, def, ...args);
    } else {
      assert(
        def.updatable,
        `Trying to double set non-updatable component '${def.name}' on '${e.id}'`
      );
      // if (def.name === "authority") throw new Error(`double-set authority`);
      // dbgLogOnce(`update: ${e.id}.${def.name}`);
      (e as any)[def.name] = def.update((e as any)[def.name], ...args);
    }
  }

  function setOnce<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: UpdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[UpdatableComponentDef<N, P, PArgs>]>;
  function setOnce<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: NonupdatableComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[NonupdatableComponentDef<N, P, PArgs>]>;
  function setOnce<N extends string, P, PArgs extends any[]>(
    e: Entity,
    def: _ComponentDef<N, P, PArgs>,
    ...args: PArgs
  ): asserts e is EntityW<[_ComponentDef<N, P, PArgs>]> {
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      addComponent(e.id, def, ...args);
    }
  }

  let _currentRunningSystem: SystemReg | undefined = undefined;
  let _dbgLastSystemLen = 0;
  let _dbgLastActiveSystemLen = 0;
  function callSystems() {
    if (DBG_SYSTEM_ORDER) {
      let newTotalSystemLen = 0;
      let newActiveSystemLen = 0;
      let res = "";
      for (let phase of PhaseValueList) {
        const phaseName = Phase[phase];
        res += phaseName + "\n";
        for (let sysName of phases.get(phase)!) {
          let sys = allSystemsByName.get(sysName)!;
          if (activeSystemsById.has(sys.id)) {
            res += "  " + sysName + "\n";
            newActiveSystemLen++;
          } else {
            res += "  (" + sysName + ")\n";
          }
          newTotalSystemLen++;
        }
      }
      if (
        _dbgLastSystemLen !== newTotalSystemLen ||
        _dbgLastActiveSystemLen !== newActiveSystemLen
      ) {
        console.log(res);
        _dbgLastSystemLen = newTotalSystemLen;
        _dbgLastActiveSystemLen = newActiveSystemLen;
      }
    }

    for (let phase of PhaseValueList) {
      for (let sName of phases.get(phase)!) {
        // look up
        const s = allSystemsByName.get(sName);
        assert(s, `Can't find system with name: ${sName}`);

        // run
        _currentRunningSystem = s;
        tryCallSystem(s);
        _currentRunningSystem = undefined;
      }
    }
  }

  function hasEntity(id: number) {
    return entities.has(id);
  }

  // TODO(@darzu): rethink how component add/remove happens. This is maybe always flags
  function removeComponent<C extends ComponentDef>(id: number, def: C) {
    if (!tryRemoveComponent(id, def))
      throw `Tried to remove absent component ${def.name} from entity ${id}`;
  }

  function tryRemoveComponent<C extends ComponentDef>(
    id: number,
    def: C
  ): boolean {
    const e = entities.get(id)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      return false;
    }

    // update query cache
    const systems = _componentToSystems.get(def.name);
    for (let sysId of systems ?? []) {
      if (
        sysId === _currentRunningSystem?.id &&
        !_currentRunningSystem.flags.allowQueryEdit
      )
        console.warn(
          `Removing component '${def.name}' while running system '${_currentRunningSystem.name}'` +
            ` which queries it. Set the "allowQueryEdit" flag on the system if intentional` +
            ` (and probably loop over the query backwards.`
        );
      const es = _systemsToEntities.get(sysId);
      if (es) {
        // TODO(@darzu): perf. sorted removal
        const indx = es.findIndex((v) => v.id === id);
        if (indx >= 0) {
          es.splice(indx, 1);
        }
      }
    }
    if (isDeadC(def)) {
      const eSystems = _entitiesToSystems.get(id)!;
      eSystems.length = 0;
      for (let sysId of activeSystemsById.keys()) {
        const allNeededCs = _systemsToComponents.get(sysId);
        if (allNeededCs?.every((n) => n in e)) {
          // TODO(@darzu): perf. sorted insert
          _systemsToEntities.get(sysId)!.push(e);
          eSystems.push(sysId);
        }
      }
    }

    return true;
  }

  function keepOnlyComponents<CS extends ComponentDef[]>(
    id: number,
    cs: [...CS]
  ) {
    let ent = entities.get(id) as any;
    if (!ent) throw `Tried to delete non-existent entity ${id}`;
    for (let component of componentDefs.values()) {
      if (!cs.includes(component) && ent[component.name]) {
        removeComponent(id, component);
      }
    }
  }

  function hasComponents<CS extends ComponentDef[], E extends Entity>(
    e: E,
    cs: [...CS]
  ): e is E & EntityW<CS> {
    return cs.every((c) => c.name in e);
  }

  function findEntity<CS extends ComponentDef[], ID extends number>(
    id: ID,
    cs: readonly [...CS]
  ): EntityW<CS, ID> | undefined {
    const e = entities.get(id);
    if (!e || !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as EntityW<CS, ID>;
  }

  // TODO(@darzu): remove? i think this is unused
  function findEntitySet<ES extends EDefId<number, any>[]>(
    es: [...ES]
  ): ESetId<ES> {
    const res = [];
    for (let [id, ...cs] of es) {
      res.push(findEntity(id, cs));
    }
    return res as ESetId<ES>;
  }

  // TODO(@darzu): PERF. cache these responses like we do systems?
  // TODO(@darzu): PERF. evaluate all per-frame uses of this
  function filterEntities_uncached<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS> {
    const res: Entities<CS> = [];
    if (cs === null) return res;
    const inclDead = cs.some((c) => isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
    for (let e of entities.values()) {
      if (!inclDead && isDeadE(e)) continue;
      if (e.id === 0) continue; // TODO(@darzu): Remove ent 0, make first-class Resources
      if (cs.every((c) => c.name in e)) {
        res.push(e as EntityW<CS>);
      } else {
        // TODO(@darzu): easier way to help identify these errors?
        // console.log(
        //   `${e.id} is missing ${cs
        //     .filter((c) => !(c.name in e))
        //     .map((c) => c.name)
        //     .join(".")}`
        // );
      }
    }
    return res;
  }

  function dbgGetSystemsForEntity(id: number) {
    const sysIds = _entitiesToSystems.get(id) ?? [];
    const systems = sysIds
      .map((id) => activeSystemsById.get(id))
      .filter((x) => !!x) as SystemReg[];
    return systems;
  }

  function dbgFilterEntitiesByKey(cs: string | string[]): Entities<any> {
    // TODO(@darzu): respect "DeadDef" comp ?
    console.log(
      "filterEntitiesByKey called--should only be called from console"
    );
    const res: Entities<any> = [];
    if (typeof cs === "string") cs = [cs];
    for (let e of entities.values()) {
      if (cs.every((c) => c in e)) {
        res.push(e as EntityW<any>);
      } else {
        // TODO(@darzu): easier way to help identify these errors?
        // console.log(
        //   `${e.id} is missing ${cs
        //     .filter((c) => !(c.name in e))
        //     .map((c) => c.name)
        //     .join(".")}`
        // );
      }
    }
    return res;
  }

  // TODO(@darzu): "addSystemWInit" that is like wrapping an addSystem in an addEagerInit so you can have
  //  some global resources around
  // TODO(@darzu): add support for "run every X frames or ms" ?
  // TODO(@darzu): add change detection
  let _nextSystemId = 1;
  function addSystem<CS extends ComponentDef[], RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS],
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): PublicSystemReg;
  function addSystem<CS extends null, RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): PublicSystemReg;
  function addSystem<CS extends ComponentDef[], RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS] | null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): PublicSystemReg {
    name = name || callback.name;
    if (name === "") {
      throw new Error(
        `To define a system with an anonymous function, pass an explicit name`
      );
    }
    if (allSystemsByName.has(name))
      throw `System named ${name} already defined. Try explicitly passing a name`;
    const id = _nextSystemId;
    _nextSystemId += 1;
    const sys: SystemReg = {
      cs,
      rs,
      callback,
      name,
      phase,
      id,
      flags: {},
    };
    allSystemsByName.set(name, sys);

    // NOTE: even though we might not active the system right away, we want to respect the
    //  order in which it was added to the phase.
    phases.get(phase)!.push(name);

    const seenAllCmps = (sys.cs ?? []).every((c) => seenComponents.has(c.id));
    const seenAllRes = sys.rs.every((c) => _resources.seenResources.has(c.id));
    if (seenAllCmps && seenAllRes) {
      activateSystem(sys);
    } else {
      // NOTE: we delay activating the system b/c each active system incurs
      //  a cost to maintain its query accelerators on each entity and component
      //  added/removed
      _init.addEagerInit(
        sys.cs ?? [],
        sys.rs,
        [],
        () => {
          activateSystem(sys);
        },
        `sysinit_${sys.name}`
      );
    }

    return sys;
  }

  function activateSystem(sys: SystemReg) {
    const { cs, id, name, phase } = sys;

    activeSystemsById.set(id, sys);
    sysStats[name] = {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
    };

    // update query cache:
    //  pre-compute entities for this system for quicker queries; these caches will be maintained
    //  by add/remove/ensure component calls
    // TODO(@darzu): ability to toggle this optimization on/off for better debugging
    const es = filterEntities_uncached(cs);
    _systemsToEntities.set(id, [...es]);
    if (cs) {
      for (let c of cs) {
        if (!_componentToSystems.has(c.name))
          _componentToSystems.set(c.name, [id]);
        else _componentToSystems.get(c.name)!.push(id);
      }
      _systemsToComponents.set(
        id,
        cs.map((c) => c.name)
      );
    }
    for (let e of es) {
      const ss = _entitiesToSystems.get(e.id);
      assertDbg(ss);
      ss.push(id);
    }
  }

  function hasSystem(name: string) {
    return allSystemsByName.has(name);
  }

  function tryCallSystem(s: SystemReg): boolean {
    // TODO(@darzu):
    // if (name.endsWith("Build")) console.log(`calling ${name}`);
    // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");

    if (!activeSystemsById.has(s.id)) {
      return false;
    }

    let start = performance.now();
    // try looking up in the query cache
    let es: Entities<any[]>;
    if (s.cs) {
      assertDbg(
        _systemsToEntities.has(s.id),
        `System ${s.name} doesn't have a query cache!`
      );
      es = _systemsToEntities.get(s.id)! as EntityW<any[]>[];
    } else {
      es = [];
    }
    // TODO(@darzu): uncomment to debug query cache issues
    // es = filterEntities(s.cs);

    const rs = _resources.getResources(s.rs); // TODO(@darzu): remove allocs here
    let afterQuery = performance.now();
    sysStats[s.name].queries++;
    emStats.queryTime += afterQuery - start;
    if (!rs) {
      // we don't yet have the resources, check if we can init any
      s.rs.forEach((r) => {
        const forced = _init.requestResourceInit(r);
        if (DBG_INIT_CAUSATION && forced) {
          console.log(
            `${performance.now().toFixed(0)}ms: '${r.name}' force by system ${
              s.name
            }`
          );
        }
      });
      return true;
    }

    resetTempMatrixBuffer(s.name);

    // we have the resources, run the system
    // TODO(@darzu): how do we handle async systems?
    s.callback(es, rs);

    // // TODO(@darzu): DEBUG. Promote to a dbg flag? Maybe pre-post system watch predicate
    // if (es.length && es[0].id === 10001) {
    //   const doesHave = "rendererWorldFrame" in es[0];
    //   const isUndefined =
    //     doesHave && (es[0] as any)["rendererWorldFrame"] === undefined;
    //   console.log(
    //     `after ${s.name}: ${es[0].id} ${
    //       doesHave ? "HAS" : "NOT"
    //     } .rendererWorldFrame ${isUndefined ? "===" : "!=="} undefined`
    //   );
    // }

    let afterCall = performance.now();
    sysStats[s.name].calls++;
    const thisCallTime = afterCall - afterQuery;
    sysStats[s.name].callTime += thisCallTime;
    sysStats[s.name].maxCallTime = Math.max(
      sysStats[s.name].maxCallTime,
      thisCallTime
    );

    return true;
  }

  // private _callSystem(name: string) {
  //   if (!maybeRequireSystem(name)) throw `No system named ${name}`;
  // }

  // TODO(@darzu): use version numbers instead of dirty flag?
  const _changedEntities = new Set<number>();

  // _dbgFirstXFrames = 10;
  // dbgStrEntityPromises() {
  //   let res = "";
  //   res += `changed ents: ${[..._changedEntities.values()].join(",")}\n`;
  //   entityPromises.forEach((promises, id) => {
  //     for (let s of promises) {
  //       const unmet = s.cs.filter((c) => !c.isOn(s.e)).map((c) => c.name);
  //       res += `#${id} is waiting for ${unmet.join(",")}\n`;
  //     }
  //   });
  //   return res;
  // }

  function dbgEntityPromises(): string {
    let res = "";
    for (let [id, prom] of entityPromises.entries()) {
      const ent = entities.get(id) || { id };
      const unmet = prom
        .flatMap((p) => p.cs.map((c) => c.name))
        .filter((n) => !(n in ent));

      res += `ent waiting: ${id} <- (${unmet.join(",")})\n`;
    }
    return res;
  }

  // TODO(@darzu): can this consolidate with the InitFn system?
  // TODO(@darzu): PERF TRACKING. Need to rethink how this interacts with system and init fn perf tracking
  // TODO(@darzu): EXPERIMENT: returns madeProgress
  function checkEntityPromises(): boolean {
    let madeProgress = false;
    // console.dir(entityPromises);
    // console.log(dbgStrEntityPromises());
    // _dbgFirstXFrames--;
    // if (_dbgFirstXFrames <= 0) throw "STOP";

    const beforeOneShots = performance.now();

    // check entity promises
    let finishedEntities: Set<number> = new Set();
    entityPromises.forEach((promises, id) => {
      // no change
      if (!_changedEntities.has(id)) {
        // console.log(`no change on: ${id}`);
        return;
      }

      // check each promise (reverse so we can remove)
      for (let idx = promises.length - 1; idx >= 0; idx--) {
        const s = promises[idx];

        // promise full filled?
        if (!s.cs.every((c) => c.name in s.e)) {
          // console.log(`still doesn't match: ${id}`);
          continue;
        }

        // call callback
        const afterOneShotQuery = performance.now();
        const stats = sysStats["__oneShots"];
        stats.queries += 1;
        emStats.queryTime += afterOneShotQuery - beforeOneShots;

        promises.splice(idx, 1);
        // TODO(@darzu): how to handle async callbacks and their timing?
        // TODO(@darzu): one idea: only call the callback in the same phase or system
        //    timing location that originally asked for the promise
        s.callback(s.e);
        madeProgress = true;

        const afterOneShotCall = performance.now();
        stats.calls += 1;
        const thisCallTime = afterOneShotCall - afterOneShotQuery;
        stats.callTime += thisCallTime;
        stats.maxCallTime = Math.max(stats.maxCallTime, thisCallTime);
      }

      // clean up
      if (promises.length === 0) finishedEntities.add(id);
    });

    // clean up
    for (let id of finishedEntities) {
      entityPromises.delete(id);
    }
    _changedEntities.clear();

    return madeProgress;
  }

  // TODO(@darzu): good or terrible name?
  // TODO(@darzu): another version for checking entity promises?
  // TODO(@darzu): update with new init system
  function whyIsntSystemBeingCalled(name: string): void {
    // TODO(@darzu): more features like check against a specific set of entities
    const sys = allSystemsByName.get(name);
    if (!sys) {
      console.warn(`No systems found with name: '${name}'`);
      return;
    }

    let haveAllResources = true;
    for (let _r of sys.rs) {
      let r = _r as ResourceDef;
      if (!_resources.getResource(r)) {
        console.warn(`System '${name}' missing resource: ${r.name}`);
        haveAllResources = false;
      }
    }

    const es = filterEntities_uncached(sys.cs);
    console.warn(
      `System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`
    );
  }

  let _nextEntityPromiseId: number = 0;
  const _dbgEntityPromiseCallsites = new Map<number, string>();

  // TODO(@darzu): Rethink naming here
  // NOTE: if you're gonna change the types, change registerSystem first and just copy
  //  them down to here
  // TODO(@darzu): Used for waiting on:
  //    uniform e.g. RenderDataStdDef, Finished, WorldFrame, RenderableDef (enable/hidden/meshHandle)),
  //    Renderable for updateMeshQuadInds etc, PhysicsStateDef for physCollider aabb,
  function whenEntityHas<
    // eCS extends ComponentDef[],
    CS extends ComponentDef[],
    ID extends number
  >(e: EntityW<ComponentDef[], ID>, ...cs: CS): Promise<EntityW<CS, ID>> {
    // short circuit if we already have the components
    if (cs.every((c) => c.name in e))
      return Promise.resolve(e as EntityW<CS, ID>);

    // TODO(@darzu): this is too copy-pasted from registerSystem
    // TODO(@darzu): need unified query maybe?
    // let _name = "oneShot" + ++;

    // if (entityPromises.has(_name))
    //   throw `One-shot single system named ${_name} already defined.`;

    // use one bucket for all one shots. Change this if we want more granularity
    sysStats["__oneShots"] = sysStats["__oneShots"] ?? {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
      queryTime: 0,
    };

    const promiseId = _nextEntityPromiseId++;

    if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
      // if (dbgOnce("getCallStack")) console.dir(getCallStack());
      let line = getCallStack().find(
        (s) =>
          !s.includes("entity-manager") && //
          !s.includes("em-helpers")
      )!;

      if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
        console.log(
          `promise #${promiseId}: ${componentsToString(cs)} from: ${line}`
        );
      _dbgEntityPromiseCallsites.set(promiseId, line);
    }

    return new Promise<EntityW<CS, ID>>((resolve, reject) => {
      const sys: EntityPromise<CS, ID> = {
        id: promiseId,
        e,
        cs,
        callback: resolve,
        // name: _name,
      };

      if (entityPromises.has(e.id)) entityPromises.get(e.id)!.push(sys);
      else entityPromises.set(e.id, [sys]);
    });
  }

  // TODO(@darzu): feels a bit hacky; lets track usages and see if we can make this
  //  feel natural.
  // TODO(@darzu): is perf okay here?
  function whenSingleEntity<CS extends ComponentDef[]>(
    ...cs: [...CS]
  ): Promise<EntityW<CS>> {
    return new Promise((resolve) => {
      const ents = filterEntities_uncached(cs);
      if (ents.length === 1) resolve(ents[0]);
      _init.addEagerInit(cs, [], [], () => {
        const ents = filterEntities_uncached(cs);
        if (!ents || ents.length !== 1)
          assert(
            false,
            `Invalid 'whenSingleEntity' call; found ${
              ents.length
            } matching entities for '${cs.map((c) => c.name).join(",")}'`
          );
        resolve(ents[0]);
      });
    });
  }

  function update() {
    // TODO(@darzu): can EM.update() be a system?
    let madeProgress: boolean;
    do {
      madeProgress = false;
      madeProgress ||= _init.progressInitFns();
      madeProgress ||= _resources.checkResourcePromises();
      madeProgress ||= checkEntityPromises();
    } while (madeProgress);

    callSystems();
    emStats.dbgLoops++;
  }

  const _em: _EntityManager = {
    entities,
    allSystemsByName,
    emStats,
    sysStats,
    componentDefs,
    seenComponents,

    defineComponent,
    defineNonupdatableComponent,
    registerSerializerPair,
    serialize,
    deserialize,
    setDefaultRange,
    setIdRange,
    mk,
    registerEntity,
    addComponent,
    addComponentByName,
    ensureComponent,
    set,
    setOnce,
    hasEntity,
    removeComponent,
    tryRemoveComponent,
    keepOnlyComponents,
    hasComponents,
    findEntity,
    findEntitySet,
    filterEntities_uncached,
    dbgGetSystemsForEntity,
    dbgFilterEntitiesByKey,
    addSystem,
    hasSystem,
    whenEntityHas,
    whenSingleEntity,
    update,
  };

  return _em;
}

export const _em: _EntityManager = createEntityManager();

export const EM: EntityManager = {
  ..._resources,
  ..._em,
  ..._init,
};
