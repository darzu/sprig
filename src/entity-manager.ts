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

import { Inputs } from "./inputs.js";

export interface Entity {
  readonly id: number;
}

export interface ComponentDef<N extends string = string, P = any> {
  readonly name: N;
  construct: () => P;
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

export function DefineComponent<N extends string, P>(
  name: N,
  construct: () => P
) {
  return {
    name,
    construct,
  };
}

export class EntityManager {
  entities: Entity[] = [{ id: 0 }];
  systems: System<any, any>[] = [];
  nextId = -1;
  maxId = -1;

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

export const TimeDef = DefineComponent("time", () => ({ dt: 0 }));
