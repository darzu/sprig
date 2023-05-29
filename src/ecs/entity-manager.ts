import { createLabelSolver, LabelConstraint } from "./em-labels.js";
import {
  DBG_ASSERT,
  DBG_INIT,
  DBG_SYSTEM_ORDER,
  DBG_TRYCALLSYSTEM,
} from "../flags.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import {
  assert,
  assertDbg,
  hashCode,
  Intersect,
  isPromise,
  toMap,
} from "../utils/util.js";
import { Phase, PhaseValueList } from "./sys-phase.js";

// TODO(@darzu): for perf, we really need to move component data to be
//  colocated in arrays; and maybe introduce "arch-types" for commonly grouped
//  components and "worlds" to section off entities.

export interface Entity {
  readonly id: number;
}

export type CompId = number;
export type ResId = CompId;
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
  readonly id: CompId;
  isOn: <E extends Entity>(e: E) => e is E & { [K in N]: P };
}
export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

export const componentsToString = (cs: ComponentDef[]) =>
  `(${cs.map((c) => c.name).join(", ")})`;

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
  CS extends ComponentDef[] | null = ComponentDef[] | null,
  RS extends ComponentDef[] = ComponentDef[]
> = (
  es: CS extends ComponentDef[] ? ReadonlyEntities<CS> : [],
  resources: EntityW<RS>
) => void;

interface SystemReg {
  cs: ComponentDef[] | null;
  rs: ComponentDef[];
  callback: SystemFn;
  name: string;
  phase: Phase;
  id: number;
}

export type InitFnId = number;

export type InitFn<RS extends ComponentDef[] = ComponentDef[]> =
  | ((rs: EntityW<RS>) => Promise<void>)
  | ((rs: EntityW<RS>) => void);

export interface InitFnReg<RS extends ComponentDef[] = ComponentDef[]> {
  // TODO(@darzu): debug name
  // name: string;
  requireRs: [...RS];
  requireCompSet?: ComponentDef[];
  provideRs: ComponentDef[];
  eager?: boolean; // TODO(@darzu): flop this to lazy? more clear. make required?
  fn: InitFn<RS>;
  id: InitFnId;
}

export function initFnToString(init: InitFnReg) {
  return `${componentsToString(init.requireRs)} -> ${componentsToString(
    init.provideRs
  )}`;
}

// type _InitFNReg = InitFNReg & {
//   id: number;
// }

// TODO(@darzu): think about naming some more...
type EntityPromise<
  //eCS extends ComponentDef[],
  CS extends ComponentDef[],
  ID extends number
> = {
  e: EntityW<any[], ID>;
  cs: CS;
  callback: (e: EntityW<[...CS], ID>) => void;
  // name: string;
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
  callTime: number;
  maxCallTime: number;
  queries: number;
  calls: number;
}
interface EMStats {
  queryTime: number;
}

// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)

