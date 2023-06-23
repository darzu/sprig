import {
  DBG_ASSERT,
  DBG_VERBOSE_ENTITY_PROMISE_CALLSITES,
  DBG_VERBOSE_INIT_CALLSITES,
  DBG_INIT_CAUSATION,
  DBG_VERBOSE_INIT_SEQ,
  DBG_SYSTEM_ORDER,
} from "../flags.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import {
  assert,
  assertDbg,
  dbgOnce,
  getCallStack,
  hashCode,
  Intersect,
  isPromise,
  toMap,
} from "../utils/util.js";
import { Phase, PhaseValueList } from "./sys-phase.js";

// TODO(@darzu): re-check all uses of "any" and prefer "unknown"
//    see: https://github.com/Microsoft/TypeScript/pull/24439

// TODO(@darzu): for perf, we really need to move component data to be
//  colocated in arrays; and maybe introduce "arch-types" for commonly grouped
//  components and "worlds" to section off entities.

export interface Entity {
  readonly id: number;
}

export type ResId = number;

export interface ResourceDef<
  N extends string = string,
  P = any,
  Pargs extends any[] = any[]
> {
  _brand: "resourceDef"; // TODO(@darzu): remove once ResourceDef & ComponentDef are incompatible
  readonly id: ResId;
  readonly name: N;
  construct: (...args: Pargs) => P;
}

export type CompId = number;

// TODO(@darzu): Consider having a "NonsyncableComponentDef" or "NonupdatableComponentDef" that
//  can take constructor args but can't be synced and throws an error if u use EM.set twice since
//  it can't update. See "NonUpdatableComponentDef" branch for one attempt, but i ran into type
//  issues i couldn't fix.

export interface ComponentDef<
  N extends string = string,
  P = any,
  Pargs extends any[] = any[]
> {
  _brand: "componentDef"; // TODO(@darzu): remove once ResourceDef & ComponentDef are incompatible
  readonly name: N;
  // TODO(@darzu): Instead of a constructor, we should require a copy fn that can
  //  both initialize a new obj or copy new properties into an existing one. This
  //  is really important for entity pools where entities are re-used and we need
  //  to either "create new component with properties or stamp these properties
  //  into existing component". Than method doesnt exist yet b/c we lack a standard
  //  copy/construct fn.
  // TODO(@darzu): while we're at it, we might require that components are always
  //  objects. E.g. no naked numbers or booleans. There's some other reason i think
  //  we want this that is eluding me..
  /* 
  TODO(@darzu):
    ? require a copy fn and a () => P constructor
    no way to have EM.set(ent, V(0,0,0)) w/o copy fn b/c it may exist
    EM.add: for must-not-exist-yet add a component
    EM.set: add or set, requires copy fn
    EM.update: must exist already, requires copy fn
    could be all components are objects
      default copy fn is just object.assign
    if we have term-level field info, we could have a default serializer/deserializer
      but we like to either write those by hand or rely on a compile pass which can use type info
    how important is taking in ...args as opposed to a P?
    could have constructor fn `() => P` and update fn `(p: P, ...args: Pargs) => void`
    better to put more burden at component def time than EM.set time
    how do these interact with deserialize?
    copy is just one type of update
    construct + update
    that would solve my bug, b/c u must provide ()=>P
    deserialization is just one kind of update
    for entity pools, since the components would exist, the update would be natural?
      could skip seperating the create & onSpawn? nah. well maybe optionally.
  */
  construct: (...args: Pargs) => P;
  // make: () => P;
  // update: (p: P, ...args: Pargs) => P;
  readonly id: CompId;
  isOn: <E extends Entity>(e: E) => e is E & { [K in N]: P };
}
export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

export type Resource<DEF> = DEF extends ResourceDef<any, infer P> ? P : never;

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
} & Intersect<{ [P in keyof CS]: WithComponent<CS[P]> }>;

export type WithResource<D> = D extends ResourceDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
export type Resources<RS extends readonly ResourceDef[]> = Intersect<{
  [P in keyof RS]: WithResource<RS[P]>;
}>;

export type Entities<CS extends ComponentDef[]> = EntityW<CS>[];
export type ReadonlyEntities<CS extends ComponentDef[]> =
  readonly EntityW<CS>[];

export type SystemFn<
  CS extends ComponentDef[] | null = ComponentDef[] | null,
  RS extends ResourceDef[] = ResourceDef[]
> = (
  es: CS extends ComponentDef[] ? ReadonlyEntities<CS> : [],
  resources: Resources<RS>
) => void;

interface SystemReg {
  cs: ComponentDef[] | null;
  rs: ResourceDef[];
  callback: SystemFn;
  name: string;
  phase: Phase;
  id: number;
}

export type InitFnId = number;

export type InitFn<RS extends ResourceDef[] = ResourceDef[]> =
  | ((rs: Resources<RS>) => Promise<void>)
  | ((rs: Resources<RS>) => void);

export interface InitFnReg<RS extends ResourceDef[] = ResourceDef[]> {
  requireRs: [...RS];
  requireCompSet?: ComponentDef[];
  provideRs: ResourceDef[];
  eager?: boolean; // TODO(@darzu): flop this to lazy? more clear. make required?
  fn: InitFn<RS>;
  id: InitFnId;
  name?: string; // TODO(@darzu): make required?
}

