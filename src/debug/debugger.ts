import {
  CameraFollowDef,
  getCameraSettings,
  getCameraSettingsCodeStr,
} from "../camera/camera.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { CompId } from "../ecs/em-components.js";
import { ComponentDef } from "../ecs/em-components.js";
import { ResourceDef } from "../ecs/em-resources.js";
import {
  MetaPhases,
  NameFromPhase,
  Phase,
  PhaseName,
  PhaseNameList,
  PhaseNameToMetaPhase,
} from "../ecs/sys-phase.js";
import {
  PERF_DBG_F32S,
  PERF_DBG_F32S_BLAME,
  PERF_DBG_F32S_TEMP_BLAME,
  PERF_DBG_GPU_BLAME,
} from "../flags.js";
import { SyncDef } from "../net/components.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { dbgClearBlame, dbgGetBlame } from "../utils/util-no-import.js";
import { assert, toMap } from "../utils/util.js";
import { quatDbg, vec3Dbg, vec4Dbg } from "../utils/utils-3d.js";

// TODO(@darzu): debugging helpers
interface DbgCmp extends ComponentDef {
  abv: string;
}
interface DbgEnt extends Entity {
  _cmps: () => DbgCmp[];
}

// meshHandle,time,netTimer,physicsTimer,inputs,collider,motion,inWorld,finished,sync,
// peer,host,authority,deleted,me,inbox,outbox,netStats,eventsFromNetwork,
// eventsToNetwork,networkReady,join,bullet,bulletConstruct,cubeConstruct,player,
// hsPlayerProps,camera,transform,motionSmoothing,parent,renderable,cameraComputed,
// physicsResults,_phys,enemyShip,enemyShipConstruct,detectedEvents,requestedEvents,events,
// groundConstruct,shipConstruct,hatConstruct,color,hat

const dbgEnts: Map<number, DbgEnt> = new Map();
// TODO(@darzu): remove
// let dbgEntSingleton: DbgEnt = { id: 0, _cmps: () => [] };

const dbgCmpsAllById: Map<CompId, DbgCmp> = new Map();
const dbgCmpsAllByName: Map<string, DbgCmp> = new Map();
let dbgCmpsAllByAbv: Map<string, DbgCmp> = new Map();
const dbgCmps: Map<string, DbgCmp> = new Map();
// const dbgCmpsSingleton: Map<string, DbgCmp> = new Map();

