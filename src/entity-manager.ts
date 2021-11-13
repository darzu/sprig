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
  id: number;
}
export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

type WithComponent<D> = D extends ComponentDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
type EntityW<CS extends ComponentDef[], ID extends number = number> = {
  id: ID;
} & Intersect<{ [P in keyof CS]: WithComponent<CS[P]> }>;
type Entities<CS extends ComponentDef[]> = EntityW<CS>[];
type SystemFN<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = (
  es: CS extends ComponentDef[] ? Entities<CS> : [],
  resources: EntityW<RS>
) => void;

type System<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = {
  cs: CS;
  rs: RS;
  callback: SystemFN<CS, RS>;
};

type EDef<ID extends number, CS extends ComponentDef[]> = [ID, ...CS];
type ESet<DS extends EDef<number, any>[]> = {
  [K in keyof DS]: DS[K] extends EDef<infer ID, infer CS>
    ? EntityW<CS, ID> | undefined
    : never;
};

export class EntityManager {
  entities: Map<number, Entity> = new Map();
  systems: System<any[] | null, any[]>[] = [];
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

  constructor() {
    this.entities.set(0, { id: 0 });
  }

  public defineComponent<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ComponentDef<N, P, Pargs> {
    const id = hashCode(name);
    if (this.components.has(id)) {
      throw `Component with name ${name} already defined--hash collision?`;
    }
    const component = {
      name,
      construct,
      id,
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

  public registerSerializerPair<N extends string, P>(
    def: ComponentDef<N, P>,
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
    if (!entity) {
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
    return c;
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
  public findSingletonEntity<C extends ComponentDef>(
    c: C
  ): EntityW<[C], 0> | undefined {
    const e = this.entities.get(0)!;
    if (c.name in e) {
      return e as any;
    }
    return undefined;
  }

  public hasEntity(id: number) {
    return this.entities.has(id);
  }

  public hasComponents<CS extends ComponentDef[]>(
    e: Entity,
    cs: [...CS]
  ): boolean {
    return cs.every((c) => c.name in e);
  }

  public findEntity<CS extends ComponentDef[], ID extends number>(
    id: ID,
    cs: [...CS]
  ): EntityW<CS, ID> | undefined {
    const e = this.entities.get(id);
    if (e && !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as EntityW<CS, ID>;
  }

  public findEntitySet<ES extends EDef<number, any>[]>(
    ...es: [...ES]
  ): ESet<ES> {
    const res = [];
    for (let [id, ...cs] of es) {
      res.push(this.findEntity(id, cs));
    }
    return res as ESet<ES>;
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

  public filterEntitiesByKey(cs: string[]): Entities<any> {
    console.log(
      "filterEntitiesByKey called--should only be called from console"
    );
    const res: Entities<any> = [];
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
    callback: SystemFN<CS, RS>
  ): void;
  public registerSystem<CS extends null, RS extends ComponentDef[]>(
    cs: CS,
    rs: [...RS],
    callback: SystemFN<CS, RS>
  ): void;
  public registerSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    cs: [...CS] | null,
    rs: [...RS],
    callback: SystemFN<CS, RS>
  ): void {
    this.systems.push({
      cs,
      rs,
      callback,
    });
  }

  callSystems() {
    // dispatch to all the systems
    for (let s of this.systems) {
      const es = this.filterEntities(s.cs);
      let haveAllResources = true;
      for (let r of s.rs) {
        // note this is just to verify it exists
        haveAllResources &&= !!this.findSingletonEntity(r);
      }
      if (haveAllResources) {
        s.callback(es, this.entities.get(0)! as any);
      }
    }
  }
}

// TODO(@darzu): where to put this?
export const EM = new EntityManager();

(window as any).EM = EM;

