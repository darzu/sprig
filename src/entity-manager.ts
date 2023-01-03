import { DBG_ASSERT, DBG_TRYCALLSYSTEM } from "./flags.js";
import { Serializer, Deserializer } from "./serialize.js";
import { assert, assertDbg, hashCode, Intersect } from "./util.js";

// TODO(@darzu): for perf, we really need to move component data to be
//  colocated in arrays; and maybe introduce "arch-types" for commonly grouped
//  components and "worlds" to section off entities.

export interface Entity {
  readonly id: number;
}

export interface ComponentDef<
  N extends string = string,
  P = any,
  Pargs extends any[] = any[]
> {
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
  construct: (...args: Pargs) => P;
  readonly id: number;
  isOn: <E extends Entity>(e: E) => e is E & { [K in N]: P };
}
export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

export type WithComponent<D> = D extends ComponentDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
export type EntityW<
  CS extends readonly ComponentDef[],
  ID extends number = number
> = {
  readonly id: ID;
} & Intersect<{ [P in keyof CS]: WithComponent<CS[P]> }>;
export type Entities<CS extends ComponentDef[]> = EntityW<CS>[];
export type ReadonlyEntities<CS extends ComponentDef[]> =
  readonly EntityW<CS>[];
export type SystemFn<
  CS extends ComponentDef[] | null,
  RS extends ComponentDef[]
> = (
  es: CS extends ComponentDef[] ? ReadonlyEntities<CS> : [],
  resources: EntityW<RS>
) => void;

type System<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = {
  cs: CS;
  rs: RS;
  callback: SystemFn<CS, RS>;
  name: string;
  id: number;
};

export type InitFn<RS extends ComponentDef[]> = (rs: EntityW<RS>) => void;
type InitFNReg<RS extends ComponentDef[]> = {
  requires: RS;
  fn: InitFn<RS>;

  // TODO(@darzu): optional metadata?
  name: string;
  id: number;
};

// TODO(@darzu): think about naming some more...
type OneShotSystem<
  //eCS extends ComponentDef[],
  CS extends ComponentDef[],
  ID extends number
> = {
  e: EntityW<any[], ID>;
  cs: CS;
  callback: (e: EntityW<[...CS], ID>) => void;
  name: string;
};
function isOneShotSystem(
  s: OneShotSystem<any, any> | System<any, any>
): s is OneShotSystem<any, any> {
  return "e" in s;
}

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
  queryTime: number;
  callTime: number;
  maxCallTime: number;
  queries: number;
  calls: number;
}

// type _EntityManager = ReturnType<typeof createEntityManager>;
type _EntityManager = ReturnType<typeof createEntityManager>;
// export type EntityManager = { [k in keyof _EntityManager]: _EntityManager[k] };
export interface EntityManager {
  entities: _EntityManager["entities"];
  registerSystem: _EntityManager["registerSystem"];
  ensureComponentOn: _EntityManager["ensureComponentOn"];
  ensureComponent: _EntityManager["ensureComponent"];
  defineComponent: _EntityManager["defineComponent"];
  addComponent: _EntityManager["addComponent"];
  removeComponent: _EntityManager["removeComponent"];
  getResource: _EntityManager["getResource"];
  findEntity: _EntityManager["findEntity"];
  registerEntity: _EntityManager["registerEntity"];
  filterEntities: _EntityManager["filterEntities"];
  newEntity: _EntityManager["newEntity"];
  hasEntity: _EntityManager["hasEntity"];
  whenEntityHas: _EntityManager["whenEntityHas"];
  whenResources: _EntityManager["whenResources"];
  getResources: _EntityManager["getResources"];
  ensureSingletonComponent: _EntityManager["ensureSingletonComponent"];
  removeSingletonComponent: _EntityManager["removeSingletonComponent"];
  addSingletonComponent: _EntityManager["addSingletonComponent"];
  registerSerializerPair: _EntityManager["registerSerializerPair"];
  serialize: _EntityManager["serialize"];
  deserialize: _EntityManager["deserialize"];
  setIdRange: _EntityManager["setIdRange"];
  callSystem: _EntityManager["callSystem"];
  setDefaultRange: _EntityManager["setDefaultRange"];
  loops: _EntityManager["loops"];
  callOneShotSystems: _EntityManager["callOneShotSystems"];
  hasSystem: _EntityManager["hasSystem"];
  tryCallSystem: _EntityManager["tryCallSystem"];
  hasComponents: _EntityManager["hasComponents"];
  tryRemoveComponent: _EntityManager["tryRemoveComponent"];
  keepOnlyComponents: _EntityManager["keepOnlyComponents"];
  dbgFilterEntitiesByKey: _EntityManager["dbgFilterEntitiesByKey"];
  sysStats: _EntityManager["sysStats"];
  components: _EntityManager["components"];
}