export class EntityManager {
  entities: Map<number, Entity> = new Map();
  ent0: Entity & { id: 0 };
  allSystemsByName: Map<string, SystemReg> = new Map();
  activeSystemsById: Map<number, SystemReg> = new Map();
  phases: Map<Phase, string[]> = toMap(
    PhaseValueList,
    (n) => n,
    (_) => [] as string[]
  );
  entityPromises: Map<number, EntityPromise<ComponentDef[], any>[]> = new Map();
  components: Map<CompId, ComponentDef<any, any>> = new Map();

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
  emStats: EMStats = {
    queryTime: 0,
  };
  globalStats = {
    // time spent maintaining the query caches
    queryCacheTime: 0, // TODO(@darzu): IMPL
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

  labelSolver = createLabelSolver();

  constructor() {
    const ent0 = Object.create(null); // no prototype
    ent0.id = 0;
    this.ent0 = ent0 as Entity & { id: 0 };
    this.entities.set(0, this.ent0);
    // TODO(@darzu): maintain _entitiesToSystems for ent 0?
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
      isOn: <E extends Entity>(e: E): e is E & { [K in N]: P } =>
        // (e as Object).hasOwnProperty(name),
        name in e,
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
    const c = def.construct(...args);
    const e = this.entities.get(id)!;
    // TODO: this is hacky--EM shouldn't know about "deleted"
    if (DBG_ASSERT && this.isDeletedE(e)) {
      console.error(
        `Trying to add component ${def.name} to deleted entity ${id}`
      );
    }
    if (def.name in e)
      throw `double defining component ${def.name} on ${e.id}!`;
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

  public addResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    this.checkComponent(def);
    const c = def.construct(...args);
    const e = this.ent0;
    if (def.name in e)
      throw `double defining singleton component ${def.name} on ${e.id}!`;
    (e as any)[def.name] = c;
    this._changedEntities.add(0); // TODO(@darzu): seperate Resources from Entities
    this.labelSolver.addResource(def);
    this.seenResources.add(def.id);
    return c;
  }

  public ensureResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ComponentDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    this.checkComponent(def);
    const e = this.ent0;
    const alreadyHas = def.name in e;
    if (!alreadyHas) {
      return this.addResource(def, ...args);
    } else {
      return (e as any)[def.name];
    }
  }

  public removeResource<C extends ComponentDef>(def: C) {
    const e = this.ent0 as any;
    if (def.name in e) {
      delete e[def.name];
    } else {
      throw `Tried to remove absent singleton component ${def.name}`;
    }
  }

  // TODO(@darzu): should this be public??
  // TODO(@darzu): rename to findResource
  public getResource<C extends ComponentDef>(
    c: C
  ): (C extends ComponentDef<any, infer P> ? P : never) | undefined {
    const e = this.ent0;
    if (c.name in e) {
      return (e as any)[c.name];
    }
    return undefined;
  }
  public getResources<RS extends ComponentDef[]>(
    rs: [...RS]
  ): EntityW<RS, 0> | undefined {
    const e = this.ent0;
    if (rs.every((r) => r.name in e)) return e as any;
    return undefined;
  }

  // TODO(@darzu): rename these to "requireSystem" or somethingE
  // _dbgOldPlan: string[] = []; // TODO(@darzu): REMOVE
  // TODO(@darzu): this makes no sense so what should this represent?
  // public maybeRequireSystem(name: string): boolean {
  //   this.addConstraint(["requires", name]);
  //   // this._dbgOldPlan.push(name); // TODO(@darzu): DBG
  //   return true;
  // }
  // public requireSystem(name: string) {
  //   this.addConstraint(["requires", name]);
  //   // this._dbgOldPlan.push(name); // TODO(@darzu): DBG
  // }
  // // TODO(@darzu): legacy thing; gotta replace with labels/phases
  // public requireGameplaySystem(name: string) {
  //   this.addConstraint(["requires", name]);
  // }
  // public addConstraint(con: LabelConstraint) {
  //   this.labelSolver.addConstraint(con);
  // }

