import { mat4, vec3 } from "./gl-matrix.js";
import { CUBE_MESH } from "./main.js";
import { clamp } from "./math.js";
import { Mesh, MeshHandle } from "./mesh-pool.js";
import { range } from "./util.js";
import { vec3Floor, vec3ToStr } from "./utils-3d.js";

const BROAD_PHASE: "N^2" | "OCT" | "GRID" = "GRID";

export interface CollidesWith {
    // one-to-many GameObject ids
    [id: number]: number[]
}

export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack for stat debugging
let _collidesWith: CollidesWith = {};
export function checkCollisions(objs: { worldAABB: AABB, id: number }[]): CollidesWith {
    const start = performance.now()
    _doesOverlaps = 0; // TODO(@darzu): debugging
    _enclosedBys = 0; // TODO(@darzu): debugging

    // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
    // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
    // reset _collidesWith
    for (let o of objs) {
        if (!_collidesWith[o.id])
            _collidesWith[o.id] = []
        else
            _collidesWith[o.id].length = 0
    }
    // reset _mapPool
    _nextMap = 0;
    _mapPool.forEach(p => p.clear())

    // naive n^2
    //      3000 objs: 44.6ms, 4,800,000 overlaps
    //      1000 objs: 5.8ms, 500,000 overlaps
    //      100 objs: <0.1ms, 6,000 overlaps
    if (BROAD_PHASE === "N^2") {
        for (let i0 = 0; i0 < objs.length; i0++) {
            const box0 = objs[i0].worldAABB
            for (let i1 = i0 + 1; i1 < objs.length; i1++) {
                const box1 = objs[i1].worldAABB
                if (doesOverlap(box0, box1)) {
                    _collidesWith[objs[i0].id].push(objs[i1].id)
                    _collidesWith[objs[i1].id].push(objs[i0].id)
                }
            }
        }
    }

    const maxHorizontalDist = 1000;
    const maxVerticalDist = 100;
    const worldAABB: AABB = { min: [-maxHorizontalDist, -maxVerticalDist, -maxHorizontalDist], max: [maxHorizontalDist, maxVerticalDist, maxHorizontalDist] };

    // naive oct-tree
    //      5000 objs: 12.5ms, 56,000 overlaps + 235,000 enclosed-bys
    //      3000 objs: 7.6ms, 21,000 overlaps + 186,000 enclosed-bys
    //      3000 objs @[2000, 200, 2000]: 5ms, 26,000 + 120,000 enclosed-bys ?
    //      1000 objs: 2.6ms, 8,500 overlaps + 53,000 enclosed-bys
    //      100 objs: 0.1ms, 1,200 overlaps + 6,000 enclosed-bys
    if (BROAD_PHASE === "OCT") {
        const octObjs = new Map<number, AABB>(objs.map(o => [o.id, o.worldAABB])); // TODO(@darzu): necessary?
        const tree = octtree(octObjs, worldAABB);
        function octCheckOverlap(tree: OctTree) {
            // check ea obj
            for (let obj of tree.objs.entries()) {
                octObjCheckOverlap(obj, tree, true);
            }
            // check ea tree
            for (let t of tree.children) {
                if (t)
                    octCheckOverlap(t)
            }
        }
        function octObjCheckOverlap(obj: [number, AABB], tree: OctTree, first = false) {
            const [id0, box0] = obj;
            // check this tree
            for (let [id1, box1] of tree.objs) {
                if ((!first || id0 < id1) && doesOverlap(box0, box1)) {
                    _collidesWith[id0].push(id1)
                    _collidesWith[id1].push(id0)
                }
            }
            // check down the tree
            for (let t of tree.children) {
                if (t && doesOverlap(box0, t.aabb)) {
                    octObjCheckOverlap(obj, t)
                }
            }
        }
        if (tree)
            octCheckOverlap(tree);
    }

    // grid / buckets / spacial hash
    //      3000 objs @[2000, 200, 2000]: 1.2-7.6ms, 180,000-400,000 overlaps, 4,400 cell checks
    if (BROAD_PHASE === "GRID") {
        // initialize world
        if (!_worldGrid)
            _worldGrid = createWorldGrid(worldAABB, [10, 10, 10])
        // place objects in grid
        for (let o of objs) {
            let ll = _objToObjLL[o.id]
            if (!ll) // new object
                ll = _objToObjLL[o.id] = {
                    id: o.id,
                    minCoord: vec3.create(),
                    maxCoord: vec3.create(),
                    aabb: o.worldAABB,
                    next: null,
                    prev: null
                }
            gridPlace(_worldGrid, ll);
        }
        // check for collisions
        let _numMultiCell = 0;
        _cellChecks = 0;
        for (let o of Object.values(_objToObjLL)) {
            if (!o.prev)
                continue; // not attached
            if (vec3.equals(o.minCoord, o.maxCoord)) {
                // we're fully within one cell
                checkCell(o, o.prev)
            } else {
                // we're within multiple cells
                for (let x = o.minCoord[0]; x <= o.maxCoord[0]; x++) {
                    for (let y = o.minCoord[1]; y <= o.maxCoord[1]; y++) {
                        for (let z = o.minCoord[2]; z <= o.maxCoord[2]; z++) {
                            const c = _worldGrid.grid[gridIdx(_worldGrid, [x, y, z])]
                            checkCell(o, c);
                        }
                    }
                }
                _numMultiCell++;
                // TODO(@darzu): impl
                // console.log(`obj in multiple cells! (${o.minCoord.join(',')})->(${o.maxCoord.join(',')})`)
            }
        }
        // console.log(`_cellChecks: ${_cellChecks}`)
        // console.log(`_numMultiCell: ${_numMultiCell}`)
        // console.log(`player minCoord: ${vec3ToStr(_objToObjLL[3].minCoord)}-${vec3ToStr(_objToObjLL[3].maxCoord)} : ${vec3ToStr(_objToObjLL[3].aabb.min)}-${vec3ToStr(_objToObjLL[3].aabb.max)}`)
    }

    // TODO(@darzu): debugging
    // console.log(debugOcttree(tree).join(','))
    // console.log(`num oct-trees: ${debugOcttree(tree).length}`);

    _lastCollisionTestTimeMs = performance.now() - start;
    return _collidesWith;
}

