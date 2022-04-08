import { Serializer, Deserializer } from "./serialize.js";
import { hashCode } from "./util.js";

type Intersect<A> = A extends [infer X, ...infer Y] ? X & Intersect<Y> : {};
type Union<A> = A extends [infer X, ...infer Y] ? X | Union<Y> : never;

// TODO(@darzu): consider using a non recursive definition for performance
type TupleN<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleN<T, N, []>
  : never;
type _TupleN<T, N extends number, R extends unknown[]> = R["length"] extends N
  ? R
  : _TupleN<T, N, [T, ...R]>;

export interface Entity {
  readonly id: number;
}

export interface ComponentDef<
  N extends string = string,
  P = any,
  Pargs extends any[] = any[]
> {
  readonly name: N;
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
export type SystemFN<
  CS extends ComponentDef[] | null,
  RS extends ComponentDef[]
> = (
  es: CS extends ComponentDef[] ? Entities<CS> : [],
  resources: EntityW<RS>
) => void;

type System<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = {
  cs: CS;
  rs: RS;
  callback: SystemFN<CS, RS>;
  name: string;
};

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
  queries: number;
  calls: number;
}

export class EntityManager {
  entities: Map<number, Entity> = new Map();
  systems: System<any[] | null, any[]>[] = [];
  oneShotSystems: System<any[] | null, any[]>[] = [];
  components: Map<number, ComponentDef<any, any>> = new Map();
  serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  ranges: Record<string, { nextId: number; maxId: number }> = {};
  defaultRange: string = "";
  stats: Record<string, SystemStats> = {};
  loops: number = 0;

  private _systemsToEntities: Map<string, number[]> = new Map();
  private _systemsToComponents: Map<string, string[]> = new Map();
  private _componentToSystems: Map<string, string[]> = new Map();

  constructor() {
    this.entities.set(0, { id: 0 });
  }