export function initFnToString(init: InitFnReg) {
  return `${init.name ?? `#${init.id}`}:${componentsToString(
    init.requireRs
  )} -> ${componentsToString(init.provideRs)}`;
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

type ResourcesPromise<RS extends ResourceDef[]> = {
  id: number;
  rs: RS;
  callback: (e: Resources<RS>) => void;
};

// TODO(@darzu): remove? i think these r unused
type EDefId<ID extends number, CS extends ComponentDef[]> = [ID, ...CS];
type ESetId<DS extends EDefId<number, any>[]> = {
  [K in keyof DS]: DS[K] extends EDefId<infer ID, infer CS>
    ? EntityW<CS, ID> | undefined
    : never;
};

export type EDef<CS extends ComponentDef[]> = readonly [...CS];
export type ESet<DS extends EDef<any>[]> = {
  [K in keyof DS]: DS[K] extends EDef<infer CS> ? EntityW<CS, number> : never;
};

function nameToId(name: string): number {
  return hashCode(name);
}

interface SystemStats {
  callTime: number;
  maxCallTime: number;
  queries: number;
  calls: number;
}

// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)

export class EntityManager {
  entities: Map<number, Entity> = new Map();
  allSystemsByName: Map<string, SystemReg> = new Map();
  activeSystemsById: Map<number, SystemReg> = new Map();
  phases: Map<Phase, string[]> = toMap(
    PhaseValueList,
    (n) => n,
    (_) => [] as string[]
  );
  entityPromises: Map<number, EntityPromise<ComponentDef[], any>[]> = new Map();
  resourcePromises: ResourcesPromise<ResourceDef[]>[] = [];
  components: Map<CompId, ComponentDef> = new Map(); // TODO(@darzu): rename to componentDefs ?
  resourceDefs: Map<ResId, ResourceDef> = new Map();
  resources: Record<string, unknown> = {};

  serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  ranges: Record<string, { nextId: number; maxId: number }> = {};
  defaultRange: string = "";
  sysStats: Record<string, SystemStats> = {};
  initFnMsStats = new Map<InitFnId, number>();
  emStats = {
    queryTime: 0,
  };

  // TODO(@darzu): move elsewhere
  dbgLoops: number = 0;

  // QUERY SYSTEM
  // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
  //    would make certain scan operations (like updating them on component add/remove)
  //    cheaper. And perhaps better gameplay code too.
  private _systemsToEntities: Map<number, Entity[]> = new Map();
  // NOTE: _entitiesToSystems is only needed because of DeadDef
  private _entitiesToSystems: Map<number, number[]> = new Map();
  private _systemsToComponents: Map<number, string[]> = new Map();
  private _componentToSystems: Map<string, number[]> = new Map();

  constructor() {
    // dummy ent 0
    // const ent0 = Object.create(null); // no prototype
    // ent0.id = 0;
    // this.entities.set(0, ent0);
  }

  public defineResource<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ResourceDef<N, P, Pargs> {
    const id = nameToId(name);
    if (this.resourceDefs.has(id)) {
      throw `Resource with name ${name} already defined--hash collision?`;
    }
    const def: ResourceDef<N, P, Pargs> = {
      _brand: "resourceDef", // TODO(@darzu): remove?
      name,
      construct,
      id,
    };
    this.resourceDefs.set(id, def);
    return def;
  }

  // TODO(@darzu): REFACTOR! Consolidate w/ defineComponent below
  public defineComponent2<N extends string, P, Pargs extends any[]>(
    name: N,
    // construct: (...args: Pargs) => P
    make: () => P,
    update: (p: P, ...args: Pargs) => P
  ): ComponentDef<N, P, Pargs> {
    // TODO(@darzu): Remove!
    const construct = (...args: Pargs) => {
      return update(make(), ...args);
    };
    return this.defineComponent(name, construct);
  }

  public defineComponent<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
    // make: () => P,
    // update: (p: P, ...args: Pargs) => P
  ): ComponentDef<N, P, Pargs> {
    const id = nameToId(name);
    if (this.components.has(id)) {
      throw `Component with name ${name} already defined--hash collision?`;
    }
    const component: ComponentDef<N, P, Pargs> = {
      _brand: "componentDef", // TODO(@darzu): remove?
      name,
      construct,
      // make,
      // update,
      id,
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } =>
        // (e as Object).hasOwn(name),
        name in e,
    };
    // // TODO(@darzu): I don't love this cast. feels like it should be possible without..
    // this.components.set(id, component as unknown as ComponentDef);
    this.components.set(id, component);
    return component;
  }

  private checkComponent<N extends string, P, Pargs extends any[]>(
    def: ComponentDef<N, P, Pargs>
  ) {
    if (!this.components.has(def.id))
      throw `Component ${def.name} (id ${def.id}) not found`;
    if (this.components.get(def.id)!.name !== def.name)
      throw `Component id ${def.id} has name ${
        this.components.get(def.id)!.name
      }, not ${def.name}`;
  }

  public registerSerializerPair<N extends string, P, Pargs extends any[]>(
    def: ComponentDef<N, P, Pargs>,
    serialize: (obj: P, buf: Serializer) => void,
    deserialize: (obj: P, buf: Deserializer) => void
  ) {
    this.serializers.set(def.id, { serialize, deserialize });
  }

  public serialize(id: number, componentId: number, buf: Serializer) {
    const def = this.components.get(componentId);
    if (!def) throw `Trying to serialize unknown component id ${componentId}`;
    const entity = this.findEntity(id, [def]);
    if (!entity)
      throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
    const serializerPair = this.serializers.get(componentId);
    if (!serializerPair)
      throw `No serializer for component ${def.name} (for entity ${id})`;

    // TODO(@darzu): DBG
    // if (componentId === 1867295084) {
    //   console.log(`serializing 1867295084`);
    // }

    serializerPair.serialize(entity[def.name], buf);
  }

  public deserialize(id: number, componentId: number, buf: Deserializer) {
    const def = this.components.get(componentId);
    if (!def) throw `Trying to deserialize unknown component id ${componentId}`;
    if (!this.hasEntity(id)) {
      throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
    }
    let entity = this.findEntity(id, [def]);
    let component;
    // TODO: because of this usage of dummy, deserializers don't
    // actually need to read buf.dummy
    if (buf.dummy) {
      component = {} as any;
    } else if (!entity) {
      component = this.addComponent(id, def);
    } else {
      component = entity[def.name];
    }
    const serializerPair = this.serializers.get(componentId);
    if (!serializerPair)
      throw `No deserializer for component ${def.name} (for entity ${id})`;

    // TODO(@darzu): DBG
    // if (componentId === 1867295084) {
    //   console.log(`deserializing 1867295084, dummy: ${buf.dummy}`);
    // }

    serializerPair.deserialize(component, buf);
  }

  public setDefaultRange(rangeName: string) {
    this.defaultRange = rangeName;
  }

  public setIdRange(rangeName: string, nextId: number, maxId: number) {
    this.ranges[rangeName] = { nextId, maxId };
  }

  // TODO(@darzu): dont return the entity!
  public new(rangeName?: string): Entity {
    if (rangeName === undefined) rangeName = this.defaultRange;
    const range = this.ranges[rangeName];
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
    this.entities.set(e.id, e);
    this._entitiesToSystems.set(e.id, []);
    return e;
  }

  public registerEntity(id: number): Entity {
    assert(!this.entities.has(id), `EntityManager already has id ${id}!`);
    /* TODO: should we do the check below but for all ranges?
    if (this.nextId <= id && id < this.maxId)
    throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
    */
    // const e = { id: id };
    const e = Object.create(null); // no prototype
    e.id = id;
    this.entities.set(e.id, e);
    this._entitiesToSystems.set(e.id, []);
    return e;
  }

  // TODO(@darzu): hacky, special components
  private isDeletedE(e: Entity) {
    return "deleted" in e;
  }
  private isDeadE(e: Entity) {
    return "dead" in e;
  }
  private isDeadC(e: ComponentDef<any, any, any>) {
    return "dead" === e.name;
  }

  public addComponent<N extends string, P, Pargs extends any[] = any[]>(
    id: number,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    this.checkComponent(def);
    if (id === 0) throw `hey, use addResource!`;
    const e = this.entities.get(id)!;
    // TODO: this is hacky--EM shouldn't know about "deleted"
    if (DBG_ASSERT && this.isDeletedE(e)) {
      console.error(
        `Trying to add component ${def.name} to deleted entity ${id}`
      );
    }
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
    const c = def.construct(...args);
    // let c = def.make();
    // c = def.update(c, ...args);
    (e as any)[def.name] = c;

    // update query caches
    {
      let _beforeQueryCache = performance.now();
      this.seenComponents.add(def.id);
      const eSystems = this._entitiesToSystems.get(e.id)!;
      if (this.isDeadC(def)) {
        // remove from every current system
        eSystems.forEach((s) => {
          const es = this._systemsToEntities.get(s)!;
          // TODO(@darzu): perf. sorted removal
          const indx = es.findIndex((v) => v.id === id);
          if (indx >= 0) es.splice(indx, 1);
        });
        eSystems.length = 0;
      }
      const systems = this._componentToSystems.get(def.name);
      for (let sysId of systems ?? []) {
        const allNeededCs = this._systemsToComponents.get(sysId);
        if (allNeededCs?.every((n) => n in e)) {
          // TODO(@darzu): perf. sorted insert
          this._systemsToEntities.get(sysId)!.push(e);
          eSystems.push(sysId);
        }
      }
      this.emStats.queryTime += performance.now() - _beforeQueryCache;
    }

    // track changes for entity promises
    // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
    this._changedEntities.add(e.id);

    return c;
  }

  public addComponentByName(id: number, name: string, ...args: any): any {
    console.log(
      "addComponentByName called, should only be called for debugging"
    );
    let component = this.components.get(nameToId(name));
    if (!component) {
      throw `no component named ${name}`;
    }
    return this.addComponent(id, component, ...args);
  }

  public ensureComponent<N extends string, P, Pargs extends any[] = any[]>(
    id: number,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    this.checkComponent(def);
    const e = this.entities.get(id)!;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return this.addComponent(id, def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }
  // TODO(@darzu): do we want to make this the standard way we do ensureComponent and addComponent ?
  // TODO(@darzu): rename to "set" and have "maybeSet" w/ a thunk as a way to short circuit unnecessary init?
  //      and maybe "strictSet" as the version that throws if it exists (renamed from "addComponent")
  public ensureComponentOn<N extends string, P, Pargs extends any[] = []>(
    e: Entity,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): asserts e is EntityW<[ComponentDef<N, P, Pargs>]> {
    const alreadyHas = def.name in e;
    // assert(!alreadyHas, `${e.id} already has ${def.name}`);
    if (!alreadyHas) {
      this.addComponent(e.id, def, ...args);
    }
  }

  public addResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    assert(
      this.resourceDefs.has(def.id),
      `Resource ${def.name} (id ${def.id}) not found`
    );
    assert(
      this.resourceDefs.get(def.id)!.name === def.name,
      `Resource id ${def.id} has name ${
        this.resourceDefs.get(def.id)!.name
      }, not ${def.name}`
    );
    assert(
      !(def.name in this.resources),
      `double defining resource ${def.name}!`
    );

    const c = def.construct(...args);
    this.resources[def.name] = c;
    this._changedEntities.add(0); // TODO(@darzu): seperate Resources from Entities
    this.seenResources.add(def.id);
    return c;
  }

  public ensureResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    const alreadyHas = def.name in this.resources;
    if (!alreadyHas) {
      return this.addResource(def, ...args);
    } else {
      return this.resources[def.name] as P;
    }
  }

  public removeResource<C extends ResourceDef>(def: C) {
    if (def.name in this.resources) {
      delete this.resources[def.name];
    } else {
      throw `Tried to remove absent resource ${def.name}`;
    }
  }

  // TODO(@darzu): should this be public??
  // TODO(@darzu): rename to findResource
  public getResource<C extends ResourceDef>(
    c: C
  ): (C extends ResourceDef<any, infer P> ? P : never) | undefined {
    return this.resources[c.name] as any;
  }
  // TODO(@darzu): remove? we should probably be using "whenResources"
  public getResources<RS extends ResourceDef[]>(
    rs: [...RS]
  ): Resources<RS> | undefined {
    if (rs.every((r) => r.name in this.resources))
      return this.resources as Resources<RS>;
    return undefined;
  }

  _dbgLastSystemLen = 0;
  _dbgLastActiveSystemLen = 0;
  private callSystems() {
    if (DBG_SYSTEM_ORDER) {
      let newTotalSystemLen = 0;
      let newActiveSystemLen = 0;
      let res = "";
      for (let phase of PhaseValueList) {
        const phaseName = Phase[phase];
        res += phaseName + "\n";
        for (let sysName of this.phases.get(phase)!) {
          let sys = this.allSystemsByName.get(sysName)!;
          if (this.activeSystemsById.has(sys.id)) {
            res += "  " + sysName + "\n";
            newActiveSystemLen++;
          } else {
            res += "  (" + sysName + ")\n";
          }
          newTotalSystemLen++;
        }
      }
      if (
        this._dbgLastSystemLen !== newTotalSystemLen ||
        this._dbgLastActiveSystemLen !== newActiveSystemLen
      ) {
        console.log(res);
        this._dbgLastSystemLen = newTotalSystemLen;
        this._dbgLastActiveSystemLen = newActiveSystemLen;
      }
    }

    for (let phase of PhaseValueList) {
      for (let s of this.phases.get(phase)!) {
        this.tryCallSystem(s);
      }
    }
  }

  public hasEntity(id: number) {
    return this.entities.has(id);
  }

  public removeComponent<C extends ComponentDef>(id: number, def: C) {
    if (!this.tryRemoveComponent(id, def))
      throw `Tried to remove absent component ${def.name} from entity ${id}`;
  }

  public tryRemoveComponent<C extends ComponentDef>(
    id: number,
    def: C
  ): boolean {
    const e = this.entities.get(id)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      return false;
    }

    // update query cache
    const systems = this._componentToSystems.get(def.name);
    for (let name of systems ?? []) {
      const es = this._systemsToEntities.get(name);
      if (es) {
        // TODO(@darzu): perf. sorted removal
        const indx = es.findIndex((v) => v.id === id);
        if (indx >= 0) {
          es.splice(indx, 1);
        }
      }
    }
    if (this.isDeadC(def)) {
      const eSystems = this._entitiesToSystems.get(id)!;
      eSystems.length = 0;
      for (let sysId of this.activeSystemsById.keys()) {
        const allNeededCs = this._systemsToComponents.get(sysId);
        if (allNeededCs?.every((n) => n in e)) {
          // TODO(@darzu): perf. sorted insert
          this._systemsToEntities.get(sysId)!.push(e);
          eSystems.push(sysId);
        }
      }
    }

    return true;
  }

  public keepOnlyComponents<CS extends ComponentDef[]>(
    id: number,
    cs: [...CS]
  ) {
    let ent = this.entities.get(id) as any;
    if (!ent) throw `Tried to delete non-existent entity ${id}`;
    for (let component of this.components.values()) {
      if (!cs.includes(component) && ent[component.name]) {
        this.removeComponent(id, component);
      }
    }
  }

  public hasComponents<CS extends ComponentDef[], E extends Entity>(
    e: E,
    cs: [...CS]
  ): e is E & EntityW<CS> {
    return cs.every((c) => c.name in e);
  }

  public findEntity<CS extends ComponentDef[], ID extends number>(
    id: ID,
    cs: readonly [...CS]
  ): EntityW<CS, ID> | undefined {
    const e = this.entities.get(id);
    if (!e || !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as EntityW<CS, ID>;
  }

  // TODO(@darzu): remove? i think this is unused
  public findEntitySet<ES extends EDefId<number, any>[]>(
    es: [...ES]
  ): ESetId<ES> {
    const res = [];
    for (let [id, ...cs] of es) {
      res.push(this.findEntity(id, cs));
    }
    return res as ESetId<ES>;
  }

  // TODO(@darzu): PERF. cache these responses like we do systems?
  // TODO(@darzu): PERF. evaluate all per-frame uses of this
  public filterEntities<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS> {
    const res: Entities<CS> = [];
    if (cs === null) return res;
    const inclDead = cs.some((c) => this.isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
    for (let e of this.entities.values()) {
      if (!inclDead && this.isDeadE(e)) continue;
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

  public dbgFilterEntitiesByKey(cs: string | string[]): Entities<any> {
    // TODO(@darzu): respect "DeadDef" comp ?
    console.log(
      "filterEntitiesByKey called--should only be called from console"
    );
    const res: Entities<any> = [];
    if (typeof cs === "string") cs = [cs];
    for (let e of this.entities.values()) {
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

  _nextInitFnId = 1;

  public addLazyInit<RS extends ResourceDef[]>(
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS> {
    const id = this._nextInitFnId++;
    const reg: InitFnReg<RS> = {
      requireRs,
      provideRs,
      fn: callback,
      eager: false,
      id,
      name,
    };
    this.addInit(reg);
    return reg;
  }
  public addEagerInit<RS extends ResourceDef[]>(
    requireCompSet: ComponentDef[],
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS> {
    const id = this._nextInitFnId++;
    const reg: InitFnReg<RS> = {
      requireCompSet,
      requireRs,
      provideRs,
      fn: callback,
      eager: true,
      id,
      name,
    };
    this.addInit(reg);
    return reg;
  }

  private _nextSystemId = 1;
  public addSystem<CS extends ComponentDef[], RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS],
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): void;
  public addSystem<CS extends null, RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): void;
  public addSystem<CS extends ComponentDef[], RS extends ResourceDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS] | null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): void {
    name = name || callback.name;
    if (name === "") {
      throw new Error(
        `To define a system with an anonymous function, pass an explicit name`
      );
    }
    if (this.allSystemsByName.has(name))
      throw `System named ${name} already defined. Try explicitly passing a name`;
    const id = this._nextSystemId;
    this._nextSystemId += 1;
    const sys: SystemReg = {
      cs,
      rs,
      callback,
      name,
      phase,
      id,
    };
    this.allSystemsByName.set(name, sys);

    // NOTE: even though we might not active the system right away, we want to respect the
    //  order in which it was added to the phase.
    this.phases.get(phase)!.push(name);

    const seenAllCmps = (sys.cs ?? []).every((c) =>
      this.seenComponents.has(c.id)
    );
    const seenAllRes = sys.rs.every((c) => this.seenResources.has(c.id));
    if (seenAllCmps && seenAllRes) {
      this.activateSystem(sys);
    } else {
      // NOTE: we delay activating the system b/c each active system incurs
      //  a cost to maintain its query accelerators on each entity and component
      //  added/removed
      this.addEagerInit(
        sys.cs ?? [],
        sys.rs,
        [],
        () => {
          this.activateSystem(sys);
        },
        `sysinit_${sys.name}`
      );
    }
  }

  private activateSystem(sys: SystemReg) {
    const { cs, id, name, phase } = sys;

    this.activeSystemsById.set(id, sys);
    this.sysStats[name] = {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
    };

    // update query cache:
    //  pre-compute entities for this system for quicker queries; these caches will be maintained
    //  by add/remove/ensure component calls
    // TODO(@darzu): ability to toggle this optimization on/off for better debugging
    const es = this.filterEntities(cs);
    this._systemsToEntities.set(id, [...es]);
    if (cs) {
      for (let c of cs) {
        if (!this._componentToSystems.has(c.name))
          this._componentToSystems.set(c.name, [id]);
        else this._componentToSystems.get(c.name)!.push(id);
      }
      this._systemsToComponents.set(
        id,
        cs.map((c) => c.name)
      );
    }
    for (let e of es) {
      const ss = this._entitiesToSystems.get(e.id);
      assertDbg(ss);
      ss.push(id);
    }
  }

  public whenResources<RS extends ResourceDef[]>(
    ...rs: RS
  ): Promise<Resources<RS>> {
    // short circuit if we already have the components
    if (rs.every((c) => c.name in this.resources))
      return Promise.resolve(this.resources as Resources<RS>);

    const promiseId = this._nextEntityPromiseId++;

    if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
      // if (dbgOnce("getCallStack")) console.dir(getCallStack());
      let line = getCallStack().find(
        (s) =>
          !s.includes("entity-manager") && //
          !s.includes("em-helpers")
      )!;

      if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
        console.log(
          `promise #${promiseId}: ${componentsToString(rs)} from: ${line}`
        );
      this._dbgEntityPromiseCallsites.set(promiseId, line);
    }

    return new Promise<Resources<RS>>((resolve, reject) => {
      const sys: ResourcesPromise<RS> = {
        id: promiseId,
        rs,
        callback: resolve,
      };

      this.resourcePromises.push(sys);
    });
  }

  hasSystem(name: string) {
    return this.allSystemsByName.has(name);
  }

  private tryCallSystem(name: string): boolean {
    // TODO(@darzu):
    // if (name.endsWith("Build")) console.log(`calling ${name}`);
    // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");

    const s = this.allSystemsByName.get(name);
    assert(s, `Can't find system with name: ${name}`);

    if (!this.activeSystemsById.has(s.id)) {
      return false;
    }

    let start = performance.now();
    // try looking up in the query cache
    let es: Entities<any[]>;
    if (s.cs) {
      assertDbg(
        this._systemsToEntities.has(s.id),
        `System ${s.name} doesn't have a query cache!`
      );
      es = this._systemsToEntities.get(s.id)! as EntityW<any[]>[];
    } else {
      es = [];
    }
    // TODO(@darzu): uncomment to debug query cache issues
    // es = this.filterEntities(s.cs);

    const rs = this.getResources(s.rs); // TODO(@darzu): remove allocs here
    let afterQuery = performance.now();
    this.sysStats[s.name].queries++;
    this.emStats.queryTime += afterQuery - start;
    if (!rs) {
      // we don't yet have the resources, check if we can init any
      s.rs.forEach((r) => {
        const forced = this.tryForceResourceInit(r);
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

    // we have the resources
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
    this.sysStats[s.name].calls++;
    const thisCallTime = afterCall - afterQuery;
    this.sysStats[s.name].callTime += thisCallTime;
    this.sysStats[s.name].maxCallTime = Math.max(
      this.sysStats[s.name].maxCallTime,
      thisCallTime
    );

    return true;
  }

  // private _callSystem(name: string) {
  //   if (!this.maybeRequireSystem(name)) throw `No system named ${name}`;
  // }

  // TODO(@darzu): use version numbers instead of dirty flag?
  _changedEntities = new Set<number>();

  // _dbgFirstXFrames = 10;
  // dbgStrEntityPromises() {
  //   let res = "";
  //   res += `changed ents: ${[...this._changedEntities.values()].join(",")}\n`;
  //   this.entityPromises.forEach((promises, id) => {
  //     for (let s of promises) {
  //       const unmet = s.cs.filter((c) => !c.isOn(s.e)).map((c) => c.name);
  //       res += `#${id} is waiting for ${unmet.join(",")}\n`;
  //     }
  //   });
  //   return res;
  // }

  dbgEntityPromises(): string {
    let res = "";
    for (let [id, prom] of this.entityPromises.entries()) {
      const ent = EM.entities.get(id) || { id };
      const unmet = prom
        .flatMap((p) => p.cs.map((c) => c.name))
        .filter((n) => !(n in ent));

      res += `ent waiting: ${id} <- (${unmet.join(",")})\n`;
    }
    for (let prom of this.resourcePromises) {
      // if (prom.rs.some((r) => !(r.name in this.resources)))
      res += `resources waiting: (${prom.rs.map((r) => r.name).join(",")})\n`;
    }
    return res;
  }

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

  // TODO(@darzu): can this consolidate with the InitFn system?
  // TODO(@darzu): PERF TRACKING. Need to rethink how this interacts with system and init fn perf tracking
  // TODO(@darzu): EXPERIMENT: returns madeProgress
  private checkEntityPromises(): boolean {
    let madeProgress = false;
    // console.dir(this.entityPromises);
    // console.log(this.dbgStrEntityPromises());
    // this._dbgFirstXFrames--;
    // if (this._dbgFirstXFrames <= 0) throw "STOP";

    const beforeOneShots = performance.now();

    // check resource promises
    // TODO(@darzu): also check and call init functions for systems!!
    for (
      // run backwards so we can remove as we go
      let idx = this.resourcePromises.length - 1;
      idx >= 0;
      idx--
    ) {
      const p = this.resourcePromises[idx];
      let finished = p.rs.every((r) => r.name in this.resources);
      if (finished) {
        this.resourcePromises.splice(idx, 1);
        // TODO(@darzu): record time?
        // TODO(@darzu): how to handle async callbacks and their timing?
        p.callback(this.resources);
        madeProgress = true;
        continue;
      }
      // if it's not ready to run, try to push the required resources along
      p.rs.forEach((r) => {
        const forced = this.tryForceResourceInit(r);
        madeProgress ||= forced;
        if (DBG_INIT_CAUSATION && forced) {
          const line = this._dbgEntityPromiseCallsites.get(p.id)!;
          console.log(
            `${performance.now().toFixed(0)}ms: '${r.name}' force by promise #${
              p.id
            } from: ${line}`
          );
        }
      });
    }

    // check entity promises
    let finishedEntities: Set<number> = new Set();
    this.entityPromises.forEach((promises, id) => {
      // no change
      if (!this._changedEntities.has(id)) {
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
        const stats = this.sysStats["__oneShots"];
        stats.queries += 1;
        this.emStats.queryTime += afterOneShotQuery - beforeOneShots;

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
      this.entityPromises.delete(id);
    }
    this._changedEntities.clear();

    return madeProgress;
  }

  // TODO(@darzu): good or terrible name?
  // TODO(@darzu): another version for checking entity promises?
  // TODO(@darzu): update with new init system
  whyIsntSystemBeingCalled(name: string): void {
    // TODO(@darzu): more features like check against a specific set of entities
    const sys = this.allSystemsByName.get(name);
    if (!sys) {
      console.warn(`No systems found with name: '${name}'`);
      return;
    }

    let haveAllResources = true;
    for (let _r of sys.rs) {
      let r = _r as ResourceDef;
      if (!this.getResource(r)) {
        console.warn(`System '${name}' missing resource: ${r.name}`);
        haveAllResources = false;
      }
    }

    const es = this.filterEntities(sys.cs);
    console.warn(
      `System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`
    );
  }

  _nextEntityPromiseId: number = 0;
  _dbgEntityPromiseCallsites = new Map<number, string>();

  // TODO(@darzu): Rethink naming here
  // NOTE: if you're gonna change the types, change registerSystem first and just copy
  //  them down to here
  public whenEntityHas<
    // eCS extends ComponentDef[],
    CS extends ComponentDef[],
    ID extends number
  >(e: EntityW<ComponentDef[], ID>, ...cs: CS): Promise<EntityW<CS, ID>> {
    // short circuit if we already have the components
    if (cs.every((c) => c.name in e))
      return Promise.resolve(e as EntityW<CS, ID>);

    // TODO(@darzu): this is too copy-pasted from registerSystem
    // TODO(@darzu): need unified query maybe?
    // let _name = "oneShot" + this.++;

    // if (this.entityPromises.has(_name))
    //   throw `One-shot single system named ${_name} already defined.`;

    // use one bucket for all one shots. Change this if we want more granularity
    this.sysStats["__oneShots"] = this.sysStats["__oneShots"] ?? {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
      queryTime: 0,
    };

    const promiseId = this._nextEntityPromiseId++;

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
      this._dbgEntityPromiseCallsites.set(promiseId, line);
    }

    return new Promise<EntityW<CS, ID>>((resolve, reject) => {
      const sys: EntityPromise<CS, ID> = {
        id: promiseId,
        e,
        cs,
        callback: resolve,
        // name: _name,
      };

      if (this.entityPromises.has(e.id))
        this.entityPromises.get(e.id)!.push(sys);
      else this.entityPromises.set(e.id, [sys]);
    });
  }

  // INIT SYSTEM
  // TODO(@darzu): [ ] split entity-manager ?
  // TODO(@darzu): [ ] consolidate entity promises into init system?
  // TODO(@darzu): [ ] addLazyInit, addEagerInit require debug name
  seenComponents = new Set<CompId>();
  seenResources = new Set<ResId>();

  pendingLazyInitsByProvides = new Map<ResId, InitFnReg>();
  pendingEagerInits: InitFnReg[] = [];
  startedInits = new Map<InitFnId, Promise<void> | void>();
  allInits = new Map<InitFnId, InitFnReg>();

  // TODO(@darzu): how can i tell if the event loop is running dry?

  // TODO(@darzu): EXPERIMENT: returns madeProgress
  private progressInitFns(): boolean {
    let madeProgress = false;
    this.pendingEagerInits.forEach((e, i) => {
      let hasAll = true;

      // has component set?
      // TODO(@darzu): more precise component set tracking:
      //               not just one of each component, but some entity that has all
      let hasCompSet = true;
      if (e.requireCompSet)
        for (let c of e.requireCompSet)
          hasCompSet &&= this.seenComponents.has(c.id);
      hasAll &&= hasCompSet;

      // has resources?
      for (let r of e.requireRs) {
        if (!this.seenResources.has(r.id)) {
          if (hasCompSet) {
            // NOTE: we don't force resources into existance until the components are met
            //    this is (probably) the behavior we want when there's a system that is
            //    waiting on some components to exist.
            // lazy -> eager
            const forced = this.tryForceResourceInit(r);
            madeProgress ||= forced;
            if (DBG_INIT_CAUSATION && forced) {
              const line = this._dbgInitBlameLn.get(e.id)!;
              console.log(
                `${performance.now().toFixed(0)}ms: '${
                  r.name
                }' force by init #${e.id} from: ${line}`
              );
            }
          }
          hasAll = false;
        }
      }

      // run?
      if (hasAll) {
        // TODO(@darzu): BUG. this won't work if a resource is added then removed e.g. flags
        //    need to think if we really want to allow resource removal. should we
        //    have a seperate concept for flags?
        // eager -> run
        this.runInitFn(e);
        this.pendingEagerInits.splice(i, 1);
        madeProgress = true;
      }
    });
    return madeProgress;
  }
  _dbgInitBlameLn = new Map<InitFnId, string>();
  private addInit(reg: InitFnReg) {
    if (DBG_VERBOSE_INIT_CALLSITES || DBG_INIT_CAUSATION) {
      // if (dbgOnce("getCallStack")) console.dir(getCallStack());
      let line = getCallStack().find(
        (s) =>
          !s.includes("entity-manager") && //
          !s.includes("em-helpers")
      )!;

      // trim "http://localhost:4321/"
      // const hostIdx = line.indexOf(window.location.host);
      // if (hostIdx >= 0)
      //   line = line.slice(hostIdx + window.location.host.length);

      if (DBG_VERBOSE_INIT_CALLSITES)
        console.log(`init ${initFnToString(reg)} from: ${line}`);
      this._dbgInitBlameLn.set(reg.id, line);
    }
    assert(
      !this.allInits.has(reg.id),
      `Double registering ${initFnToString(reg)}`
    );
    this.allInits.set(reg.id, reg);
    if (reg.eager) {
      this.pendingEagerInits.push(reg);

      if (DBG_VERBOSE_INIT_SEQ)
        console.log(`new eager: ${initFnToString(reg)}`);
    } else {
      assert(
        reg.provideRs.length > 0,
        `addLazyInit must specify at least 1 provideRs`
      );
      for (let p of reg.provideRs) {
        assert(
          !this.pendingLazyInitsByProvides.has(p.id),
          `Resource: '${p.name}' already has an init fn!`
        );
        this.pendingLazyInitsByProvides.set(p.id, reg);
      }

      if (DBG_VERBOSE_INIT_SEQ) console.log(`new lazy: ${initFnToString(reg)}`);
    }
  }
  private tryForceResourceInit(r: ResourceDef): boolean {
    const lazy = this.pendingLazyInitsByProvides.get(r.id);
    if (!lazy) return false;

    // remove from all lazy
    for (let r of lazy.provideRs) this.pendingLazyInitsByProvides.delete(r.id);
    // add to eager
    this.pendingEagerInits.push(lazy);

    if (DBG_VERBOSE_INIT_SEQ)
      console.log(`lazy => eager: ${initFnToString(lazy)}`);

    return true; // was forced
  }

  _runningInitStack: InitFnReg[] = [];
  _lastInitTimestamp: number = -1;
  private async runInitFn(init: InitFnReg) {
    // TODO(@darzu): attribute time spent to specific init functions

    // update init fn stats before
    {
      assert(!this.initFnMsStats.has(init.id));
      this.initFnMsStats.set(init.id, 0);
      const before = performance.now();
      if (this._runningInitStack.length) {
        assert(this._lastInitTimestamp >= 0);
        let elapsed = before - this._lastInitTimestamp;
        let prev = this._runningInitStack.at(-1)!;
        assert(this.initFnMsStats.has(prev.id));
        this.initFnMsStats.set(
          prev.id,
          this.initFnMsStats.get(prev.id)! + elapsed
        );
      }
      this._lastInitTimestamp = before;
      this._runningInitStack.push(init);
    }

    const promise = init.fn(this.resources);
    this.startedInits.set(init.id, promise);

    if (DBG_VERBOSE_INIT_SEQ)
      console.log(`eager => started: ${initFnToString(init)}`);

    if (isPromise(promise)) await promise;

    // assert resources were added
    // TODO(@darzu): verify that init fn doesn't add any resources not mentioned in provides
    for (let res of init.provideRs)
      assert(
        res.name in this.resources,
        `Init fn failed to provide: ${res.name}`
      );

    // update init fn stats after
    {
      const after = performance.now();
      let popped = this._runningInitStack.pop();
      // TODO(@darzu): WAIT. why should the below be true? U should be able to have
      //   A-start, B-start, A-end, B-end
      // if A and B are unrelated
      // assert(popped && popped.id === init.id, `Daryl doesnt understand stacks`);
      // TODO(@darzu): all this init tracking might be lying.
      assert(this._lastInitTimestamp >= 0);
      const elapsed = after - this._lastInitTimestamp;
      this.initFnMsStats.set(
        init.id,
        this.initFnMsStats.get(init.id)! + elapsed
      );
      if (this._runningInitStack.length) this._lastInitTimestamp = after;
      else this._lastInitTimestamp = -1;
    }

    if (DBG_VERBOSE_INIT_SEQ) console.log(`finished: ${initFnToString(init)}`);
  }

  public update() {
    // TODO(@darzu): can EM.update() be a system?
    let madeProgress: boolean;
    do {
      madeProgress = false;
      madeProgress ||= this.progressInitFns();
      madeProgress ||= this.checkEntityPromises();
    } while (madeProgress);

    this.callSystems();
    this.dbgLoops++;
  }
}

// TODO(@darzu): where to put this?
export const EM: EntityManager = new EntityManager();