let _debugMeshes: { [id: number]: MeshHandle } = {}
export function debugCollisions(setDebugMesh: (id: number, m: Mesh, t: mat4) => MeshHandle, removeDebugMesh: (id: number) => void) {
    // TODO(@darzu): impl
    if (BROAD_PHASE === "GRID" && _worldGrid) {
        for (let x = 0; x < _worldGrid.dimensions[0]; x++) {
            for (let y = 0; y < _worldGrid.dimensions[1]; y++) {
                for (let z = 0; z < _worldGrid.dimensions[2]; z++) {
                    const i = gridIdx(_worldGrid, [x, y, z])
                    if (_worldGrid.grid[i].next) {
                        if (!_debugMeshes[i]) {
                            const t = mat4.create()
                            mat4.scale(t, t, vec3.scale(_scratchVec3, _worldGrid.cellSize, 0.5));
                            mat4.translate(t, t, [x + 0.5, y + 0.5, z + 0.5])
                            _debugMeshes[i] = setDebugMesh(i, CUBE_MESH, t)
                        }
                    } else if (_debugMeshes[i]) {
                        removeDebugMesh(i)
                    }
                }
            }
        }
    }
}

// grid buckets implementation
let _worldGrid: WorldGrid | null = null;
const _objToObjLL: { [id: number]: ObjLL } = {};
export let _cellChecks = 0;
interface WorldGrid {
    aabb: AABB,
    cellSize: vec3,
    dimensions: vec3,
    grid: WorldCell[],
}
interface WorldCell {
    next: ObjLL | null,
}
interface ObjLL {
    id: number,
    aabb: AABB,
    minCoord: vec3,
    maxCoord: vec3,
    next: ObjLL | null,
    prev: WorldCell | ObjLL | null,
}
function createWorldGrid(aabb: AABB, cellSize: vec3): WorldGrid {
    console.log(`cellSize: ${cellSize}`)
    const chunkSize = vec3.sub(vec3.create(), aabb.max, aabb.min)
    console.log(`chunkSize: ${chunkSize}`)
    const dims = vec3.div(vec3.create(), chunkSize, cellSize);
    vec3Floor(dims, dims);
    console.log(`dims: ${vec3ToStr(dims)}`)
    const gridLength = dims[0] * dims[1] * dims[2];
    console.log(`gridLength: ${gridLength}`)
    const grid = range(gridLength).map(_ => ({ next: null } as WorldCell));

    const result: WorldGrid = {
        aabb,
        cellSize,
        dimensions: dims,
        grid,
    }

    // TODO(@darzu): testing coordinate stuff
    // {
    //     const cs = [
    //         vec3.fromValues(1, 2, 3),
    //         vec3.fromValues(7, 0, 2),
    //         vec3.fromValues(0, 9, 5),
    //     ]
    //     console.log(cs.map(vec3ToStr).join(':'))
    //     const _is = cs.map(c => gridIdx(result, c))
    //     console.log(_is.join(':'))
    //     const _cs = _is.map(i => gridCoordFromIdx(vec3.create(), result, i))
    //     console.log(_cs.map(vec3ToStr).join(':'))
    // }

    return result;
}
function gridRemove(o: ObjLL) {
    const oldPrev = o.prev;
    const oldNext = o.next;
    if (oldPrev)
        oldPrev.next = oldNext;
    if (oldNext)
        oldNext.prev = oldPrev;
    o.next = null;
    o.prev = null;
}
function gridIdx(g: WorldGrid, coord: vec3): number {
    const idx = coord[0] + coord[1] * g.dimensions[0] + coord[2] * g.dimensions[0] * g.dimensions[1]
    if (idx < 0 || g.grid.length <= idx) // TODO(@darzu): for debugging
        throw `object out of bounds! (${coord.join(',')}), idx: ${idx}`
    return idx;
}
function gridCoordFromIdx(out: vec3, g: WorldGrid, idx: number): vec3 {
    // TODO(@darzu): impl
    out[2] = Math.floor(
        (idx % (g.dimensions[0] * g.dimensions[1] * g.dimensions[2]))
        / (g.dimensions[0] * g.dimensions[1]))
    out[1] = Math.floor(
        (idx % (g.dimensions[0] * g.dimensions[1]))
        / (g.dimensions[0]))
    out[0] = Math.floor(
        (idx % (g.dimensions[0]))
        / (1))
    return out;
}
function gridCoord(out: vec3, g: WorldGrid, pos: vec3): vec3 {
    vec3.div(out, vec3.sub(out, pos, g.aabb.min), g.cellSize);
    // clamp coordinates onto world grid
    // TODO(@darzu): should we use multiple grids?
    out[0] = clamp(Math.floor(out[0]), 0, g.dimensions[0] - 1)
    out[1] = clamp(Math.floor(out[1]), 0, g.dimensions[1] - 1)
    out[2] = clamp(Math.floor(out[2]), 0, g.dimensions[2] - 1)
    return out;
}
function gridPlace(g: WorldGrid, o: ObjLL) {
    // new placement, update coordinates
    gridCoord(o.minCoord, g, o.aabb.min);
    gridCoord(o.maxCoord, g, o.aabb.max);
    if (o.prev && vec3.equals(o.minCoord, o.minCoord)) {
        // same place, do nothing
        return;
    }
    const idx = gridIdx(g, o.minCoord);
    // console.log(`(${coord.join(',')}), idx: ${idx}`)
    const cell = g.grid[idx]
    if (!cell.next) {
        // we're first
        gridRemove(o)
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
        throw `gridPlace: Incorrectly found ourselves at: ${o.minCoord.join(',')}`
    }
    // add us to the end
    gridRemove(o)
    tail.next = o;
    o.prev = tail;
    return;
}
function checkCell(o: ObjLL, c: ObjLL | WorldCell) {
    _cellChecks++ // TODO(@darzu): debugging;
    // if (o === _objToObjLL[3]) {
    //     console.log(`checking at for player`)
    // }
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
function checkPair(a: { id: number, aabb: AABB }, b: { id: number, aabb: AABB }) {
    if (b.id < a.id && doesOverlap(a.aabb, b.aabb)) {
        _collidesWith[a.id].push(b.id);
        _collidesWith[b.id].push(a.id);
    }
}

// OctTree implementation
interface OctTree {
    aabb: AABB,
    objs: Map<number, AABB>,
    children: (OctTree | null)[],
}
const _octtreeMinLen = 1.0;

function debugOcttree(tree: OctTree | null): number[] {
    if (!tree)
        return []
    return [tree.objs.size, ...tree.children.map(debugOcttree).reduce((p, n) => [...p, ...n], [] as number[])]
}

const _mapPoolSize = 2000;
const _mapPool: Map<number, AABB>[] = range(_mapPoolSize).map(_ => new Map<number, AABB>());
let _nextMap = 0;
const _scratchVec3: vec3 = vec3.create();
function octtree(parentObjs: Map<number, AABB>, aabb: AABB): OctTree | null {
    if (_nextMap >= _mapPool.length)
        throw `Exceeding _mapPool! max: ${_mapPoolSize}`
    const thisObjs = _mapPool[_nextMap++]; // grab from the map pool
    for (let [id, objAABB] of parentObjs.entries()) {
        if (enclosedBy(objAABB, aabb)) {
            thisObjs.set(id, objAABB)
            parentObjs.delete(id)
        }
    }
    if (thisObjs.size === 0) {
        // we didn't use our map, return it
        _nextMap--;
        return null;
    }
    const nextLen = vec3.scale(_scratchVec3, vec3.sub(_scratchVec3, aabb.max, aabb.min), 0.5)
    if (thisObjs.size <= 2 || nextLen[0] <= _octtreeMinLen)
        return { aabb, objs: thisObjs, children: [null, null, null, null, null, null, null, null] }
    const childAABBs: AABB[] = [];
    for (let xMin of [aabb.min[0], aabb.min[0] + nextLen[0]]) {
        for (let yMin of [aabb.min[1], aabb.min[1] + nextLen[1]]) {
            for (let zMin of [aabb.min[2], aabb.min[2] + nextLen[2]]) {
                childAABBs.push({
                    min: [xMin, yMin, zMin],
                    max: [xMin + nextLen[0], yMin + nextLen[1], zMin + nextLen[2]],
                })
            }
        }
    }
    return {
        aabb,
        children: childAABBs.map(aabb => octtree(thisObjs, aabb)),
        objs: thisObjs,
    }
}

// AABB utils
export let _doesOverlaps = 0;
export function doesOverlap(a: AABB, b: AABB) {
    _doesOverlaps++; // TODO(@darzu): debugging
    return true
        && b.min[0] <= a.max[0]
        && b.min[1] <= a.max[1]
        && b.min[2] <= a.max[2]
        && a.min[0] <= b.max[0]
        && a.min[1] <= b.max[1]
        && a.min[2] <= b.max[2]
}
export let _enclosedBys = 0;
export function enclosedBy(inner: AABB, outer: AABB) {
    _enclosedBys++; // TODO(@darzu): debugging
    return true
        && inner.max[0] <= outer.max[0]
        && inner.max[1] <= outer.max[1]
        && inner.max[2] <= outer.max[2]
        && outer.min[0] <= inner.min[0]
        && outer.min[1] <= inner.min[1]
        && outer.min[2] <= inner.min[2]
}
export interface AABB {
    min: vec3,
    max: vec3,
}
export function getAABBFromPositions(positions: vec3[]): AABB {
    const min = vec3.fromValues(Infinity, Infinity, Infinity)
    const max = vec3.fromValues(-Infinity, -Infinity, -Infinity)

    for (let pos of positions) {
        min[0] = Math.min(pos[0], min[0])
        min[1] = Math.min(pos[1], min[1])
        min[2] = Math.min(pos[2], min[2])
        max[0] = Math.max(pos[0], max[0])
        max[1] = Math.max(pos[1], max[1])
        max[2] = Math.max(pos[2], max[2])
    }

    return { min, max }
}