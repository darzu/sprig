import {
  DBG_ASSERT,
  DBG_VERBOSE_ENTITY_PROMISE_CALLSITES,
  DBG_INIT_CAUSATION,
} from "../flags.js";
import { _ComponentDef } from "../net/components.js";
import { getCallStack } from "../utils/util-no-import.js";
import { assert, hashCode, Intersect } from "../utils/util.js";
import { ComponentDef } from "./em-components.js";
import { NonupdatableComponentDef } from "./em-components.js";
import { componentsToString } from "./em-components.js";
import { UpdatableComponentDef } from "./em-components.js";
import { CompId } from "./em-components.js";
import { _components } from "./em-components.js";
import { EMComponents } from "./em-components.js";
import { EMInit, _init } from "./em-init.js";
import { EMResources, _resources } from "./em-resources.js";
import { _systems, EMSystems } from "./em-systems.js";

// TODO(@darzu): re-check all uses of "any" and prefer "unknown"
//    see: https://github.com/Microsoft/TypeScript/pull/24439

// TODO(@darzu): PERF. we really need to move component data to be
//  colocated in arrays; and maybe introduce "arch-types" for commonly grouped
//  components and "worlds" to section off entities.

// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)

// TODO(@darzu): use defineProperty, Object.preventExtensions(), and such to have more robust entities?

export interface Entity {
  readonly id: number;
}

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

// TODO(@darzu): don't love these...
export type EDef<CS extends ComponentDef[]> = readonly [...CS];
export type ESet<DS extends EDef<any>[]> = {
  [K in keyof DS]: DS[K] extends EDef<infer CS> ? EntityW<CS, number> : never;
};

export function nameToId(name: string): number {
  return hashCode(name);
}

interface _EntityManager {
  entities: Map<number, Entity>;

  emStats: { queryTime: number; dbgLoops: number };

  seenComponents: Set<CompId>;

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

  addComponentInternal<N extends string, P, PArgs extends any[]>(
    id: number,
    def: _ComponentDef<N, P, PArgs>,
    customUpdate: undefined | ((p: P, ...args: PArgs) => P),
    ...args: PArgs
  ): P;

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

  filterEntities_uncached<CS extends ComponentDef[]>(
    cs: [...CS] | null
  ): Entities<CS>;

  dbgFilterEntitiesByKey(cs: string | string[]): Entities<any>;

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

// TODO(@darzu): hacky, special components
function isDeletedE(e: Entity) {
  return "deleted" in e;
}
function isDeadE(e: Entity) {
  return "dead" in e;
}
export function isDeadC(e: ComponentDef) {
  return "dead" === e.name;
}

interface EntityManager
  extends _EntityManager,
    EMInit,
    EMResources,
    EMSystems,
    EMComponents {}

// TODO(@darzu): split this apart! Shouldn't be a class and should be in as many pieces as is logical
function createEntityManager(): _EntityManager {
  const entities: Map<number, Entity> = new Map();

  const entityPromises: Map<number, EntityPromise<ComponentDef[], any>[]> =
    new Map();

  const seenComponents = new Set<CompId>();

  const ranges: Record<string, { nextId: number; maxId: number }> = {};
  let defaultRange: string = "";
  const emStats = {
    queryTime: 0,
    dbgLoops: 0,
  };

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

    _systems._notifyNewEntity(e);

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

    _systems._notifyNewEntity(e);

    return e;
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
    _components.checkComponent(def);
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

    _em.seenComponents.add(def.id);

    _systems._notifyAddComponent(e, def);

    // track changes for entity promises
    // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
    _changedEntities.add(e.id);

    return c;
  }

  function addComponentByName(id: number, name: string, ...args: any): any {
    console.log(
      "addComponentByName called, should only be called for debugging"
    );
    let component = _components.componentDefs.get(nameToId(name));
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
    _components.checkComponent(def);
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

    _systems._notifyRemoveComponent(e, def);

    return true;
  }

  function keepOnlyComponents<CS extends ComponentDef[]>(
    id: number,
    cs: [...CS]
  ) {
    let ent = entities.get(id) as any;
    if (!ent) throw `Tried to delete non-existent entity ${id}`;
    for (let component of _components.componentDefs.values()) {
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
        const stats = _systems.sysStats["__oneShots"];
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
    _systems.sysStats["__oneShots"] = _systems.sysStats["__oneShots"] ?? {
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
      madeProgress ||= _resources.progressResourcePromises();
      madeProgress ||= checkEntityPromises();
    } while (madeProgress);

    _systems.callSystems();
    emStats.dbgLoops++;
  }

  const _em: _EntityManager = {
    // entities
    entities,
    seenComponents,

    setDefaultRange,
    setIdRange,
    mk,
    registerEntity,
    addComponent,
    addComponentByName,
    addComponentInternal,
    ensureComponent,
    set,
    setOnce,
    hasEntity,
    removeComponent,
    tryRemoveComponent,
    keepOnlyComponents,
    hasComponents,
    findEntity,
    filterEntities_uncached,
    dbgFilterEntitiesByKey,
    whenEntityHas,
    whenSingleEntity,

    // stats
    emStats,

    // update all
    update,
  };

  return _em;
}

export const _em: _EntityManager = createEntityManager();

export const EM: EntityManager = {
  ..._systems,
  ..._resources,
  ..._em,
  ..._init,
  ..._components,
};