function createEntityManager() {
  const entities: Map<number, Entity> = new Map();
  const systems: Map<string, System<any[] | null, any[]>> = new Map();
  const systemsById: Map<number, System<any[] | null, any[]>> = new Map();
  const oneShotSystems: Map<string, OneShotSystem<any[], any>> = new Map();
  const components: Map<number, ComponentDef<any, any>> = new Map();
  const serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  const ranges: Record<string, { nextId: number; maxId: number }> = {};
  const defaultRange: string = "";
  const sysStats: Record<string, SystemStats> = {};
  const globalStats = {
    // time spent maintaining the query caches
    queryCacheTime: 0, // TODO(@darzu): IMPL
  };
  const loops: number = 0;

  // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
  //    would make certain scan operations (like updating them on component add/remove)
  //    cheaper. And perhaps better gameplay code too.
  const _systemsToEntities: Map<number, Entity[]> = new Map();
  // NOTE: _entitiesToSystems is only needed because of DeadDef
  const _entitiesToSystems: Map<number, number[]> = new Map();
  const _systemsToComponents: Map<number, string[]> = new Map();
  const _componentToSystems: Map<string, number[]> = new Map();

  // constructor
  entities.set(0, { id: 0 });
  // TODO(@darzu): maintain _entitiesToSystems for ent 0?
  const _this = {
    entities,
    systems,
    systemsById,
    oneShotSystems,
    components,
    serializers,
    ranges,
    defaultRange,
    sysStats,
    globalStats,
    loops,

    _systemsToEntities,
    _entitiesToSystems,
    _systemsToComponents,
    _componentToSystems,

    defineComponent,
    registerSerializerPair,
    findEntity,
    hasEntity,
    addComponent,
    checkComponent,
    isDeletedE,
    isDeadC,
    isDeadE,
    tryRemoveComponent,
    removeComponent,
    filterEntities,
    whenEntityHas,
    getResources,
    getResource,
    tryCallSystem,

    registerSystem,
    ensureComponentOn,
    newEntity,
    whenResources,
    ensureSingletonComponent,
    addSingletonComponent,
    ensureComponent,
    hasComponents,
    deserialize,
    serialize,
    registerEntity,
    removeSingletonComponent,
    setIdRange,
    setDefaultRange,
    callSystem,
    callOneShotSystems,
    hasSystem,
    keepOnlyComponents,
    dbgFilterEntitiesByKey,
  };

  function defineComponent<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ComponentDef<N, P, Pargs> {
    const id = nameToId(name);
    if (_this.components.has(id)) {
      throw `Component with name ${name} already defined--hash collision?`;
    }
    const component = {
      name,
      construct,
      id,
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } => name in e,
    };
    _this.components.set(id, component);
    return component;
  }

  function checkComponent<N extends string, P, Pargs extends any[]>(
    def: ComponentDef<N, P, Pargs>
  ) {
    if (!_this.components.has(def.id))
      throw `Component ${def.name} (id ${def.id}) not found`;
    if (_this.components.get(def.id)!.name !== def.name)
      throw `Component id ${def.id} has name ${
        _this.components.get(def.id)!.name
      }, not ${def.name}`;
  }

  function registerSerializerPair<N extends string, P, Pargs extends any[]>(
    def: ComponentDef<N, P, Pargs>,
    serialize: (obj: P, buf: Serializer) => void,
    deserialize: (obj: P, buf: Deserializer) => void
  ) {
    _this.serializers.set(def.id, { serialize, deserialize });
  }

  function serialize(id: number, componentId: number, buf: Serializer) {
    const def = _this.components.get(componentId);
    if (!def) throw `Trying to serialize unknown component id ${componentId}`;
    const entity = _this.findEntity(id, [def]);
    if (!entity)
      throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
    const serializerPair = _this.serializers.get(componentId);
    if (!serializerPair)
      throw `No serializer for component ${def.name} (for entity ${id})`;
    serializerPair.serialize(entity[def.name], buf);
  }

  function deserialize(id: number, componentId: number, buf: Deserializer) {
    const def = _this.components.get(componentId);
    if (!def) throw `Trying to deserialize unknown component id ${componentId}`;
    if (!_this.hasEntity(id)) {
      throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
    }
    let entity = _this.findEntity(id, [def]);
    let component;
    // TODO: because of this usage of dummy, deserializers don't
    // actually need to read buf.dummy
    if (buf.dummy) {
      component = {} as any;
    } else if (!entity) {
      component = _this.addComponent(id, def);
    } else {
      component = entity[def.name];
    }
    const serializerPair = _this.serializers.get(componentId);
    if (!serializerPair)
      throw `No deserializer for component ${def.name} (for entity ${id})`;
    serializerPair.deserialize(component, buf);
  }

  function setDefaultRange(rangeName: string) {
    _this.defaultRange = rangeName;
  }

  function setIdRange(rangeName: string, nextId: number, maxId: number) {
    _this.ranges[rangeName] = { nextId, maxId };
  }

  // TODO(@darzu): dont return the entity!
  function newEntity(rangeName?: string): Entity {
    if (rangeName === undefined) rangeName = _this.defaultRange;
    const range = _this.ranges[rangeName];
    if (!range) {
      throw `Entity manager has no ID range (range specifier is ${rangeName})`;
    }
    if (range.nextId >= range.maxId)
      throw `EntityManager has exceeded its id range!`;
    const e = { id: range.nextId++ };
    if (e.id > 2 ** 15)
      console.warn(
        `We're halfway through our local entity ID space! Physics assumes IDs are < 2^16`
      );
    _this.entities.set(e.id, e);
    _this._entitiesToSystems.set(e.id, []);
    return e;
  }

  function registerEntity(id: number): Entity {
    assert(!_this.entities.has(id), `EntityManager already has id ${id}!`);
    /* TODO: should we do the check below but for all ranges?
    if (_this.nextId <= id && id < _this.maxId)
    throw `EntityManager cannot register foreign ids inside its local range; ${_this.nextId} <= ${id} && ${id} < ${_this.maxId}!`;
    */
    const e = { id: id };
    _this.entities.set(e.id, e);
    _this._entitiesToSystems.set(e.id, []);
    return e;
  }

  // TODO(@darzu): hacky, special components
  function isDeletedE(e: Entity) {
    return "deleted" in e;
  }
  function isDeadE(e: Entity) {
    return "dead" in e;
  }
  function isDeadC(e: ComponentDef<any, any, any>) {
    return "dead" === e.name;
  }

  function addComponent<N extends string, P, Pargs extends any[] = any[]>(
    id: number,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    _this.checkComponent(def);
    if (id === 0) throw `hey, use addSingletonComponent!`;
    const c = def.construct(...args);
    const e = _this.entities.get(id)!;
    // TODO: this is hacky--EM shouldn't know about "deleted"
    if (DBG_ASSERT && _this.isDeletedE(e)) {
      console.error(
        `Trying to add component ${def.name} to deleted entity ${id}`
      );
    }
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;

    // update query caches
    // TODO(@darzu): PERF. need to measure time spent maintaining these caches.
    const eSystems = _this._entitiesToSystems.get(e.id)!;
    if (_this.isDeadC(def)) {
      // remove from every current system
      eSystems.forEach((s) => {
        const es = _this._systemsToEntities.get(s)!;
        // TODO(@darzu): perf. sorted removal
        const indx = es.findIndex((v) => v.id === id);
        if (indx >= 0) es.splice(indx, 1);
      });
      eSystems.length = 0;
    }
    const systems = _this._componentToSystems.get(def.name);
    for (let sysId of systems ?? []) {
      const allNeededCs = _this._systemsToComponents.get(sysId);
      if (allNeededCs?.every((n) => n in e)) {
        // TODO(@darzu): perf. sorted insert
        _this._systemsToEntities.get(sysId)!.push(e);
        eSystems.push(sysId);
      }
    }

    return c;
  }

  function addComponentByName(id: number, name: string, ...args: any): any {
    console.log(
      "addComponentByName called, should only be called for debugging"
    );
    let component = _this.components.get(nameToId(name));
    if (!component) {
      throw `no component named ${name}`;
    }
    return _this.addComponent(id, component, ...args);
  }

  function ensureComponent<N extends string, P, Pargs extends any[] = any[]>(
    id: number,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    _this.checkComponent(def);
    const e = _this.entities.get(id)!;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return _this.addComponent(id, def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }
  // TODO(@darzu): do we want to make this the standard way we do ensureComponent and addComponent ?
  function ensureComponentOn<N extends string, P, Pargs extends any[] = any[]>(
    e: Entity,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): asserts e is EntityW<[ComponentDef<N, P, Pargs>]> {
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      _this.addComponent(e.id, def, ...args);
    }
  }

  function addSingletonComponent<
    N extends string,
    P,
    Pargs extends any[] = any[]
  >(def: ComponentDef<N, P, Pargs>, ...args: Pargs): P {
    _this.checkComponent(def);
    const c = def.construct(...args);
    const e = _this.entities.get(0)!;
    if (def.name in e)
      throw `double defining singleton component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;
    return c;
  }

  function ensureSingletonComponent<
    N extends string,
    P,
    Pargs extends any[] = any[]
  >(def: ComponentDef<N, P, Pargs>, ...args: Pargs): P {
    _this.checkComponent(def);
    const e = _this.entities.get(0)!;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return _this.addSingletonComponent(def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }

  function removeSingletonComponent<C extends ComponentDef>(def: C) {
    const e = _this.entities.get(0)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      throw `Tried to remove absent singleton component ${def.name}`;
    }
  }

  // TODO(@darzu): should this be function??
  // TODO(@darzu): rename to findSingletonComponent
  function getResource<C extends ComponentDef>(
    c: C
  ): (C extends ComponentDef<any, infer P> ? P : never) | undefined {
    const e = _this.entities.get(0)!;
    if (c.name in e) {
      return (e as any)[c.name];
    }
    return undefined;
  }
  function getResources<RS extends ComponentDef[]>(
    rs: [...RS]
  ): EntityW<RS, 0> | undefined {
    const e = _this.entities.get(0)!;
    if (rs.every((r) => r.name in e)) return e as any;
    return undefined;
  }

  function hasEntity(id: number) {
    return _this.entities.has(id);
  }

  function removeComponent<C extends ComponentDef>(id: number, def: C) {
    if (!_this.tryRemoveComponent(id, def))
      throw `Tried to remove absent component ${def.name} from entity ${id}`;
  }

  function tryRemoveComponent<C extends ComponentDef>(
    id: number,
    def: C
  ): boolean {
    const e = _this.entities.get(id)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      return false;
    }

    // update query cache
    const systems = _this._componentToSystems.get(def.name);
    for (let name of systems ?? []) {
      const es = _this._systemsToEntities.get(name);
      if (es) {
        // TODO(@darzu): perf. sorted removal
        const indx = es.findIndex((v) => v.id === id);
        if (indx >= 0) {
          es.splice(indx, 1);
        }
      }
    }
    if (_this.isDeadC(def)) {
      const eSystems = _this._entitiesToSystems.get(id)!;
      eSystems.length = 0;
      for (let sysId of _this.systemsById.keys()) {
        const allNeededCs = _this._systemsToComponents.get(sysId);
        if (allNeededCs?.every((n) => n in e)) {
          // TODO(@darzu): perf. sorted insert
          _this._systemsToEntities.get(sysId)!.push(e);
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
    let ent = _this.entities.get(id) as any;
    if (!ent) throw `Tried to delete non-existent entity ${id}`;
    for (let component of _this.components.values()) {
      if (!cs.includes(component) && ent[component.name]) {
        _this.removeComponent(id, component);
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
    const e = _this.entities.get(id);
    if (!e || !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as EntityW<CS, ID>;
  }

  function findEntitySet<ES extends EDefId<number, any>[]>(
    es: [...ES]
  ): ESetId<ES> {
    const res = [];
    for (let [id, ...cs] of es) {
      res.push(_this.findEntity(id, cs));
    }
    return res as ESetId<ES>;
  }

  // TODO(@darzu): PERF. cache these responses like we do systems?
  // TODO(@darzu): PERF. evaluate all per-frame uses of this
  function filterEntities<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS> {
    const res: Entities<CS> = [];
    if (cs === null) return res;
    const inclDead = cs.some((c) => _this.isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
    for (let e of _this.entities.values()) {
      if (!inclDead && _this.isDeadE(e)) continue;
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

  function dbgFilterEntitiesByKey(cs: string | string[]): Entities<any> {
    // TODO(@darzu): respect "DeadDef" comp ?
    console.log(
      "filterEntitiesByKey called--should only be called from console"
    );
    const res: Entities<any> = [];
    if (typeof cs === "string") cs = [cs];
    for (let e of _this.entities.values()) {
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

  // TODO(@darzu): instead of "name", system should havel "labelConstraints"
  function registerInit<RS extends ComponentDef[]>(
    requires: [...RS],
    provides: ComponentDef[],
    initFn: InitFn<RS>,
    name: string
  ): void {
    // TODO(@darzu):
    throw "TODO";
  }

  let _nextSystemId = 1;
  function registerSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    cs: [...CS],
    rs: [...RS],
    callback: SystemFn<CS, RS>,
    name: string
  ): void;
  function registerSystem<CS extends null, RS extends ComponentDef[]>(
    cs: null,
    rs: [...RS],
    callback: SystemFn<CS, RS>,
    name: string
  ): void;
  function registerSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    cs: [...CS] | null,
    rs: [...RS],
    callback: SystemFn<CS, RS>,
    name: string
  ): void {
    name = name || callback.name;
    if (name === "") {
      throw new Error(
        `To define a system with an anonymous function, pass an explicit name`
      );
    }
    if (_this.systems.has(name))
      throw `System named ${name} already defined. Try explicitly passing a name`;
    const id = _nextSystemId;
    _nextSystemId += 1;
    const sys: System<any, RS> = {
      cs,
      rs,
      callback,
      name,
      id,
    };
    _this.systems.set(name, sys);
    _this.systemsById.set(id, sys);
    _this.sysStats[name] = {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
      queryTime: 0,
    };

    // update query cache:
    //  pre-compute entities for this system for quicker queries; these caches will be maintained
    //  by add/remove/ensure component calls
    // TODO(@darzu): ability to toggle this optimization on/off for better debugging
    const es = _this.filterEntities(cs);
    _this._systemsToEntities.set(id, [...es]);
    if (cs) {
      for (let c of cs) {
        if (!_this._componentToSystems.has(c.name))
          _this._componentToSystems.set(c.name, [id]);
        else _this._componentToSystems.get(c.name)!.push(id);
      }
      _this._systemsToComponents.set(
        id,
        cs.map((c) => c.name)
      );
    }
    for (let e of es) {
      const ss = _this._entitiesToSystems.get(e.id);
      assertDbg(ss);
      ss.push(id);
    }
  }

  let nextOneShotSuffix = 0;
  function whenResources<RS extends ComponentDef[]>(
    ...rs: RS
  ): Promise<EntityW<RS>> {
    return _this.whenEntityHas(_this.entities.get(0)!, ...rs);
  }

  function hasSystem(name: string) {
    return _this.systems.has(name);
  }

  function tryCallSystem(name: string): boolean {
    // TODO(@darzu):
    // if (name.endsWith("Build")) console.log(`calling ${name}`);
    // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");

    const s = _this.systems.get(name);
    if (!s) {
      if (DBG_TRYCALLSYSTEM)
        console.warn(`Can't (yet) find system with name: ${name}`);
      return false;
    }
    let start = performance.now();
    // try looking up in the query cache
    let es: Entities<any[]>;
    if (s.cs) {
      assertDbg(
        _this._systemsToEntities.has(s.id),
        `System ${s.name} doesn't have a query cache!`
      );
      es = _this._systemsToEntities.get(s.id)! as EntityW<any[]>[];
    } else {
      es = [];
    }
    // TODO(@darzu): uncomment to debug query cache issues
    // es = _this.filterEntities(s.cs);

    const rs = _this.getResources(s.rs); // TODO(@darzu): remove allocs here
    let afterQuery = performance.now();
    _this.sysStats[s.name].queries++;
    _this.sysStats[s.name].queryTime += afterQuery - start;
    if (rs) {
      s.callback(es, rs);
      let afterCall = performance.now();
      _this.sysStats[s.name].calls++;
      const thisCallTime = afterCall - afterQuery;
      _this.sysStats[s.name].callTime += thisCallTime;
      _this.sysStats[s.name].maxCallTime = Math.max(
        _this.sysStats[s.name].maxCallTime,
        thisCallTime
      );
    }

    return true;
  }

  function callSystem(name: string) {
    if (!_this.tryCallSystem(name)) throw `No system named ${name}`;
  }

  function callOneShotSystems() {
    const beforeOneShots = performance.now();
    let calledSystems: Set<string> = new Set();
    _this.oneShotSystems.forEach((s) => {
      if (!s.cs.every((c) => c.name in s.e)) return;

      const afterOneShotQuery = performance.now();
      const stats = _this.sysStats["__oneShots"];
      stats.queries += 1;
      stats.queryTime += afterOneShotQuery - beforeOneShots;

      calledSystems.add(s.name);
      // TODO(@darzu): how to handle async callbacks and their timing?
      s.callback(s.e);

      const afterOneShotCall = performance.now();
      stats.calls += 1;
      const thisCallTime = afterOneShotCall - afterOneShotQuery;
      stats.callTime += thisCallTime;
      stats.maxCallTime = Math.max(stats.maxCallTime, thisCallTime);
    });
    for (let name of calledSystems) {
      _this.oneShotSystems.delete(name);
    }
  }

  // TODO(@darzu): good or terrible name?
  function whyIsntSystemBeingCalled(name: string): void {
    // TODO(@darzu): more features like check against a specific set of entities
    const sys = _this.systems.get(name) ?? _this.oneShotSystems.get(name);
    if (!sys) {
      console.warn(`No systems found with name: '${name}'`);
      return;
    }

    let haveAllResources = true;
    if (!isOneShotSystem(sys)) {
      for (let _r of sys.rs) {
        let r = _r as ComponentDef;
        if (!_this.getResource(r)) {
          console.warn(`System '${name}' missing resource: ${r.name}`);
          haveAllResources = false;
        }
      }
    }

    const es = _this.filterEntities(sys.cs);
    console.warn(
      `System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`
    );
  }

  // TODO(@darzu): Rethink naming here
  // NOTE: if you're gonna change the types, change registerSystem first and just copy
  //  them down to here
  function whenEntityHas<
    // eCS extends ComponentDef[],
    CS extends ComponentDef[],
    ID extends number
  >(e: EntityW<any[], ID>, ...cs: CS): Promise<EntityW<CS, ID>> {
    // short circuit if we already have the components
    if (cs.every((c) => c.name in e))
      return Promise.resolve(e as EntityW<CS, ID>);

    // TODO(@darzu): this is too copy-pasted from registerSystem
    // TODO(@darzu): need unified query maybe?
    let _name = "oneShot" + nextOneShotSuffix++;

    if (_this.oneShotSystems.has(_name))
      throw `One-shot single system named ${_name} already defined.`;

    // use one bucket for all one shots. Change this if we want more granularity
    _this.sysStats["__oneShots"] = _this.sysStats["__oneShots"] ?? {
      calls: 0,
      queries: 0,
      callTime: 0,
      maxCallTime: 0,
      queryTime: 0,
    };

    return new Promise<EntityW<CS, ID>>((resolve, reject) => {
      const sys: OneShotSystem<CS, ID> = {
        e,
        cs,
        callback: resolve,
        name: _name,
      };

      _this.oneShotSystems.set(_name, sys);
    });
  }

  return _this;
}

// TODO(@darzu): where to put this?
export const EM: EntityManager = createEntityManager();
