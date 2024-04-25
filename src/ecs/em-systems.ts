import { ResourceDef, Resources, _resources } from "./em-resources.js";
import { Phase, PhaseValueList } from "./sys-phase.js";
import {
  Entity,
  _entities,
  Entities,
  EntityW,
  ReadonlyEntities,
} from "./entity-manager.js";
import { isDeadC } from "./em-components.js";
import { ComponentDef } from "./em-components.js";
import { DBG_SYSTEM_ORDER, DBG_INIT_CAUSATION } from "../flags.js";
import { resetTempMatrixBuffer } from "../matrix/sprig-matrix.js";
import { toMap, assert, assertDbg } from "../utils/util.js";
import { _init } from "./em-init.js";

export interface SystemReg {
  cs: ComponentDef[] | null;
  rs: ResourceDef[];
  callback: SystemFn;
  name: string;
  phase: Phase;
  id: number;
  flags: SystemFlags;
}
export interface PublicSystemReg {
  readonly id: number;
  readonly name: string;
  readonly phase: Phase;
  flags: SystemFlags;
}
export interface SystemFlags {
  // If set, won't warn you if you remove component during a system that queries that component
  allowQueryEdit?: boolean;
}
export interface SystemStats {
  callTime: number;
  maxCallTime: number;
  queries: number;
  calls: number;
}
export type SystemFn<
  CS extends ComponentDef[] | null = ComponentDef[] | null,
  RS extends ResourceDef[] = ResourceDef[]
> = (
  es: CS extends ComponentDef[] ? ReadonlyEntities<CS> : [],
  resources: Resources<RS>
) => void | Promise<void>;

export interface EMSystems {
  allSystemsByName: Map<string, SystemReg>;
  sysStats: Record<string, SystemStats>;

  // TODO(@darzu): modularize query cache so we can have multiple?
  _notifyNewEntity(e: Entity): void;
  _notifyAddComponent(e: Entity, def: ComponentDef): void;
  _notifyRemoveComponent(e: Entity, def: ComponentDef): void;

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

  callSystems(): void;

  dbgGetSystemsForEntity(id: number): SystemReg[];
}

export function createEMSystems(): EMSystems {
  const allSystemsByName: Map<string, SystemReg> = new Map();
  const activeSystemsById: Map<number, SystemReg> = new Map();
  const phases: Map<Phase, string[]> = toMap(
    PhaseValueList,
    (n) => n,
    (_) => [] as string[]
  );

  const sysStats: Record<string, SystemStats> = {};

  // QUERY SYSTEM
  // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
  //    would make certain scan operations (like updating them on component add/remove)
  //    cheaper. And perhaps better gameplay code too.
  const _systemsToEntities: Map<number, Entity[]> = new Map();
  // NOTE: _entitiesToSystems is only needed because of DeadDef
  const _entitiesToSystems: Map<number, number[]> = new Map();
  const _systemsToComponents: Map<number, string[]> = new Map();
  const _componentToSystems: Map<string, number[]> = new Map();

  let _currentRunningSystem: SystemReg | undefined = undefined;
  let _dbgLastSystemLen = 0;
  let _dbgLastActiveSystemLen = 0;
  function callSystems(): void {
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

  function dbgGetSystemsForEntity(id: number) {
    const sysIds = _entitiesToSystems.get(id) ?? [];
    const systems = sysIds
      .map((id) => activeSystemsById.get(id))
      .filter((x) => !!x) as SystemReg[];
    return systems;
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

    const seenAllCmps = (sys.cs ?? []).every((c) =>
      _entities.seenComponents.has(c.id)
    );
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
    const es = _entities.filterEntities_uncached(cs);
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
    _entities.emStats.queryTime += afterQuery - start;
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

    const es = _entities.filterEntities_uncached(sys.cs);
    console.warn(
      `System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`
    );
  }

  function _notifyNewEntity(e: Entity) {
    _entitiesToSystems.set(e.id, []);
  }

  function _notifyAddComponent(e: Entity, def: ComponentDef) {
    const id = e.id;

    // update query caches
    let _beforeQueryCache = performance.now();
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
    _entities.emStats.queryTime += performance.now() - _beforeQueryCache;
  }

  function _notifyRemoveComponent(e: Entity, def: ComponentDef): void {
    const id = e.id;

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
  }

  const result: EMSystems = {
    sysStats,
    allSystemsByName,

    addSystem,
    hasSystem,
    callSystems,

    dbgGetSystemsForEntity,

    _notifyNewEntity,
    _notifyRemoveComponent,
    _notifyAddComponent,
  };

  return result;
}

export const _systems = createEMSystems();
