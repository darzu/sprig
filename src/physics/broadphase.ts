import {
  V2,
  V3,
  V4,
  quat,
  mat4,
  mat3,
  V,
  TV1,
} from "../matrix/sprig-matrix.js";
import { clamp } from "../utils/math.js";
import { sketchDot } from "../utils/sketch.js";
import { range } from "../utils/util.js";
import { vec3Floor } from "../utils/utils-3d.js";
import {
  AABB,
  _doesOverlapAABBs,
  _enclosedBys,
  doesOverlapAABB,
  createAABB,
  enclosedBy,
  __resetAABBDbgCounters,
} from "./aabb.js";

const BROAD_PHASE: "N^2" | "OCT" | "GRID" = "OCT";

// export interface CollidesWith {
//   // one-to-many GameObject ids
//   [id: number]: number[];
// }
export type CollidesWith = Map<number, number[]>;

export function* collisionPairs(
  collidesWith: CollidesWith
): IterableIterator<[number, number]> {
  // TODO(@darzu): is this effecient?
  for (let [leftId, rightIds] of collidesWith) {
    for (let rightId of rightIds) {
      if (leftId < rightId) yield [leftId, rightId];
    }
  }
}

export function resetCollidesWithSet(
  collidesWith: CollidesWith,
  objs: readonly { id: number }[]
): void {
  for (let o of objs) {
    if (!collidesWith.has(o.id)) collidesWith.set(o.id, []);
  }
  for (let [_, ents] of collidesWith) {
    ents.length = 0;
  }
}

export interface BroadphaseResult {
  collidesWith: CollidesWith;
  checkRay: (r: Ray) => RayHit[];
}

let octObjs = new Map<number, AABB>();

// TODO(@darzu): PERF DBG
// const finReg = new FinalizationRegistry((msg) => {
//   console.log(msg);
// });