  _dbgLastVersion = -1;
  _dbgLastSystemLen = 0;
  _dbgLastActiveSystemLen = 0;
  private callSystems() {
    // // TODO(@darzu):
    // // console.log("OLD PLAN:");
    // // console.log(this._tempPlan);
    // if (DBG_INIT_DEPS)
    //   if (this._dbgLastVersion !== this.labelSolver.getVersion()) {
    //     this._dbgLastVersion = this.labelSolver.getVersion();
    //     console.log("NEW PLAN:");
    //     console.log(this.labelSolver.getPlan().join("\n"));
    //   }

    // const plan = this.labelSolver.getPlan();
    // // const plan = this._tempPlan;

    // for (let s of plan) {
    //   this._tryCallSystem(s);
    // }

    // // this._dbgOldPlan.length = 0;
    // // if (this.dbgLoops > 100) throw "STOP";

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

  // initFns: InitFNReg<any>[] = [];
  // initFnsByResource: Map<string, InitFNReg<ComponentDef[]>> = new Map();
  // initFnHasStarted: Set<number> = new Set();
  // TODO(@darzu): IMPL?
  // pendingResources: Map<string, Promise<ComponentDef<any>>> = new Map();
  _nextInitFnId = 1;

  // TODO(@darzu): instead of "name", system should havel "labelConstraints"
  public registerInit<RS extends ComponentDef[]>(
    reg: Omit<InitFnReg<RS>, "id">
  ): void {
    const regWId: InitFnReg<RS> = {
      ...reg,
      id: this._nextInitFnId++,
    };

    if (!reg.eager) this._addLazyInit(regWId);
    else this._addEagerInit(regWId);
  }

  public addLazyInit<RS extends ComponentDef[]>(
    requireRs: RS,
    provideRs: ComponentDef[],
    callback: InitFn
  ): void {
    const id = this._nextInitFnId++;
    const reg: InitFnReg<RS> = {
      requireRs,
      provideRs,
      fn: callback,
      eager: false,
      id,
    };
    this._addLazyInit(reg);
  }

  private _nextSystemId = 1;
  public addSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
    name: string,
    phase: Phase,
    cs: [...CS],
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): void;
  public addSystem<CS extends null, RS extends ComponentDef[]>(
    name: string,
    phase: Phase,
    cs: null,
    rs: [...RS],
    callback: SystemFn<CS, RS>
  ): void;
  public addSystem<CS extends ComponentDef[], RS extends ComponentDef[]>(
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
      this.registerInit({
        requireRs: sys.rs,
        requireCompSet: sys.cs ?? undefined,
        provideRs: [],
        eager: true,
        fn: () => {
          this.activateSystem(sys);
        },
      });
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

  public whenResources<RS extends ComponentDef[]>(
    ...rs: RS
  ): Promise<EntityW<RS, 0>> {
    return this.whenEntityHas(this.ent0, ...rs);
  }

  hasSystem(name: string) {
    return this.allSystemsByName.has(name);
  }

  private tryCallSystem(name: string): boolean {
    // TODO(@darzu):
    // if (name.endsWith("Build")) console.log(`calling ${name}`);
    // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");

    const s = this.allSystemsByName.get(name);
    if (!s) {
      if (DBG_TRYCALLSYSTEM)
        console.warn(`Can't (yet) find system with name: ${name}`);
      return false;
    }

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
      s.rs.forEach((r) => this.tryForceResourceInit(r));
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
    return res;
  }

  // TODO(@darzu): can this consolidate with the InitFn system?
  private checkEntityPromises() {
    // console.dir(this.entityPromises);
    // console.log(this.dbgStrEntityPromises());
    // this._dbgFirstXFrames--;
    // if (this._dbgFirstXFrames <= 0) throw "STOP";

    const beforeOneShots = performance.now();

    // for resources, check init fns
    // TODO(@darzu): also check and call init functions for systems!!
    const resourcePromises = this.entityPromises.get(0);
    resourcePromises?.forEach((p) =>
      p.cs.forEach((r) => this.tryForceResourceInit(r))
    );

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
        s.callback(s.e);

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
      let r = _r as ComponentDef;
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

  // TODO(@darzu): Rethink naming here
  // NOTE: if you're gonna change the types, change registerSystem first and just copy
  //  them down to here
  public whenEntityHas<
    // eCS extends ComponentDef[],
    CS extends ComponentDef[],
    ID extends number
  >(e: EntityW<any[], ID>, ...cs: CS): Promise<EntityW<CS, ID>> {
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

    return new Promise<EntityW<CS, ID>>((resolve, reject) => {
      const sys: EntityPromise<CS, ID> = {
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
  // TODO(@darzu): [ ] add active vs pending addSystem / eager vs lazy init & component sets
  // TODO(@darzu): [ ] split entity-manager ?
  // TODO(@darzu): [ ] remove em-labels ?
  // TODO(@darzu): [ ] consolidate entity promises into init system?
  // TODO(@darzu): [ ] remove unnecessary async on inits
  // TODO(@darzu): [ ] flop InitFnReg eager -> lazy
  // TODO(@darzu): [ ] InitFnReg debug name
  // TODO(@darzu): [ ] addLazyInit, addEagerInit
  seenComponents = new Set<CompId>(); // TODO(@darzu): IMPL
  seenResources = new Set<ResId>(); // TODO(@darzu): IMPL

  pendingLazyInitsByProvides = new Map<ResId, InitFnReg>(); // TODO(@darzu): IMPL
  pendingEagerInits: InitFnReg[] = []; // TODO(@darzu): IMPL
  startedInits = new Map<InitFnId, Promise<void> | void>();
  allInits = new Map<InitFnId, InitFnReg>(); // TODO(@darzu): IMPL

  private progressInitFns() {
    this.pendingEagerInits.forEach((e, i) => {
      let hasAll = true;

      // has resources?
      for (let r of e.requireRs) {
        if (!this.seenResources.has(r.id)) {
          // lazy -> eager
          this.tryForceResourceInit(r);
          hasAll = false;
        }
      }

      // has component set?
      // TODO(@darzu): more precise component set tracking:
      //               not just one of each component, but some entity that has all
      if (e.requireCompSet)
        for (let c of e.requireCompSet)
          hasAll &&= this.seenComponents.has(c.id);

      // run?
      if (hasAll) {
        // TODO(@darzu): BUG. this won't work if a resource is added then removed e.g. flags
        // eager -> run
        this.runInitFn(e);
        this.pendingEagerInits.splice(i, 1);
      }
    });
  }
  // TODO(@darzu): make public
  _addLazyInit(reg: InitFnReg) {
    assert(!reg.eager, `Invalid non-lazy reg: ${initFnToString(reg)}`);
    for (let p of reg.provideRs) {
      assert(
        !this.pendingLazyInitsByProvides.has(p.id),
        `Resource: '${p.name}' already has an init fn!`
      );
      this.pendingLazyInitsByProvides.set(p.id, reg);
    }

    if (DBG_INIT) console.log(`new lazy: ${initFnToString(reg)}`);
  }
  _addEagerInit(reg: InitFnReg) {
    assert(
      !!reg.eager,
      `Invalid non-eager reg: ${initFnToString(
        reg
      )}; Use tryForceResourceInit to promote a lazy init to an eager one`
    );
    this.pendingEagerInits.push(reg);
  }
  tryForceResourceInit(r: ComponentDef) {
    const lazy = this.pendingLazyInitsByProvides.get(r.id);
    if (!lazy) return;

    // remove from all lazy
    for (let r of lazy.provideRs) this.pendingLazyInitsByProvides.delete(r.id);
    // add to eager
    this.pendingEagerInits.push(lazy);

    if (DBG_INIT) console.log(`lazy => eager: ${initFnToString(lazy)}`);
  }
  async runInitFn(init: InitFnReg) {
    const promise = init.fn(this.ent0);
    this.startedInits.set(init.id, promise);

    if (DBG_INIT) console.log(`eager => started: ${initFnToString(init)}`);

    if (isPromise(promise)) await promise;

    // assert resources were added
    for (let res of init.provideRs)
      assert(res.isOn(this.ent0), `Init fn failed to provide: ${res.name}`);

    if (DBG_INIT) console.log(`finished: ${initFnToString(init)}`);
  }

  public update() {
    // TODO(@darzu): can EM.update() be a system?
    this.progressInitFns();
    this.checkEntityPromises();
    this.callSystems();
    this.dbgLoops++;
  }
}

// TODO(@darzu): where to put this?
export const EM: EntityManager = new EntityManager();