function mkDbgCmp(id: CompId): DbgCmp {
  // if (dbgCmpsAllById.has(id)) return dbgCmpsAllById.get(id)!;
  const c = EM.componentDefs.get(id);
  if (!c) throw `No component by id ${id}`;
  const dc: DbgCmp = Object.assign(c, { abv: c.name });
  // dbgCmpsAllById.set(id, dc);
  // dbgCmps.set(dc.name, dc);
  return dc;
}
function mkDbgEnt(id: number): DbgEnt {
  if (id === 0) throw `Invalid entity id '0', use resources!`;
  // if (dbgEnts.has(id)) return dbgEnts.get(id)!;
  const e = EM.entities.get(id);
  if (!e) throw `No entity by id ${id}`;
  const _cmps = () => {
    const res: DbgCmp[] = [];
    for (let p of Object.keys(e)) {
      const c = dbgCmps.get(p);
      if (c) res.push(c);
    }
    return res;
  };
  const _addSync = (nickname: string) => {
    if ("sync" in e) {
      const c = cmpByName(nickname);
      if (c) (e as EntityW<[typeof SyncDef]>).sync.dynamicComponents.push(c.id);
    }
  };
  const de = Object.assign(e, { _cmps, _addSync });
  // if (id === 0) dbgEntSingleton = de;
  // else dbgEnts.set(id, de);
  return de;
}
function sortByName<N extends string>(ls: { [P in N]: string }[], n: N) {
  ls.sort((a, b) => {
    const aNm = a[n].toUpperCase();
    const bNm = b[n].toUpperCase();
    if (aNm < bNm) return -1;
    if (aNm > bNm) return 1;
    return 0;
  });
}
type Named = { name: string };
type Abv = string;
function createAbvs<N extends Named>(named: N[]): Map<Abv, N> {
  // sort first for more stable output
  sortByName(named, "name");

  // split names into parts
  const allParts = named.map((s) => wordParts(s.name));
  const firstParts = allParts.map((ps) => ps[0]).filter((p) => !!p);
  const latterParts = allParts
    .map((ps) => ps.slice(1))
    .filter((p) => !!p && p.length)
    .reduce((p, n) => [...p, ...n], []);

  // for each part, find an abv
  const strToAbv: Map<string, Abv> = new Map();
  const abvToStr: Map<Abv, string> = new Map();
  firstParts.forEach((s) => findNewAbv(s, 3));
  latterParts.forEach((s) => findNewAbv(s, 1));

  // build map from abv to N
  const res: Map<Abv, N> = new Map();
  named.forEach((n, i) => {
    const ps = allParts[i];
    const abvs = ps.map((p) => strToAbv.get(p)!);
    const abv = abvs.join("");
    res.set(abv, n);
  });
  return res;

  function findNewAbv(s: string, preferedLen: number) {
    if (strToAbv.has(s)) return; // already have one
    if (s.length <= preferedLen) {
      // we're as short as we can get
      abvToStr.set(s, s);
      strToAbv.set(s, s);
      return;
    }
    const abv = s.substr(0, preferedLen);
    if (!abvToStr.has(abv)) {
      // not taken
      abvToStr.set(abv, s);
      strToAbv.set(s, abv);
    } else {
      // abreviation taken
      const other = abvToStr.get(abv)!;
      // undo other
      abvToStr.delete(abv);
      strToAbv.delete(other);
      // find a new for other
      findNewAbv(other, preferedLen + 1);
      // find a new abv for this
      findNewAbv(s, preferedLen + 1);
    }
  }
  function wordParts(s: string): string[] {
    // assume camel case
    const parts: string[] = [];
    let next = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (isUpper(c)) {
        // new part
        parts.push(next);
        next = "";
      }
      next += c;
    }
    parts.push(next);

    return parts.filter((p) => !!p);
  }
  function isUpper(s: string): boolean {
    return "A" <= s && s <= "Z";
  }
}
function updateCmps() {
  // TODO(@darzu): resources r broken
  // dbgEntSingleton = mkDbgEnt(0);

  if (EM.componentDefs.size !== dbgCmpsAllById.size) {
    dbgCmpsAllById.clear();
    dbgCmps.clear();
    // dbgCmpsSingleton.clear();

    for (let id of EM.componentDefs.keys()) {
      const dc = mkDbgCmp(id);
      dbgCmpsAllById.set(id, dc);
      dbgCmpsAllByName.set(dc.name, dc);

      // if (dc.name in dbgEntSingleton) dbgCmpsSingleton.set(dc.name, dc);
      // else
      dbgCmps.set(dc.name, dc);
    }

    dbgCmpsAllByAbv = createAbvs([...dbgCmpsAllById.values()]);
    for (let [abv, c] of dbgCmpsAllByAbv) c.abv = abv;
  }
}
function updateEnts() {
  // TODO(@darzu): resources r broken
  // dbgEntSingleton = mkDbgEnt(0);

  if (dbgEnts.size + 1 !== EM.entities.size) {
    dbgEnts.clear();
    for (let id of EM.entities.keys()) {
      if (id === 0) continue;
      dbgEnts.set(id, mkDbgEnt(id));
    }
  }
}
function filterEnts(...cmpNames: string[]): Entity[] {
  return EM.dbgFilterEntitiesByKey(cmpNames);
}
function cmpByName(name: string): DbgCmp | null {
  let res = dbgCmps.get(name) ?? dbgCmpsAllByAbv.get(name);
  if (!res) updateCmps();
  res = dbgCmps.get(name) ?? dbgCmpsAllByAbv.get(name);
  if (!res)
    // TODO(@darzu): fuzzy match?
    return null;
  return res;
}

