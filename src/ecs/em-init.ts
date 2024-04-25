import {
  DBG_INIT_CAUSATION,
  DBG_VERBOSE_INIT_CALLSITES,
  DBG_VERBOSE_INIT_SEQ,
} from "../flags.js";
import { resetTempMatrixBuffer } from "../matrix/sprig-matrix.js";
import { getCallStack, assert } from "../utils/util-no-import.js";
import { isPromise } from "../utils/util.js";
import { ResourceDef, Resources, ResId, _resources } from "./em-resources.js";
import { _em } from "./entity-manager.js";
import { componentsToString } from "./em-components.js";
import { ComponentDef } from "./em-components.js";
export type InitFnId = number;

export type InitFn<
  RS extends ResourceDef[] = ResourceDef[],
  P extends any = any
> = ((rs: Resources<RS>) => Promise<P>) | ((rs: Resources<RS>) => P);

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

export interface EMInit {
  addLazyInit<RS extends ResourceDef[]>(
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS>;

  addEagerInit<RS extends ResourceDef[]>(
    requireCompSet: ComponentDef[],
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS>;

  progressInitFns(): boolean;

  requestResourceInit(r: ResourceDef): boolean;

  summarizeInitStats(): string;
}

function createEMInit(): EMInit {
  const initFnMsStats = new Map<InitFnId, number>();
  const allInits = new Map<InitFnId, InitFnReg>();

  let _nextInitFnId = 1;

  // INIT SYSTEM
  // TODO(@darzu): [ ] split entity-manager ?
  // TODO(@darzu): [ ] consolidate entity promises into init system?
  // TODO(@darzu): [ ] addLazyInit, addEagerInit require debug name

  const pendingLazyInitsByProvides = new Map<ResId, InitFnReg>();
  const pendingEagerInits: InitFnReg[] = [];
  const startedInits = new Map<InitFnId, Promise<void> | void>();

  // TODO(@darzu): how can i tell if the event loop is running dry?

  // TODO(@darzu): EXPERIMENT: returns madeProgress
  function progressInitFns(): boolean {
    let madeProgress = false;
    pendingEagerInits.forEach((e, i) => {
      let hasAll = true;

      // has component set?
      // TODO(@darzu): more precise component set tracking:
      //               not just one of each component, but some entity that has all
      let hasCompSet = true;
      if (e.requireCompSet)
        for (let c of e.requireCompSet)
          hasCompSet &&= _em.seenComponents.has(c.id);
      hasAll &&= hasCompSet;

      // has resources?
      for (let r of e.requireRs) {
        if (!_resources.seenResources.has(r.id)) {
          if (hasCompSet) {
            // NOTE: we don't force resources into existance until the components are met
            //    this is (probably) the behavior we want when there's a system that is
            //    waiting on some components to exist.
            // lazy -> eager
            const forced = requestResourceInit(r);
            madeProgress ||= forced;
            if (DBG_INIT_CAUSATION && forced) {
              const line = _dbgInitBlameLn.get(e.id)!;
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
        runInitFn(e);
        pendingEagerInits.splice(i, 1);
        madeProgress = true;
      }
    });

    return madeProgress;
  }

  const _dbgInitBlameLn = new Map<InitFnId, string>();
  function addInit(reg: InitFnReg) {
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
      _dbgInitBlameLn.set(reg.id, line);
    }
    assert(!allInits.has(reg.id), `Double registering ${initFnToString(reg)}`);
    allInits.set(reg.id, reg);
    if (reg.eager) {
      pendingEagerInits.push(reg);

      if (DBG_VERBOSE_INIT_SEQ)
        console.log(`new eager: ${initFnToString(reg)}`);
    } else {
      assert(
        reg.provideRs.length > 0,
        `addLazyInit must specify at least 1 provideRs`
      );
      for (let p of reg.provideRs) {
        assert(
          !pendingLazyInitsByProvides.has(p.id),
          `Resource: '${p.name}' already has an init fn!`
        );
        pendingLazyInitsByProvides.set(p.id, reg);
      }

      if (DBG_VERBOSE_INIT_SEQ) console.log(`new lazy: ${initFnToString(reg)}`);
    }
  }

  function requestResourceInit(r: ResourceDef): boolean {
    const lazy = pendingLazyInitsByProvides.get(r.id);
    if (!lazy) return false;

    // remove from all lazy
    for (let r of lazy.provideRs) pendingLazyInitsByProvides.delete(r.id);
    // add to eager
    pendingEagerInits.push(lazy);

    if (DBG_VERBOSE_INIT_SEQ)
      console.log(`lazy => eager: ${initFnToString(lazy)}`);

    return true; // was forced
  }

  const _runningInitStack: InitFnReg[] = [];
  let _lastInitTimestamp: number = -1;
  async function runInitFn(init: InitFnReg) {
    // TODO(@darzu): attribute time spent to specific init functions

    // update init fn stats before
    {
      assert(!initFnMsStats.has(init.id));
      initFnMsStats.set(init.id, 0);
      const before = performance.now();
      if (_runningInitStack.length) {
        assert(_lastInitTimestamp >= 0);
        let elapsed = before - _lastInitTimestamp;
        let prev = _runningInitStack.at(-1)!;
        assert(initFnMsStats.has(prev.id));
        initFnMsStats.set(prev.id, initFnMsStats.get(prev.id)! + elapsed);
      }
      _lastInitTimestamp = before;
      _runningInitStack.push(init);
    }

    // TODO(@darzu): is this reasonable to do before ea init?
    resetTempMatrixBuffer(initFnToString(init));

    const promise = init.fn(_resources.resources);
    startedInits.set(init.id, promise);

    if (DBG_VERBOSE_INIT_SEQ)
      console.log(`eager => started: ${initFnToString(init)}`);

    if (isPromise(promise)) await promise;

    // assert resources were added
    // TODO(@darzu): verify that init fn doesn't add any resources not mentioned in provides
    for (let res of init.provideRs)
      assert(
        res.name in _resources.resources,
        `Init fn failed to provide: ${res.name}`
      );

    // update init fn stats after
    {
      const after = performance.now();
      let popped = _runningInitStack.pop();
      // TODO(@darzu): WAIT. why should the below be true? U should be able to have
      //   A-start, B-start, A-end, B-end
      // if A and B are unrelated
      // assert(popped && popped.id === init.id, `Daryl doesnt understand stacks`);
      // TODO(@darzu): all this init tracking might be lying.
      assert(_lastInitTimestamp >= 0);
      const elapsed = after - _lastInitTimestamp;
      initFnMsStats.set(init.id, initFnMsStats.get(init.id)! + elapsed);
      if (_runningInitStack.length) _lastInitTimestamp = after;
      else _lastInitTimestamp = -1;
    }

    if (DBG_VERBOSE_INIT_SEQ) console.log(`finished: ${initFnToString(init)}`);
  }

  function addLazyInit<RS extends ResourceDef[]>(
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS> {
    const id = _nextInitFnId++;
    const reg: InitFnReg<RS> = {
      requireRs,
      provideRs,
      fn: callback,
      eager: false,
      id,
      name,
    };
    addInit(reg);
    return reg;
  }

  function addEagerInit<RS extends ResourceDef[]>(
    requireCompSet: ComponentDef[],
    requireRs: [...RS],
    provideRs: ResourceDef[],
    callback: InitFn<RS>,
    name?: string // TODO(@darzu): make required?
  ): InitFnReg<RS> {
    const id = _nextInitFnId++;
    const reg: InitFnReg<RS> = {
      requireCompSet,
      requireRs,
      provideRs,
      fn: callback,
      eager: true,
      id,
      name,
    };
    addInit(reg);
    return reg;
  }

  function summarizeInitStats() {
    const inits = [...initFnMsStats.keys()].map((id) => allInits.get(id)!);
    const initsAndTimes = inits.map(
      (reg) => [reg, initFnMsStats.get(reg.id)!] as const
    );
    initsAndTimes.sort((a, b) => b[1] - a[1]);
    let out = initsAndTimes
      .map(([reg, ms]) => `${ms.toFixed(2)}ms: ${initFnToString(reg)}`)
      .join("\n");
    return out;
  }

  const result: EMInit = {
    addLazyInit,
    addEagerInit,
    progressInitFns,
    requestResourceInit,

    summarizeInitStats,
  };

  return result;
}

export const _init: EMInit = createEMInit();
