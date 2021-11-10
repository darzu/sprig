/*
entities
components
systems

add/remove components to entities
define a system:
    queries over entitys w/ specifying which components
    register with EM
systems DAG?

*/

import { Serializer, Deserializer } from "./serialize.js";
import { hashCode } from "./util.js";

export interface Entity {
  readonly id: number;
}

export interface ComponentDef<N extends string = string, P = any> {
  readonly name: N;
  construct: () => P;
  id: number;
}

type Intersect<A> = A extends [infer X, ...infer Y] ? X & Intersect<Y> : {};

type Has<D> = D extends ComponentDef<infer N, infer P>
  ? { readonly [k in N]: P }
  : never;
type HasMany<CS extends ComponentDef[]> = Entity &
  Intersect<{ [P in keyof CS]: Has<CS[P]> }>;
type Entities<CS extends ComponentDef[]> = HasMany<CS>[];
type SystemFN<CS extends ComponentDef[], RS extends ComponentDef[]> = (
  es: Entities<CS>,
  resources: HasMany<RS>
) => void;

type System<CS extends ComponentDef[], RS extends ComponentDef[]> = {
  cs: CS;
  rs: RS;
  callback: SystemFN<CS, RS>;
};

// type TEST = Entities<[typeof BoatDef, typeof PlayerDef]>;

// const t: TEST;
// t[0].

export class EntityManager {
  entities: Entity[] = [{ id: 0 }];
  systems: System<any, any>[] = [];
  components: Map<number, ComponentDef<any, any>> = new Map();
  serializers: Map<
    number,
    {
      serialize: (obj: any, buf: Serializer) => void;
      deserialize: (obj: any, buf: Deserializer) => void;
    }
  > = new Map();

  nextId = -1;
  maxId = -1;

  public defineComponent<N extends string, P>(
    name: N,
    construct: () => P
  ): ComponentDef<N, P> {
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

  private checkComponent<N extends string, P>(def: ComponentDef<N, P>) {
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
    if (!def) throw `Trying to serialize unknown component id ${componentId}`;
    if (!this.hasEntity(id)) {
      this.registerEntity(id);
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

  public setIdRange(next: number, max: number) {
    this.nextId = next;
    this.maxId = max;
  }

  // TODO(@darzu): dont return the entity!
  public newEntity(): Entity {
    if (this.nextId === -1)
      throw `EntityManager hasn't been given an id range!`;
    if (this.nextId >= this.maxId)
      throw `EntityManager has exceeded its id range!`;
    const e = { id: this.nextId++ };
    this.entities[e.id] = e;
    return e;
  }

  public registerEntity(id: number): Entity {
    if (id in this.entities) throw `EntityManager already has id ${id}!`;
    if (this.nextId <= id && id < this.maxId)
      throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
    const e = { id: id };
    this.entities[e.id] = e;
    return e;
  }

  public addComponent<N extends string, P>(
    id: number,
    def: ComponentDef<N, P>
  ): P {
    this.checkComponent(def);
    if (id === 0) throw `hey, use addSingletonComponent!`;
    const c = def.construct();
    const e = this.entities[id];
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;
    return c;
  }

  public addSingletonComponent<N extends string, P>(
    def: ComponentDef<N, P>
  ): P {
    this.checkComponent(def);
    const c = def.construct();
    const e = this.entities[0];
    if (def.name in e)
      throw `double defining singleton component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;
    return c;
  }

  // TODO(@darzu): should this be public??
  public findSingletonEntity<C extends ComponentDef>(c: C): Entity & Has<C> {
    const e = this.entities[0];
    if (c.name in e) {
      return e as any;
    }
    throw `can't find singleton component: ${c.name}`;
  }

  public hasEntity(id: number) {
    return !!this.entities[id];
  }

  public findEntity<CS extends ComponentDef[]>(
    id: number,
    cs: [...CS]
  ): HasMany<CS> | undefined {
    const e = this.entities[id];
    if (e && !cs.every((c) => c.name in e)) {
      return undefined;
    }
    return e as HasMany<CS>;
  }

  private filterEntities<CS extends ComponentDef[]>(cs: [...CS]): Entities<CS> {
    const res: Entities<CS> = [];
    for (let e of this.entities) {
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
  ) {
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
      for (let r of s.rs) {
        // note this is just to verify it exists
        const _ = this.findSingletonEntity(r);
      }
      s.callback(es, this.entities[0] as any);
    }
  }
}

// TODO(@darzu): where to put this?
export const EM = new EntityManager();

// TODO(@darzu):  move these elsewher

export const TimeDef = EM.defineComponent("time", () => ({ dt: 0 }));