export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack for stat debugging
let _collidesWith: CollidesWith = new Map();
export function checkBroadphase(
  objs: { aabb: AABB; id: number }[]
): BroadphaseResult {
  const start = performance.now();
  __resetAABBDbgCounters();
  // TODO(@darzu): impl checkRay for non-oct tree broad phase strategies
  let checkRay = (_: Ray) => [] as RayHit[];

  // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
  // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
  // reset _collidesWith
  resetCollidesWithSet(_collidesWith, objs);

  // reset _mapPool
  _nextMap = 0;
  _mapPool.forEach((p) => p.clear());

  // naive n^2
  //      3000 objs: 44.6ms, 4,800,000 overlaps
  //      1000 objs: 5.8ms, 500,000 overlaps
  //      100 objs: <0.1ms, 6,000 overlaps
  if (BROAD_PHASE === "N^2") {
    for (let i0 = 0; i0 < objs.length; i0++) {
      const box0 = objs[i0].aabb;
      for (let i1 = i0 + 1; i1 < objs.length; i1++) {
        const box1 = objs[i1].aabb;
        if (doesOverlapAABB(box0, box1)) {
          _collidesWith.get(objs[i0].id)!.push(objs[i1].id);
          _collidesWith.get(objs[i1].id)!.push(objs[i0].id);
        }
      }
    }
  }

  // determine our bounds
  const universeAABB = createAABB();
  for (let o of objs) {
    for (let i = 0; i < 3; i++) {
      universeAABB.min[i] = Math.min(universeAABB.min[i], o.aabb.min[i]);
      universeAABB.max[i] = Math.max(universeAABB.max[i], o.aabb.max[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    universeAABB.min[i] -= 10;
    universeAABB.max[i] += 10;
  }

  // naive oct-tree (last measured 68482c94)
  //      5000 objs: 12.5ms, 56,000 overlaps + 235,000 enclosed-bys
  //      3000 objs: 7.6ms, 21,000 overlaps + 186,000 enclosed-bys
  //      3000 objs @[2000, 200, 2000]: 5ms, 26,000 + 120,000 enclosed-bys ?
  //      1000 objs: 2.6ms, 8,500 overlaps + 53,000 enclosed-bys
  //      100 objs: 0.1ms, 1,200 overlaps + 6,000 enclosed-bys
  if (BROAD_PHASE === "OCT") {
    // TODO(@darzu): check layer masks
    octObjs.clear();
    objs.forEach((o) => octObjs.set(o.id, o.aabb));
    const tree = octtree(octObjs, universeAABB);

    // if (tree) finReg.register(tree, `Oct tree collected!`);

    function octCheckOverlap(tree: OctTree) {
      // check ea obj
      for (let obj of tree.objs.entries()) {
        octObjCheckOverlap(obj, tree, true);
      }
      // check ea tree
      for (let t of tree.children) {
        if (t) octCheckOverlap(t);
      }
    }
    function octObjCheckOverlap(
      obj: [number, AABB],
      tree: OctTree,
      first = false
    ) {
      const [id0, box0] = obj;
      // check this tree
      for (let [id1, box1] of tree.objs) {
        if ((!first || id0 < id1) && doesOverlapAABB(box0, box1)) {
          _collidesWith.get(id0)!.push(id1);
          _collidesWith.get(id1)!.push(id0);
        }
      }
      // check down the tree
      for (let t of tree.children) {
        if (t && doesOverlapAABB(box0, t.aabb)) {
          octObjCheckOverlap(obj, t);
        }
      }
    }
    if (tree) {
      octCheckOverlap(tree);
      checkRay = (r: Ray) => checkRayVsOct(tree, r);
    }
  }

  // grid / buckets / spacial hash
  //      3000 objs @[2000, 200, 2000]: 1.2-7.6ms, 180,000-400,000 overlaps, 4,400 cell checks
  if (BROAD_PHASE === "GRID") {
    // initialize world
    if (!_worldGrid) _worldGrid = createWorldGrid(universeAABB, V(10, 10, 10));
    // place objects in grid
    for (let o of objs) {
      let ll = _objToObjLL[o.id];
      if (!ll)
        // new object
        ll = _objToObjLL[o.id] = {
          id: o.id,
          minCoord: V3.mk(),
          maxCoord: V3.mk(),
          aabb: o.aabb,
          next: null,
          prev: null,
        };
      gridPlace(_worldGrid, ll);
    }
    // check for collisions
    let _numMultiCell = 0;
    _cellChecks = 0;
    for (let o of Object.values(_objToObjLL)) {
      if (!o.prev) continue; // not attached
      if (V3.equals(o.minCoord, o.maxCoord)) {
        // we're fully within one cell
        checkCell(o, o.prev);
      } else {
        // we're within multiple cells
        for (let x = o.minCoord[0]; x <= o.maxCoord[0]; x++) {
          for (let y = o.minCoord[1]; y <= o.maxCoord[1]; y++) {
            for (let z = o.minCoord[2]; z <= o.maxCoord[2]; z++) {
              const c = _worldGrid.grid[gridIdx(_worldGrid, V(x, y, z))];
              checkCell(o, c);
            }
          }
        }
        _numMultiCell++;
        // TODO(@darzu): impl
        // console.log(`obj in multiple cells! (${o.minCoord.join(',')})->(${o.maxCoord.join(',')})`)
      }
    }
    console.log(`_cellChecks: ${_cellChecks}`);
    console.log(`_numMultiCell: ${_numMultiCell}`);
  }

  // TODO(@darzu): debugging
  // console.log(debugOcttree(tree).join(','))
  // console.log(`num oct-trees: ${debugOcttree(tree).length}`);

  _lastCollisionTestTimeMs = performance.now() - start;
  return {
    collidesWith: _collidesWith,
    checkRay,
  };
}
let _worldGrid: WorldGrid | null = null;
const _objToObjLL: { [id: number]: ObjLL } = {};
export let _cellChecks = 0;

// grid buckets implementation
// TODO(@darzu): impl
interface WorldGrid {
  aabb: AABB;
  cellSize: V3;
  dimensions: V3;
  grid: WorldCell[];
}
interface WorldCell {
  next: ObjLL | null;
}
interface ObjLL {
  id: number;
  aabb: AABB;
  minCoord: V3;
  maxCoord: V3;
  next: ObjLL | null;
  prev: WorldCell | ObjLL | null;
}
function createWorldGrid(aabb: AABB, cellSize: V3): WorldGrid {
  const chunkSize = V3.sub(aabb.max, aabb.min, V3.mk());
  const dims = V3.div(chunkSize, cellSize, V3.mk());
  vec3Floor(dims, dims);
  const gridLength = dims[0] * dims[1] * dims[2];
  console.log(gridLength);
  const grid = range(gridLength).map((_) => ({ next: null } as WorldCell));
  return {
    aabb,
    cellSize,
    dimensions: dims,
    grid,
  };
}
function gridRemove(o: ObjLL) {
  const oldPrev = o.prev;
  const oldNext = o.next;
  if (oldPrev) oldPrev.next = oldNext;
  if (oldNext) oldNext.prev = oldPrev;
  o.next = null;
  o.prev = null;
}
function gridIdx(g: WorldGrid, coord: V3): number {
  const idx =
    coord[0] +
    coord[1] * g.dimensions[0] +
    coord[2] * g.dimensions[0] * g.dimensions[1];
  if (idx < 0 || g.grid.length <= idx)
    // TODO(@darzu): for debugging
    throw `object out of bounds! (${coord.join(",")}), idx: ${idx}`;
  return idx;
}
function gridCoord(out: V3, g: WorldGrid, pos: V3): V3 {
  V3.div(V3.sub(pos, g.aabb.min, out), g.cellSize, out);
  // clamp coordinates onto world grid
  // TODO(@darzu): should we use multiple grids?
  out[0] = clamp(Math.floor(out[0]), 0, g.dimensions[0] - 1);
  out[1] = clamp(Math.floor(out[1]), 0, g.dimensions[1] - 1);
  out[2] = clamp(Math.floor(out[2]), 0, g.dimensions[2] - 1);
  return out;
}
function gridPlace(g: WorldGrid, o: ObjLL) {
  const minCoord = gridCoord(_scratchVec3, g, o.aabb.min);
  if (o.prev && V3.equals(minCoord, o.minCoord)) {
    // same place, do nothing
    return;
  }
  // new placement, update coordinates
  V3.copy(o.minCoord, minCoord);
  gridCoord(o.maxCoord, g, o.aabb.max);
  const idx = gridIdx(g, o.minCoord);
  // console.log(`(${coord.join(',')}), idx: ${idx}`)
  const cell = g.grid[idx];
  if (!cell.next) {
    // we're first
    gridRemove(o);
    cell.next = o;
    o.prev = cell;
    return;
  }
  // traverse to end or self
  let tail = cell.next;
  while (tail.next !== null && tail.id !== o.id) {
    tail = tail.next;
  }
  if (tail.id === o.id) {
    // we shouldn't find ourself
    // TODO(@darzu): debugging
    throw `gridPlace: Incorrectly found ourselves at: ${o.minCoord.join(",")}`;
  }
  // add us to the end
  gridRemove(o);
  tail.next = o;
  o.prev = tail;
  return;
}
function checkCell(o: ObjLL, c: ObjLL | WorldCell) {
  _cellChecks++; // TODO(@darzu): debugging;
  // check given
  if ((c as ObjLL).id) {
    checkPair(o, c as ObjLL);
  }
  // check backward
  let prev = (c as ObjLL).prev;
  while (prev && (prev as ObjLL).id) {
    checkPair(o, prev as ObjLL);
    prev = (prev as ObjLL).prev;
  }
  // check forward
  let next = c.next;
  while (next && (next as ObjLL).id) {
    checkPair(o, next as ObjLL);
    next = next.next;
  }
}
function checkPair(
  a: { id: number; aabb: AABB },
  b: { id: number; aabb: AABB }
) {
  if (b.id < a.id && doesOverlapAABB(a.aabb, b.aabb)) {
    _collidesWith.get(a.id)!.push(b.id);
    _collidesWith.get(b.id)!.push(a.id);
  }
}

// OctTree implementation
export interface Ray {
  org: V3;
  dir: V3;
}
export interface RayHit {
  id: number;
  dist: number;
}

// TODO(@darzu): i don't think this fn works in 3d
export function rayVsRay(ra: Ray, rb: Ray): V3 | undefined {
  // ra.org[0] + ra.dir[0] * ta === rb.org[0] + rb.dir[0] * tb
  // ra.org[1] + ra.dir[1] * ta === rb.org[1] + rb.dir[1] * tb
  // ra.org[2] + ra.dir[2] * ta === rb.org[2] + rb.dir[2] * tb
  // const ta = ((rb.org[0] + rb.dir[0] * tb) - ra.org[0]) / ra.dir[0];
  // const tb = ...
  // TODO(@darzu): how does line intersection work?

  // TODO(@darzu): select axis based on rays
  const x = 0;
  const y = 1;

  const a = ra.org;
  const da = ra.dir;
  const b = rb.org;
  const db = rb.dir;

  const term1 = a[y] - b[y] + (da[y] * b[x]) / da[x] - (da[y] * a[x]) / da[x];
  const term2 = db[y] - (da[y] * db[x]) / da[x];
  const tb = term1 / term2;

  if (isNaN(tb) || !isFinite(tb) || tb < 0.0) return undefined;

  const ta = (b[x] + db[x] * tb - a[x]) / da[x];

  if (isNaN(ta) || !isFinite(ta) || ta < 0.0) return undefined;

  const pt = V3.add(b, V3.scale(db, tb), V3.mk());

  // TODO(@darzu): this doesn't handle the third axis!!

  return pt;

  // TODO(@darzu): put this in unit tests...
  // const ra: Ray = {
  //   org: [1, 0, 1],
  //   dir: [1, 0, 0],
  // };
  // const rb: Ray = {
  //   org: [-1, 0, -1],
  //   dir: [0.3, 0, 0.5],
  // };
  // const pab = rayVsRay(ra, rb);
  // console.dir({
  //   ra,
  //   rb,
  //   pab,
  // });
}

function checkRayVsOct(tree: OctTree, ray: Ray): RayHit[] {
  // check this node's AABB
  const d = rayHitDist(tree.aabb, ray);
  if (isNaN(d)) return [];

  let hits: RayHit[] = [];

  // check this node's objects
  for (let [id, b] of tree.objs.entries()) {
    const dist = rayHitDist(b, ray);
    if (!isNaN(d)) hits.push({ id, dist });
  }

  // check this node's children nodes
  for (let t of tree.children) {
    if (t) {
      hits = [...hits, ...checkRayVsOct(t, ray)];
    }
  }

  return hits;
}

// TODO(@darzu): collisions groups and "atRest"
interface OctTree {
  aabb: AABB;
  objs: Map<number, AABB>;
  children: (OctTree | null)[];
}
const _octtreeMinLen = 1.0;

function debugOcttree(tree: OctTree | null): number[] {
  if (!tree) return [];
  return [
    tree.objs.size,
    ...tree.children
      .map(debugOcttree)
      .reduce((p, n) => [...p, ...n], [] as number[]),
  ];
}

const _mapPoolSize = 2000;
const _mapPool: Map<number, AABB>[] = range(_mapPoolSize).map(
  (_) => new Map<number, AABB>()
);
let _nextMap = 0;
const _scratchVec3: V3 = V3.mk();
// TODO(@darzu): PERF. This is creating waayy too many non-temp vecs
function octtree(parentObjs: Map<number, AABB>, aabb: AABB): OctTree | null {
  if (_nextMap >= _mapPool.length)
    throw `Exceeding _mapPool! max: ${_mapPoolSize}`;
  const thisObjs = _mapPool[_nextMap++]; // grab from the map pool
  for (let [id, objAABB] of parentObjs.entries()) {
    if (enclosedBy(objAABB, aabb)) {
      thisObjs.set(id, objAABB);
      parentObjs.delete(id);
    }
  }
  if (thisObjs.size === 0) {
    // we didn't use our map, return it
    _nextMap--;
    return null;
  }
  const nextLen = V3.scale(
    V3.sub(aabb.max, aabb.min, _scratchVec3),
    0.5,
    _scratchVec3
  );
  if (thisObjs.size <= 2 || nextLen[0] <= _octtreeMinLen)
    return {
      aabb,
      objs: thisObjs,
      children: [null, null, null, null, null, null, null, null],
    };
  const childAABBs: AABB[] = [];
  // TODO(@darzu): PERF. way too much alloc'ing here!
  for (let xMin of [aabb.min[0], aabb.min[0] + nextLen[0]]) {
    for (let yMin of [aabb.min[1], aabb.min[1] + nextLen[1]]) {
      for (let zMin of [aabb.min[2], aabb.min[2] + nextLen[2]]) {
        childAABBs.push({
          min: V(xMin, yMin, zMin),
          max: V3.clone([
            xMin + nextLen[0],
            yMin + nextLen[1],
            zMin + nextLen[2],
          ]),
        });
      }
    }
  }
  return {
    aabb,
    children: childAABBs.map((aabb) => octtree(thisObjs, aabb)),
    objs: thisObjs,
  };
}

// AABB utils
// returns NaN if they don't hit
export function rayHitDist(b: AABB, r: Ray): number {
  // TODO(@darzu): can be made faster using inverse ray direction:
  //    https://tavianator.com/2011/ray_box.html
  //    https://tavianator.com/2015/ray_box_nan.html
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let d = 0; d < 3; d++) {
    if (r.dir[d] !== 0) {
      // these are the maximum and minimum distances we
      // could travel along the ray in dimension d, which
      // is either we could travel to the box's minimum bound
      // or it's maximum bound in d.
      const travel1 = (b.min[d] - r.org[d]) / r.dir[d];
      const travel2 = (b.max[d] - r.org[d]) / r.dir[d];

      // update or total min & max travel distances
      tmin = Math.max(tmin, Math.min(travel1, travel2));
      tmax = Math.min(tmax, Math.max(travel1, travel2));
    } else if (r.org[d] <= b.min[d] || r.org[d] >= b.max[d]) {
      // if it's right on the bounds, consider it a miss
      return NaN;
    }
  }

  if (tmin <= tmax && 0.0 < tmax) return Math.max(tmin, 0);

  return NaN;
}

export interface Sphere {
  org: V3;
  rad: number;
}

export interface Line {
  ray: Ray;
  len: number;
}
export function getLineEnd(out: V3, line: Line) {
  V3.scale(line.ray.dir, line.len, out);
  V3.add(line.ray.org, out, out);
  return out;
}
export function getLineMid(out: V3, line: Line) {
  V3.scale(line.ray.dir, line.len * 0.5, out);
  V3.add(line.ray.org, out, out);
  return out;
}

// TODO(@darzu): do we need this pattern?
export function emptyRay(): Ray {
  return {
    org: V3.mk(),
    dir: V3.mk(),
  };
}
export function copyRay(out: Ray, a: Ray): Ray {
  V3.copy(out.org, a.org);
  V3.copy(out.dir, a.dir);
  return out;
}
export function emptyLine(): Line {
  return {
    ray: emptyRay(),
    len: 0,
  };
}
export function copyLine(out: Line, a: Line): Line {
  copyRay(out.ray, a.ray);
  out.len = a.len;
  return out;
}

export function createLine(a: V3, b: V3): Line {
  const len = V3.dist(a, b);
  const dir = V3.sub(b, a, V3.mk());
  V3.norm(dir, dir);
  return {
    ray: {
      org: V3.clone(a),
      dir,
    },
    len,
  };
}

const __temp1 = mat3.create();
export function transformLine(out: Line, t: mat4) {
  // TODO(@darzu): this code needs review. It might not work right with scaling
  // TODO(@darzu): PERF! This code needs to be inlined and simplified.
  //      There's no way we need this much matrix math for this.
  V3.norm(out.ray.dir, out.ray.dir); // might not be needed if inputs r always normalized
  V3.tMat4(out.ray.org, t, out.ray.org);
  const t3 = mat3.fromMat4(t, __temp1);
  V3.tMat3(out.ray.dir, t3, out.ray.dir);
  const lenScale = V3.len(out.ray.dir);
  out.len = out.len * lenScale;
  V3.norm(out.ray.dir, out.ray.dir);
  return out;
}

const __t2 = V3.mk();
export function raySphereIntersections(
  ray: Ray,
  sphere: Sphere,
  out?: V2
): V2 | undefined {
  // https://iquilezles.org/articles/intersectors/
  const a = V3.sub(ray.org, sphere.org, __t2);
  const b = V3.dot(a, ray.dir);
  const c = V3.dot(a, a) - sphere.rad * sphere.rad;
  const h = b * b - c;
  if (h < 0.0) return undefined; // no intersection
  const h2 = Math.sqrt(h);
  out = out ?? V2.tmp();
  return V2.set(-b - h2, -b + h2, out);
}

// TODO(@darzu): MOVE to narrowphase
export function lineSphereIntersections(
  line: Line,
  sphere: Sphere,
  out?: V2
): V2 | undefined {
  const hits = raySphereIntersections(line.ray, sphere, out);
  // return hits; // TODO(@darzu): HACK
  if (!hits) return undefined;
  // TODO(@darzu): what about negative numbers?
  if (
    // miss 1
    (hits[0] < 0 || line.len < hits[0]) &&
    // miss 2
    (hits[1] < 0 || line.len < hits[1]) &&
    // not inside
    sphere.rad ** 2 < V3.sqrDist(line.ray.org, sphere.org)
  ) {
    return undefined;
  }

  return hits;
}
