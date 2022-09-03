import { vec2, vec3, vec4, quat, mat4, vec3f } from "../sprig-matrix.js";
import { clamp } from "../math.js";
import { tempVec3 } from "../temp-pool.js";
import { range } from "../util.js";
import { vec3Floor } from "../utils-3d.js";

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
  objs: { id: number }[]
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

export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack for stat debugging
let _collidesWith: CollidesWith = new Map();
export function checkBroadphase(
  objs: { aabb: AABB; id: number }[]
): BroadphaseResult {
  const start = performance.now();
  _doesOverlapAABBs = 0; // TODO(@darzu): debugging
  _enclosedBys = 0; // TODO(@darzu): debugging
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
    const octObjs = new Map<number, AABB>(objs.map((o) => [o.id, o.aabb])); // TODO(@darzu): necessary?
    const tree = octtree(octObjs, universeAABB);
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
    if (!_worldGrid)
      _worldGrid = createWorldGrid(universeAABB, vec3.clone([10, 10, 10]));
    // place objects in grid
    for (let o of objs) {
      let ll = _objToObjLL[o.id];
      if (!ll)
        // new object
        ll = _objToObjLL[o.id] = {
          id: o.id,
          minCoord: vec3.create(),
          maxCoord: vec3.create(),
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
      if (vec3.equals(o.minCoord, o.maxCoord)) {
        // we're fully within one cell
        checkCell(o, o.prev);
      } else {
        // we're within multiple cells
        for (let x = o.minCoord[0]; x <= o.maxCoord[0]; x++) {
          for (let y = o.minCoord[1]; y <= o.maxCoord[1]; y++) {
            for (let z = o.minCoord[2]; z <= o.maxCoord[2]; z++) {
              const c =
                _worldGrid.grid[gridIdx(_worldGrid, vec3.clone([x, y, z]))];
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
  cellSize: vec3;
  dimensions: vec3;
  grid: WorldCell[];
}
interface WorldCell {
  next: ObjLL | null;
}
interface ObjLL {
  id: number;
  aabb: AABB;
  minCoord: vec3;
  maxCoord: vec3;
  next: ObjLL | null;
  prev: WorldCell | ObjLL | null;
}
function createWorldGrid(aabb: AABB, cellSize: vec3): WorldGrid {
  const chunkSize = vec3.sub(aabb.max, aabb.min, vec3.create());
  const dims = vec3.div(chunkSize, cellSize, vec3.create());
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
function gridIdx(g: WorldGrid, coord: vec3): number {
  const idx =
    coord[0] +
    coord[1] * g.dimensions[0] +
    coord[2] * g.dimensions[0] * g.dimensions[1];
  if (idx < 0 || g.grid.length <= idx)
    // TODO(@darzu): for debugging
    throw `object out of bounds! (${coord.join(",")}), idx: ${idx}`;
  return idx;
}
function gridCoord(out: vec3, g: WorldGrid, pos: vec3): vec3 {
  vec3.div(vec3.sub(pos, g.aabb.min, out), g.cellSize, out);
  // clamp coordinates onto world grid
  // TODO(@darzu): should we use multiple grids?
  out[0] = clamp(Math.floor(out[0]), 0, g.dimensions[0] - 1);
  out[1] = clamp(Math.floor(out[1]), 0, g.dimensions[1] - 1);
  out[2] = clamp(Math.floor(out[2]), 0, g.dimensions[2] - 1);
  return out;
}
function gridPlace(g: WorldGrid, o: ObjLL) {
  const minCoord = gridCoord(_scratchVec3, g, o.aabb.min);
  if (o.prev && vec3.equals(minCoord, o.minCoord)) {
    // same place, do nothing
    return;
  }
  // new placement, update coordinates
  vec3.copy(o.minCoord, minCoord);
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
  org: vec3;
  dir: vec3;
}
export interface RayHit {
  id: number;
  dist: number;
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
const _scratchVec3: vec3 = vec3.create();
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
  const nextLen = vec3.scale(
    vec3.sub(aabb.max, aabb.min, _scratchVec3),
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
  for (let xMin of [aabb.min[0], aabb.min[0] + nextLen[0]]) {
    for (let yMin of [aabb.min[1], aabb.min[1] + nextLen[1]]) {
      for (let zMin of [aabb.min[2], aabb.min[2] + nextLen[2]]) {
        childAABBs.push({
          min: vec3.clone([xMin, yMin, zMin]),
          max: vec3.clone([
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

export let _doesOverlapAABBs = 0;
export function doesOverlapAABB(a: AABB, b: AABB) {
  _doesOverlapAABBs++; // TODO(@darzu): debugging
  // TODO(@darzu): less then or less then and equal?
  return (
    true &&
    b.min[0] < a.max[0] &&
    b.min[1] < a.max[1] &&
    b.min[2] < a.max[2] &&
    a.min[0] < b.max[0] &&
    a.min[1] < b.max[1] &&
    a.min[2] < b.max[2]
  );
}
export let _enclosedBys = 0;
export function enclosedBy(inner: AABB, outer: AABB) {
  _enclosedBys++; // TODO(@darzu): debugging
  return (
    true &&
    inner.max[0] < outer.max[0] &&
    inner.max[1] < outer.max[1] &&
    inner.max[2] < outer.max[2] &&
    outer.min[0] < inner.min[0] &&
    outer.min[1] < inner.min[1] &&
    outer.min[2] < inner.min[2]
  );
}
export function doesTouchAABB(a: AABB, b: AABB, threshold: number) {
  _doesOverlapAABBs++; // TODO(@darzu): debugging
  return (
    true &&
    b.min[0] < a.max[0] + threshold &&
    b.min[1] < a.max[1] + threshold &&
    b.min[2] < a.max[2] + threshold &&
    a.min[0] < b.max[0] + threshold &&
    a.min[1] < b.max[1] + threshold &&
    a.min[2] < b.max[2] + threshold
  );
}
export interface AABB {
  min: vec3f;
  max: vec3f;
}
export function createAABB(): AABB {
  return {
    min: vec3.create(),
    max: vec3.create(),
  };
}
export function copyAABB(out: AABB, a: AABB) {
  vec3.copy(out.min, a.min);
  vec3.copy(out.max, a.max);
  return out;
}
export function aabbCenter(out: vec3, a: AABB): vec3 {
  out[0] = (a.min[0] + a.max[0]) * 0.5;
  out[1] = (a.min[1] + a.max[1]) * 0.5;
  out[2] = (a.min[2] + a.max[2]) * 0.5;
  return out;
}
export function getAABBFromPositions(positions: vec3[]): AABB {
  const min = vec3.fromValues(Infinity, Infinity, Infinity);
  const max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

  for (let pos of positions) {
    min[0] = Math.min(pos[0], min[0]);
    min[1] = Math.min(pos[1], min[1]);
    min[2] = Math.min(pos[2], min[2]);
    max[0] = Math.max(pos[0], max[0]);
    max[1] = Math.max(pos[1], max[1]);
    max[2] = Math.max(pos[2], max[2]);
  }

  return { min, max };
}
