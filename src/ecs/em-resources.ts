import {
  DBG_VERBOSE_ENTITY_PROMISE_CALLSITES,
  DBG_INIT_CAUSATION,
} from "../flags.js";
import { assert, getCallStack } from "../utils/util-no-import.js";
import { Intersect } from "../utils/util.js";
import { _init } from "./ecs.js";
import { componentNameToId, componentsToString } from "./em-components.js";

type ResourcesPromise<RS extends ResourceDef[]> = {
  id: number;
  rs: RS;
  callback: (e: Resources<RS>) => void;
};

export interface ResourceDef<
  N extends string = string,
  P = any,
  Pargs extends any[] = any[]
> {
  _brand: "resourceDef";
  readonly id: ResId;
  readonly name: N;
  construct: (...args: Pargs) => P; // TODO(@darzu): allow async?
}
export type ResId = number;
export type Resource<DEF> = DEF extends ResourceDef<any, infer P> ? P : never;
export type WithResource<D> = D extends ResourceDef<infer N, infer P>
  ? {
      readonly [k in N]: P;
    }
  : never;
export type Resources<RS extends readonly ResourceDef[]> = Intersect<{
  [P in keyof RS]: WithResource<RS[P]>;
}>;

export interface EMResources {
  resources: Record<string, unknown>;
  seenResources: Set<ResId>;

  defineResource<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ResourceDef<N, P, Pargs>;
  addResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P;
  ensureResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P;
  removeResource<C extends ResourceDef>(def: C): void;
  getResource<C extends ResourceDef>(
    c: C
  ): (C extends ResourceDef<any, infer P> ? P : never) | undefined;
  hasResource<C extends ResourceDef>(c: C): boolean;
  getResources<RS extends ResourceDef[]>(
    rs: [...RS]
  ): Resources<RS> | undefined;
  whenResources<RS extends ResourceDef[]>(...rs: RS): Promise<Resources<RS>>;

  progressResourcePromises(): boolean;
}

export function createEMResources(): EMResources {
  const resourcePromises: ResourcesPromise<ResourceDef[]>[] = [];
  const resourceDefs: Map<ResId, ResourceDef> = new Map();
  const resources: Record<string, unknown> = {};

  const seenResources = new Set<ResId>();

  const _dbgResourcePromiseCallsites = new Map<number, string>();

  let _nextResourcePromiseId = 1;

  function defineResource<N extends string, P, Pargs extends any[]>(
    name: N,
    construct: (...args: Pargs) => P
  ): ResourceDef<N, P, Pargs> {
    const id = componentNameToId(name);
    if (resourceDefs.has(id)) {
      throw `Resource with name ${name} already defined--hash collision?`;
    }
    const def: ResourceDef<N, P, Pargs> = {
      _brand: "resourceDef", // TODO(@darzu): remove?
      name,
      construct,
      id,
    };
    resourceDefs.set(id, def);
    return def;
  }

  function addResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    assert(
      resourceDefs.has(def.id),
      `Resource ${def.name} (id ${def.id}) not found`
    );
    assert(
      resourceDefs.get(def.id)!.name === def.name,
      `Resource id ${def.id} has name ${resourceDefs.get(def.id)!.name}, not ${
        def.name
      }`
    );
    assert(!(def.name in resources), `double defining resource ${def.name}!`);

    const c = def.construct(...args);
    resources[def.name] = c;
    seenResources.add(def.id);
    return c;
  }

  // TODO(@darzu): replace most (all?) usage with addResource
  function ensureResource<N extends string, P, Pargs extends any[] = any[]>(
    def: ResourceDef<N, P, Pargs>,
    ...args: Pargs
  ): P {
    const alreadyHas = def.name in resources;
    if (!alreadyHas) {
      return addResource(def, ...args);
    } else {
      return resources[def.name] as P;
    }
  }

  function removeResource<C extends ResourceDef>(def: C) {
    if (def.name in resources) {
      delete resources[def.name];
    } else {
      throw `Tried to remove absent resource ${def.name}`;
    }
  }

  // TODO(@darzu): should this be public??
  // TODO(@darzu): rename to findResource
  function getResource<C extends ResourceDef>(
    c: C
  ): (C extends ResourceDef<any, infer P> ? P : never) | undefined {
    return resources[c.name] as any;
  }
  function hasResource<C extends ResourceDef>(c: C): boolean {
    return c.name in resources;
  }
  // TODO(@darzu): remove? we should probably be using "whenResources"
  function getResources<RS extends ResourceDef[]>(
    rs: [...RS]
  ): Resources<RS> | undefined {
    if (rs.every((r) => r.name in resources)) return resources as Resources<RS>;
    return undefined;
  }

  function whenResources<RS extends ResourceDef[]>(
    ...rs: RS
  ): Promise<Resources<RS>> {
    // short circuit if we already have the components
    if (rs.every((c) => c.name in resources))
      return Promise.resolve(resources as Resources<RS>);

    const promiseId = _nextResourcePromiseId++;

    if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
      // if (dbgOnce("getCallStack")) console.dir(getCallStack());
      let line = getCallStack().find(
        (s) =>
          !s.includes("entity-manager") && //
          !s.includes("em-helpers")
      )!;

      if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
        console.log(
          `promise #${promiseId}: ${componentsToString(rs)} from: ${line}`
        );
      _dbgResourcePromiseCallsites.set(promiseId, line);
    }

    return new Promise<Resources<RS>>((resolve, reject) => {
      const sys: ResourcesPromise<RS> = {
        id: promiseId,
        rs,
        callback: resolve,
      };

      resourcePromises.push(sys);
    });
  }

  function dbgResourcePromises(): string {
    let res = "";
    for (let prom of resourcePromises) {
      // if (prom.rs.some((r) => !(r.name in resources)))
      res += `resources waiting: (${prom.rs.map((r) => r.name).join(",")})\n`;
    }
    return res;
  }

  function progressResourcePromises(): boolean {
    let madeProgress = false;

    // TODO(@darzu): extract into resourcePromises munging into EMResources

    // check resource promises
    // TODO(@darzu): also check and call init functions for systems!!
    for (
      // run backwards so we can remove as we go
      let idx = resourcePromises.length - 1;
      idx >= 0;
      idx--
    ) {
      const p = resourcePromises[idx];
      let finished = p.rs.every((r) => r.name in resources);
      if (finished) {
        resourcePromises.splice(idx, 1);
        // TODO(@darzu): record time?
        // TODO(@darzu): how to handle async callbacks and their timing?
        p.callback(resources);
        madeProgress = true;
        continue;
      }
      // if it's not ready to run, try to push the required resources along
      p.rs.forEach((r) => {
        const forced = _init.requestResourceInit(r);
        madeProgress ||= forced;
        if (DBG_INIT_CAUSATION && forced) {
          const line = _dbgResourcePromiseCallsites.get(p.id)!;
          console.log(
            `${performance.now().toFixed(0)}ms: '${r.name}' force by promise #${
              p.id
            } from: ${line}`
          );
        }
      });
    }

    return madeProgress;
  }

  const result: EMResources = {
    resources,
    seenResources,
    defineResource,

    addResource,
    ensureResource,
    removeResource,
    getResource,
    hasResource,
    getResources,
    whenResources,
    progressResourcePromises,
  };

  return result;
}
