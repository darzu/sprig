import { vec3 } from "./gl-matrix.js";
import { clamp } from "./math.js";
import { range } from "./util.js";
import { vec3Floor } from "./utils-3d.js";
const BROAD_PHASE = "OCT";
export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack for stat debugging
let _collidesWith = {};
export function checkCollisions(objs) {
    const start = performance.now();
    _doesOverlaps = 0; // TODO(@darzu): debugging
    _enclosedBys = 0; // TODO(@darzu): debugging
    // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
    // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
    // reset _collidesWith
    for (let o of objs) {
        if (!_collidesWith[o.id])
            _collidesWith[o.id] = [];
        else
            _collidesWith[o.id].length = 0;
    }
    // reset _mapPool
    _nextMap = 0;
    _mapPool.forEach((p) => p.clear());
    // naive n^2
    //      3000 objs: 44.6ms, 4,800,000 overlaps
    //      1000 objs: 5.8ms, 500,000 overlaps
    //      100 objs: <0.1ms, 6,000 overlaps
    if (BROAD_PHASE === "N^2") {
        for (let i0 = 0; i0 < objs.length; i0++) {
            const box0 = objs[i0].worldAABB;
            for (let i1 = i0 + 1; i1 < objs.length; i1++) {
                const box1 = objs[i1].worldAABB;
                if (doesOverlap(box0, box1)) {
                    _collidesWith[objs[i0].id].push(objs[i1].id);
                    _collidesWith[objs[i1].id].push(objs[i0].id);
                }
            }
        }
    }
    const maxHorizontalDist = 1000;
    const maxVerticalDist = 100;
    const worldAABB = {
        min: [-maxHorizontalDist, -maxVerticalDist, -maxHorizontalDist],
        max: [maxHorizontalDist, maxVerticalDist, maxHorizontalDist],
    };
    // naive oct-tree
    //      5000 objs: 12.5ms, 56,000 overlaps + 235,000 enclosed-bys
    //      3000 objs: 7.6ms, 21,000 overlaps + 186,000 enclosed-bys
    //      3000 objs @[2000, 200, 2000]: 5ms, 26,000 + 120,000 enclosed-bys ?
    //      1000 objs: 2.6ms, 8,500 overlaps + 53,000 enclosed-bys
    //      100 objs: 0.1ms, 1,200 overlaps + 6,000 enclosed-bys
    if (BROAD_PHASE === "OCT") {
        const octObjs = new Map(objs.map((o) => [o.id, o.worldAABB])); // TODO(@darzu): necessary?
        const tree = octtree(octObjs, worldAABB);
        function octCheckOverlap(tree) {
            // check ea obj
            for (let obj of tree.objs.entries()) {
                octObjCheckOverlap(obj, tree, true);
            }
            // check ea tree
            for (let t of tree.children) {
                if (t)
                    octCheckOverlap(t);
            }
        }
        function octObjCheckOverlap(obj, tree, first = false) {
            const [id0, box0] = obj;
            // check this tree
            for (let [id1, box1] of tree.objs) {
                if ((!first || id0 < id1) && doesOverlap(box0, box1)) {
                    _collidesWith[id0].push(id1);
                    _collidesWith[id1].push(id0);
                }
            }
            // check down the tree
            for (let t of tree.children) {
                if (t && doesOverlap(box0, t.aabb)) {
                    octObjCheckOverlap(obj, t);
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
            _worldGrid = createWorldGrid(worldAABB, [10, 10, 10]);
        // place objects in grid
        for (let o of objs) {
            let ll = _objToObjLL[o.id];
            if (!ll)
                // new object
                ll = _objToObjLL[o.id] = {
                    id: o.id,
                    minCoord: vec3.create(),
                    maxCoord: vec3.create(),
                    aabb: o.worldAABB,
                    next: null,
                    prev: null,
                };
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
                checkCell(o, o.prev);
            }
            else {
                // we're within multiple cells
                for (let x = o.minCoord[0]; x <= o.maxCoord[0]; x++) {
                    for (let y = o.minCoord[1]; y <= o.maxCoord[1]; y++) {
                        for (let z = o.minCoord[2]; z <= o.maxCoord[2]; z++) {
                            const c = _worldGrid.grid[gridIdx(_worldGrid, [x, y, z])];
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
    return _collidesWith;
}
let _worldGrid = null;
const _objToObjLL = {};
export let _cellChecks = 0;
function createWorldGrid(aabb, cellSize) {
    const chunkSize = vec3.sub(vec3.create(), aabb.max, aabb.min);
    const dims = vec3.div(vec3.create(), chunkSize, cellSize);
    vec3Floor(dims, dims);
    const gridLength = dims[0] * dims[1] * dims[2];
    console.log(gridLength);
    const grid = range(gridLength).map((_) => ({ next: null }));
    return {
        aabb,
        cellSize,
        dimensions: dims,
        grid,
    };
}
function gridRemove(o) {
    const oldPrev = o.prev;
    const oldNext = o.next;
    if (oldPrev)
        oldPrev.next = oldNext;
    if (oldNext)
        oldNext.prev = oldPrev;
    o.next = null;
    o.prev = null;
}
function gridIdx(g, coord) {
    const idx = coord[0] +
        coord[1] * g.dimensions[0] +
        coord[2] * g.dimensions[0] * g.dimensions[1];
    if (idx < 0 || g.grid.length <= idx)
        // TODO(@darzu): for debugging
        throw `object out of bounds! (${coord.join(",")}), idx: ${idx}`;
    return idx;
}
function gridCoord(out, g, pos) {
    vec3.div(out, vec3.sub(out, pos, g.aabb.min), g.cellSize);
    // clamp coordinates onto world grid
    // TODO(@darzu): should we use multiple grids?
    out[0] = clamp(Math.floor(out[0]), 0, g.dimensions[0] - 1);
    out[1] = clamp(Math.floor(out[1]), 0, g.dimensions[1] - 1);
    out[2] = clamp(Math.floor(out[2]), 0, g.dimensions[2] - 1);
    return out;
}
function gridPlace(g, o) {
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
function checkCell(o, c) {
    _cellChecks++; // TODO(@darzu): debugging;
    // check given
    if (c.id) {
        checkPair(o, c);
    }
    // check backward
    let prev = c.prev;
    while (prev && prev.id) {
        checkPair(o, prev);
        prev = prev.prev;
    }
    // check forward
    let next = c.next;
    while (next && next.id) {
        checkPair(o, next);
        next = next.next;
    }
}
function checkPair(a, b) {
    if (b.id < a.id && doesOverlap(a.aabb, b.aabb)) {
        _collidesWith[a.id].push(b.id);
        _collidesWith[b.id].push(a.id);
    }
}
const _octtreeMinLen = 1.0;
function debugOcttree(tree) {
    if (!tree)
        return [];
    return [
        tree.objs.size,
        ...tree.children
            .map(debugOcttree)
            .reduce((p, n) => [...p, ...n], []),
    ];
}
const _mapPoolSize = 2000;
const _mapPool = range(_mapPoolSize).map((_) => new Map());
let _nextMap = 0;
const _scratchVec3 = vec3.create();
function octtree(parentObjs, aabb) {
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
    const nextLen = vec3.scale(_scratchVec3, vec3.sub(_scratchVec3, aabb.max, aabb.min), 0.5);
    if (thisObjs.size <= 2 || nextLen[0] <= _octtreeMinLen)
        return {
            aabb,
            objs: thisObjs,
            children: [null, null, null, null, null, null, null, null],
        };
    const childAABBs = [];
    for (let xMin of [aabb.min[0], aabb.min[0] + nextLen[0]]) {
        for (let yMin of [aabb.min[1], aabb.min[1] + nextLen[1]]) {
            for (let zMin of [aabb.min[2], aabb.min[2] + nextLen[2]]) {
                childAABBs.push({
                    min: [xMin, yMin, zMin],
                    max: [xMin + nextLen[0], yMin + nextLen[1], zMin + nextLen[2]],
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
export let _doesOverlaps = 0;
export function doesOverlap(a, b) {
    _doesOverlaps++; // TODO(@darzu): debugging
    return (true &&
        b.min[0] <= a.max[0] &&
        b.min[1] <= a.max[1] &&
        b.min[2] <= a.max[2] &&
        a.min[0] <= b.max[0] &&
        a.min[1] <= b.max[1] &&
        a.min[2] <= b.max[2]);
}
export let _enclosedBys = 0;
export function enclosedBy(inner, outer) {
    _enclosedBys++; // TODO(@darzu): debugging
    return (true &&
        inner.max[0] <= outer.max[0] &&
        inner.max[1] <= outer.max[1] &&
        inner.max[2] <= outer.max[2] &&
        outer.min[0] <= inner.min[0] &&
        outer.min[1] <= inner.min[1] &&
        outer.min[2] <= inner.min[2]);
}
export function getAABBFromPositions(positions) {
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
//# sourceMappingURL=phys_collision.js.map