  public defineComponent<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ComponentDef<N, P, Pargs> {
    const id = nameToId(name);
    if (this.components.has(id)) {
      throw `Component with name ${name} already defined--hash collision?`;
    }
    const component = {
      name,
      construct,
      id,
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } => name in e,
    };
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
    serializerPair.deserialize(component, buf);
  }

  public setDefaultRange(rangeName: string) {
    this.defaultRange = rangeName;
  }

  public setIdRange(rangeName: string, nextId: number, maxId: number) {
    this.ranges[rangeName] = { nextId, maxId };
  }

  // TODO(@darzu): dont return the entity!
  public newEntity(rangeName?: string): Entity {
    if (rangeName === undefined) rangeName = this.defaultRange;
    const range = this.ranges[rangeName];
    if (!range) {
      throw `Entity manager has no ID range (range specifier is ${rangeName})`;
    }
    if (range.nextId >= range.maxId)
      throw `EntityManager has exceeded its id range!`;
    const e = { id: range.nextId++ };
    this.entities.set(e.id, e);
    return e;
  }

  public registerEntity(id: number): Entity {
    if (id in this.entities) throw `EntityManager already has id ${id}!`;
    /* TODO: should we do the check below but for all ranges?
    if (this.nextId <= id && id < this.maxId)
    throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
    */
    const e = { id: id };
    this.entities.set(e.id, e);
    return e;
  }

  public addComponent<N extends string, P, Pargs extends any[] = any[]>(
    id: number,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    this.checkComponent(def);
    if (id === 0) throw `hey, use addSingletonComponent!`;
    const c = def.construct(...args);
    const e = this.entities.get(id)!;
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;

    // update query caches
    const systems = this._componentToSystems.get(def.name);
    for (let name of systems ?? []) {
      const allNeededCs = this._systemsToComponents.get(name);
      if (allNeededCs?.every((n) => n in e)) {
        this._systemsToEntities.get(name)?.push(id);
      }
    }

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
  public ensureComponentOn<N extends string, P, Pargs extends any[] = any[]>(
    e: Entity,
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): asserts e is EntityW<[ComponentDef<N, P, Pargs>]> {
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      this.addComponent(e.id, def, ...args);
    }
  }

  public addSingletonComponent<
    N extends string,
    P,
    Pargs extends any[] = any[]
  >(def: ComponentDef<N, P, Pargs>, ...args: Pargs): P {
    this.checkComponent(def);
    const c = def.construct(...args);
    const e = this.entities.get(0)!;
    if (def.name in e)
      throw `double defining singleton component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;
    return c;
  }

  public ensureSingletonComponent<
    N extends string,
    P,
    Pargs extends any[] = any[]
  >(def: ComponentDef<N, P, Pargs>, ...args: Pargs): P {
    this.checkComponent(def);
    const e = this.entities.get(0)!;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return this.addSingletonComponent(def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }

  public removeSingletonComponent<C extends ComponentDef>(def: C) {
    const e = this.entities.get(0)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      throw `Tried to remove absent singleton component ${def.name}`;
    }
  }

  // TODO(@darzu): should this be public??
  // TODO(@darzu): rename to findSingletonComponent
  public getResource<C extends ComponentDef>(
    c: C
  ): EntityW<[C], 0> | undefined {
    const e = this.entities.get(0)!;
    if (c.name in e) {
      return e as any;
    }
    return undefined;
  }
  public getResources<RS extends ComponentDef[]>(
    rs: [...RS]
  ): EntityW<RS, 0> | undefined {
    const e = this.entities.get(0)!;
    if (rs.every((r) => r.name in e)) return e as any;
    return undefined;
  }

  public hasEntity(id: number) {
    return this.entities.has(id);
  }

  public removeComponent<C extends ComponentDef>(id: number, def: C) {
    const e = this.entities.get(id)! as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      throw `Tried to remove absent component ${def.name} from entity ${id}`;
    }

    // update query cache
    const systems = this._componentToSystems.get(def.name);
    for (let name of systems ?? []) {
      const es = this._systemsToEntities.get(name);
      if (es) {
        const indx = es.findIndex((v) => v === id);
        if (indx >= 0) {
          es.splice(indx, 1);
        }
      }
    }
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

  public findEntitySet<ES extends EDefId<number, any>[]>(
    es: [...ES]
  ): ESetId<ES> {
    const res = [];
    for (let [id, ...cs] of es) {
      res.push(this.findEntity(id, cs));
    }
    return res as ESetId<ES>;
  }

  public filterEntities<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS> {
    const res: Entities<CS> = [];
    if (cs === null) return res;
    for (let e of this.entities.values()) {
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

  public filterEntitiesByKey(cs: string | string[]): Entities<any> {
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

  public registerSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    cs: [...CS],
    rs: [...RS],
    callback: SystemFN<CS, RS>,
    name?: string
  ): void;
  public registerSystem<CS extends null, RS extends ComponentDef[]>(
    cs: CS,
    rs: [...RS],
    callback: SystemFN<CS, RS>,
    name?: string
  ): void;
  public registerSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    cs: [...CS] | null,
    rs: [...RS],
    callback: SystemFN<CS, RS>,
    name?: string
  ): void {
    name = name || callback.name;
    if (name === "") {
      throw new Error(
        `To define a system with an anonymous function, pass an explicit name`
      );
    }
    if (this.systems.find((sys) => sys.name === name))
      throw `System named ${name} already defined. Try explicitly passing a name`;
    this.systems.push({
      cs,
      rs,
      callback,
      name,
    });
    this.stats[name] = { calls: 0, queries: 0, callTime: 0, queryTime: 0 };

    // update query cache:
    //  pre-compute entities for this system for quicker queries; these caches will be maintained
    //  by add/remove/ensure component calls
    // TODO(@darzu): ability to toggle this optimization on/off for better debugging
    const es = this.filterEntities(cs);
    this._systemsToEntities.set(
      name,
      es.map((e) => e.id)
    );
    if (cs) {
      for (let c of cs) {
        if (!this._componentToSystems.has(c.name))
          this._componentToSystems.set(c.name, [name]);
        else this._componentToSystems.get(c.name)!.push(name);
      }
      this._systemsToComponents.set(
        name,
        cs.map((c) => c.name)
      );
    }
  }

  private nextOneShotSuffix = 0;
  // NOTE: if you're gonna change the types, change it above first and just copy
  //  them down to here
  public registerOneShotSystem<
    CS extends ComponentDef[],
    RS extends ComponentDef[]
  >(cs: [...CS], rs: [...RS], callback: SystemFN<CS, RS>): void;
  public registerOneShotSystem<CS extends null, RS extends ComponentDef[]>(
    cs: CS,
    rs: [...RS],
    callback: SystemFN<CS, RS>
  ): void;
  public registerOneShotSystem<
    CS extends ComponentDef[],
    RS extends ComponentDef[]
  >(cs: [...CS] | null, rs: [...RS], callback: SystemFN<CS, RS>): void {
    const name = callback.name ?? "oneShot" + this.nextOneShotSuffix++;

    // use one bucket for all one shots. Change this if we want more granularity
    this.stats["__oneShots"] = this.stats["__oneShots"] ?? {
      calls: 0,
      queries: 0,
      callTime: 0,
      queryTime: 0,
    };

    this.oneShotSystems.push({
      cs,
      rs,
      callback,
      name,
    });
    // TODO(@darzu): track stats for one-shot systems?
  }

  callSystems() {
    // dispatch to all the systems
    for (let s of this.systems) {
      let start = performance.now();

      // try looking up in the query cache
      let es: Entities<any[]> = [];
      if (s.cs) {
        if (this._systemsToEntities.has(s.name))
          es = this._systemsToEntities
            .get(s.name)!
            .map((id) => this.entities.get(id)! as EntityW<any[]>);
        else {
          throw `System ${s.name} doesn't have a query cache!`;
          // es = this.filterEntities(s.cs);
        }
      }
      // TODO(@darzu): uncomment to debug query cache issues
      // es = this.filterEntities(s.cs);

      const rs = this.getResources(s.rs);
      let afterQuery = performance.now();
      this.stats[s.name].queries++;
      this.stats[s.name].queryTime += afterQuery - start;
      if (rs) {
        s.callback(es, rs);
        let afterCall = performance.now();
        this.stats[s.name].calls++;
        this.stats[s.name].callTime += afterCall - afterQuery;
      }
    }

    // dispatch one-shot systems
    const beforeOneShots = performance.now();
    this.oneShotSystems = this.oneShotSystems.reduce((keptSystems, s) => {
      let haveAllResources = true;
      for (let r of s.rs) {
        // note this is just to verify it exists
        haveAllResources &&= !!this.getResource(r);
      }
      if (haveAllResources) {
        const es = this.filterEntities(s.cs);

        const afterOneShotQuery = performance.now();
        this.stats["__oneShots"].queries += 1;
        this.stats["__oneShots"].queryTime +=
          afterOneShotQuery - beforeOneShots;

        s.callback(es, this.entities.get(0)! as any);

        const afterOneShotCall = performance.now();
        this.stats["__oneShots"].calls += 1;
        this.stats["__oneShots"].callTime +=
          afterOneShotCall - afterOneShotQuery;

        return keptSystems;
      } else {
        return [...keptSystems, s];
      }
    }, [] as typeof this.oneShotSystems);

    this.loops++;
  }
}

// TODO(@darzu): where to put this?
export const EM = new EntityManager();