export const dbg = {
  saveCamera: () => {
    const targets = EM.filterEntities_uncached([
      CameraFollowDef,
      RotationDef,
      PositionDef,
    ]);
    const target = targets.reduce(
      (p, n) => (n.cameraFollow.priority > p.cameraFollow.priority ? n : p),
      targets[0]
    );
    if (!target) {
      console.error(`no target!`);
      return;
    }
    console.log(getCameraSettingsCodeStr(getCameraSettings(target)));
  },
  listCmps: () => {
    updateCmps();
    const cmps = [...dbgCmps.values()];
    //...dbgCmpsSingleton.values()
    sortByName(cmps, "name");
    const cStr = cmps.map((c) => `${c.name}\t(${c.abv}, ${c.id})`).join("\n");
    console.table(cStr);
  },
  listEnts: (...cs: string[]) => {
    updateEnts();
    updateCmps();
    const es = [...dbgEnts.values()].filter((e) =>
      cs.every(
        (c) => c in e || (dbgCmpsAllByAbv.get(c)?.name ?? "INVALID") in e
      )
    );
    const eTable = es.map((e) => {
      const res: any = { id: e.id };
      for (let c of e._cmps()) {
        res[c.abv] = (e as any)[c.name];
      }
      return res;
    });
    // console.log(eStr);
    console.table(eTable);
    return es;
  },
  // ent0: () => {
  //   updateEnts();
  //   return dbgEntSingleton;
  // },
  ent: (id: number) => {
    return mkDbgEnt(id);
  },
  cmp: (name: string) => {
    return cmpByName(name);
  },
  f32sBlameClear: () => {
    assert(PERF_DBG_F32S_BLAME);
    dbgClearBlame("f32s");
  },
  f32sBlame: () => {
    assert(PERF_DBG_F32S_BLAME, `enable PERF_DBG_F32S_BLAME!`);
    const ents = [...dbgGetBlame("f32s")!.entries()].filter(
      (e) =>
        e[0] !== "Error" &&
        !e[0].includes("sprig-matrix.js") &&
        !e[0].endsWith("(<anonymous>)")
    );
    ents.sort((a, b) => b[1] - a[1]);
    let res = ``;
    for (let [ln, num] of ents) {
      res += `${ln}: ${((num * 4) / 1024).toFixed(1)}kb\n`;
    }
    console.log(res);
  },
  tempf32sBlameClear: () => {
    assert(PERF_DBG_F32S_TEMP_BLAME);
    dbgClearBlame("temp_f32s");
  },
  tempf32sBlame: () => {
    // TODO(@darzu): DE-DUPE with above
    assert(PERF_DBG_F32S_TEMP_BLAME);
    const ents = [...dbgGetBlame("temp_f32s")!.entries()].filter(
      (e) =>
        e[0] !== "Error" &&
        !e[0].includes("sprig-matrix.js") &&
        !e[0].endsWith("(<anonymous>)")
    );
    ents.sort((a, b) => b[1] - a[1]);
    let res = ``;
    for (let [ln, num] of ents) {
      res += `${ln}: ${((num * 4) / 1024).toFixed(1)}kb\n`;
    }
    console.log(res);
  },
  gpuBlameClear: () => {
    assert(PERF_DBG_GPU_BLAME);
    dbgClearBlame("gpu");
  },
  gpuBlame: () => {
    assert(PERF_DBG_GPU_BLAME);
    const ents = [...dbgGetBlame("gpu")!.entries()].filter(
      (e) => e[0] !== "Error"
      // &&
      // !e[0].includes("sprig-matrix.js") &&
      // !e[0].endsWith("(<anonymous>)")
    );
    ents.sort((a, b) => b[1] - a[1]);
    let res = ``;
    for (let [ln, num] of ents) {
      res += `${ln}: ${((num * 4) / 1024).toFixed(1)}kb\n`;
    }
    console.log(res);
  },
  summarizeInit: () => {
    const res = EM.summarizeInitStats();
    console.log(res);
  },
  summarizeStats: () => {
    let stats = EM.sysStats;
    let totalQueryTime = EM.emStats.queryTime;
    let totalCallTime = Object.values(stats)
      .map((s) => s.callTime)
      .reduce((x, y) => x + y);
    let totalTime = totalQueryTime + totalCallTime;
    let callTimes: { s: string; t: number; m: number }[] = [];
    for (let s of Object.keys(stats)) {
      callTimes.push({ s, t: stats[s].callTime, m: stats[s].maxCallTime });
    }
    callTimes.push({ s: "ALL QUERIES", t: totalQueryTime, m: -1 });
    const phaseTimes = toMap(
      PhaseNameList,
      (n) => n,
      (_) => 0
    );
    for (let s of Object.keys(stats)) {
      const phaseVal = EM.allSystemsByName.get(s)?.phase;
      if (phaseVal) {
        const phase = NameFromPhase(phaseVal);
        phaseTimes.set(phase, phaseTimes.get(phase)! + stats[s].callTime);
      }
    }
    for (let p of phaseTimes.keys()) {
      callTimes.push({ s: `# ${p}`, t: phaseTimes.get(p)!, m: -1 });
    }
    const metaPhaseTimes = toMap(
      MetaPhases,
      (n) => n,
      (_) => 0
    );
    for (let p of phaseTimes.keys()) {
      const meta = PhaseNameToMetaPhase.get(p)!;
      metaPhaseTimes.set(meta, metaPhaseTimes.get(meta)! + phaseTimes.get(p)!);
    }
    for (let p of metaPhaseTimes.keys()) {
      callTimes.push({
        s: `## ${p}`,
        t: metaPhaseTimes.get(p)!,
        m: -1,
      });
    }
    callTimes.sort((x, y) => y.t - x.t);
    let out = "";
    for (let { s, t, m } of callTimes) {
      const percent = ((t * 100) / totalTime).toFixed(1);
      const avgTime = (t / EM.emStats.dbgLoops).toFixed(2);
      const maxTime = m.toFixed(1);
      const sysTotalTime = t.toFixed(1);
      out += `${s}: ${percent}% (${avgTime}ms, max: ${maxTime}ms, total: ${sysTotalTime}ms)\n`;
    }

    out += "\n";
    out +=
      "time per frame: " + (totalTime / EM.emStats.dbgLoops).toFixed(3) + "ms";
    console.log(out);
  },
};
