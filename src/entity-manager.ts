import { Component } from "./renderer.js";
import { Serializer, Deserializer } from "./serialize.js";
import { hashCode } from "./util.js";

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

type Intersect<A> = A extends [infer X, ...infer Y] ? X & Intersect<Y> : {};

type Has<D> = D extends ComponentDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
type HasMany<CS extends ComponentDef[]> = Entity &
  Intersect<{ [P in keyof CS]: Has<CS[P]> }>;
type Entities<CS extends ComponentDef[]> = HasMany<CS>[];
type SystemFN<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = (
  es: CS extends ComponentDef[] ? Entities<CS> : [],
  resources: HasMany<RS>
) => void;

type System<CS extends ComponentDef[] | null, RS extends ComponentDef[]> = {
  cs: CS;
  rs: RS;
  callback: SystemFN<CS, RS>;
};

// type TEST = Entities<[typeof BoatDef, typeof PlayerDef]>;

// const t: TEST;
// t[0].

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
      throw `Component with id ${id} already defined--hash collision?`;
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

  // TODO(@darzu): should this be public??
  // TODO(@darzu): rename to findSingletonComponent
  public findSingletonEntity<C extends ComponentDef>(
    c: C
  ): (Entity & Has<C>) | undefined {
    const e = this.entities.get(0)!;
    if (c.name in e) {
      return e as any;
    }
    return undefined;
  }

  public hasEntity(id: number) {
    return this.entities.has(id);
  }

  public findEntity<CS extends ComponentDef[]>(
    id: number,
    cs: [...CS]
  ): HasMany<CS> | undefined {
    const e = this.entities.get(id);
    if (e && !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as HasMany<CS>;
  }

  public filterEntities<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS> {
    const res: Entities<CS> = [];
    if (cs === null) return res;
    console.log(this.entities);
    for (let e of this.entities.values()) {
      if (cs.every((c) => c.name in e)) {
        res.push(e as HasMany<CS>);
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

// TODO(@darzu):  move these elsewher

export const TimeDef = EM.defineComponent("time", () => ({ dt: 0 }));
export type Time = Component<typeof TimeDef>;
