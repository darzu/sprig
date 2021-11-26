import { FinishedDef } from "./build.js";
import { ColliderDef } from "./collider.js";
import { ComponentDef, EM, Entity } from "./entity-manager.js";
import { InputsDef } from "./inputs.js";
import { MeshHandleDef } from "./mesh-pool.js";
import {
  AuthorityDef,
  DeletedDef,
  InboxDef,
  MeDef,
  NetStatsDef,
  OutboxDef,
  PeerDef,
  SyncDef,
} from "./net/components.js";
import { MotionDef } from "./phys_motion.js";
import { NetTimerDef, PhysicsTimerDef, TimeDef } from "./time.js";

// TODO(@darzu): debugging helpers
interface DbgCmp extends ComponentDef {
  abv: string;
}
interface DbgEnt extends Entity {
  cmps: () => DbgCmp[];
}

// meshHandle,time,netTimer,physicsTimer,inputs,collider,motion,inWorld,finished,sync,
// peer,host,authority,deleted,me,inbox,outbox,netStats,eventsFromNetwork,
// eventsToNetwork,networkReady,join,bullet,bulletConstruct,cubeConstruct,player,
// playerConstruct,camera,transform,motionSmoothing,parent,renderable,playerView,
// physicsResults,_phys,boat,boatConstruct,detectedEvents,requestedEvents,events,
// planeConstruct,shipConstruct,hatConstruct,color,hat
const ignoreCmps = [
  MeshHandleDef,
  ColliderDef,
  MotionDef,
  FinishedDef,
  SyncDef,
  AuthorityDef,
  DeletedDef,
];

const dbgEnts: Map<number, DbgEnt> = new Map();
let dbgEntSingleton: DbgEnt = { id: 0, cmps: () => [] };

const dbgCmpsAllById: Map<number, DbgCmp> = new Map();
const dbgCmpsAllByName: Map<string, DbgCmp> = new Map();
let dbgCmpsAllByAbv: Map<string, DbgCmp> = new Map();
const dbgCmps: Map<string, DbgCmp> = new Map();
const dbgCmpsSingleton: Map<string, DbgCmp> = new Map();

function mkDbgCmp(id: number): DbgCmp {
  // if (dbgCmpsAllById.has(id)) return dbgCmpsAllById.get(id)!;
  const c = EM.components.get(id);
  if (!c) throw `No component by id ${id}`;
  const dc: DbgCmp = Object.assign(c, { abv: c.name });
  // dbgCmpsAllById.set(id, dc);
  // dbgCmps.set(dc.name, dc);
  return dc;
}
function mkDbgEnt(id: number): DbgEnt {
  // if (dbgEnts.has(id)) return dbgEnts.get(id)!;
  const e = EM.entities.get(id);
  if (!e) throw `No entity by id ${id}`;
  const cmps = () => {
    const res: DbgCmp[] = [];
    for (let p of Object.keys(e)) {
      const c = (id === 0 ? dbgCmpsSingleton : dbgCmps).get(p);
      if (c) res.push(c);
    }
    return res;
  };
  const de = Object.assign(e, { cmps });
  // if (id === 0) dbgEntSingleton = de;
  // else dbgEnts.set(id, de);
  return de;
}
type Named = { name: string };
function createAbvs<N extends Named>(strs: N[]): Map<string, N> {
  // TODO(@darzu): better strategy for ____ & ____Construct
  const strToAbv: Map<N, string> = new Map();
  const abvToStr: Map<string, N> = new Map();
  for (let s of strs) {
    for (let i = 3; i < s.name.length; i++) {
      const abv = s.name.substr(0, i);
      if (!abvToStr.has(abv)) {
        abvToStr.set(abv, s);
        strToAbv.set(s, abv);
        break;
      } else {
        // abreviation taken
        const other = abvToStr.get(abv)!;
        abvToStr.delete(abv);
        strToAbv.delete(s);
        const newAbv = other.name.substr(0, i + 1);
        abvToStr.set(newAbv, other);
        strToAbv.set(other, newAbv);
        continue;
      }
    }
  }
  return abvToStr;
}
function updateCmps() {
  dbgEntSingleton = mkDbgEnt(0);

  if (EM.components.size !== dbgCmpsAllById.size) {
    dbgCmpsAllById.clear();
    dbgCmps.clear();
    dbgCmpsSingleton.clear();

    for (let id of EM.components.keys()) {
      const dc = mkDbgCmp(id);
      dbgCmpsAllById.set(id, dc);
      dbgCmpsAllByName.set(dc.name, dc);

      if (dc.name in dbgEntSingleton) dbgCmpsSingleton.set(dc.name, dc);
      else dbgCmps.set(dc.name, dc);
    }

    dbgCmpsAllByAbv = createAbvs([...dbgCmpsAllById.values()]);
    for (let [abv, c] of dbgCmpsAllByAbv) c.abv = abv;
  }
}
function updateEnts() {
  dbgEntSingleton = mkDbgEnt(0);

  if (dbgEnts.size + 1 !== EM.entities.size) {
    dbgEnts.clear();
    for (let id of EM.entities.keys()) {
      if (id === 0) continue;
      dbgEnts.set(id, mkDbgEnt(id));
    }
  }
}
function filterEnts(...cmpNames: string[]): Entity[] {
  return EM.filterEntitiesByKey(cmpNames);
}
function cmpByName(name: string): DbgCmp {
  if (!dbgCmps.has(name))
    // side-effect: populates dbgCmpsByName
    updateCmps();
  if (!dbgCmps.has(name))
    // TODO(@darzu): fuzzy match?
    throw `No component by name ${name}`;
  return dbgCmps.get(name)!;
}

export const dbg = {
  listCmps: () => {
    updateCmps();
    const cStr = [...dbgCmps.values()]
      .map((c) => `${c.name} (${c.abv})`)
      .join("\n");
    console.log(cStr);
  },
  listEnts: (...cs: string[]) => {
    updateEnts();
    updateCmps();
    const eTable = [...dbgEnts.values()]
      .filter((e) => cs.every((c) => c in e))
      .map((e) => {
        const res: any = { id: e.id };
        for (let c of e.cmps()) {
          res[c.abv] = (e as any)[c.name];
        }
        return res;
      });
    // console.log(eStr);
    console.table(eTable);
    return eTable;
  },
  ent0: () => {
    return dbgEntSingleton;
  },
  ent: (id: number) => {
    return mkDbgEnt(id);
  },
  cmp: (name: string) => {
    return cmpByName(name);
  },
};
