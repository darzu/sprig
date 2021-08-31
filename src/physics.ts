import { vec3 } from "./gl-matrix.js";

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

    // TODO(@darzu): do better than n^2. oct-tree
    // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
    // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
    for (let o of objs) {
        if (!_collidesWith[o.id])
            _collidesWith[o.id] = []
        else
            _collidesWith[o.id].length = 0
    }

    // naive n^2
    //      3000 objs: 44.6ms, 4,800,000 overlaps
    //      1000 objs: 5.8ms, 500,000 overlaps
    //      100 objs: <0.1ms, 6,000 overlaps
    // for (let i0 = 0; i0 < objs.length; i0++) {
    //     const box0 = objs[i0].worldAABB
    //     for (let i1 = i0 + 1; i1 < objs.length; i1++) {
    //         const box1 = objs[i1].worldAABB
    //         if (doesOverlap(box0, box1)) {
    //             _collidesWith[objs[i0].id].push(objs[i1].id)
    //             _collidesWith[objs[i1].id].push(objs[i0].id)
    //         }
    //     }
    // }

    // naive oct-tree
    //      5000 objs: 12.5ms, 56,000 overlaps + 235,000 enclosed-bys
    //      3000 objs: 7.6ms, 21,000 overlaps + 186,000 enclosed-bys
    //      1000 objs: 2.6ms, 8,500 overlaps + 53,000 enclosed-bys
    //      100 objs: 0.1ms, 1,200 overlaps + 6,000 enclosed-bys
    const octObjs = new Map<number, AABB>(objs.map(o => [o.id, o.worldAABB])); // TODO(@darzu): necessary?
    const maxDist = 10000;
    const octWorld: AABB = { min: [-maxDist, -maxDist, -maxDist], max: [maxDist, maxDist, maxDist] };
    const tree = octtree(octObjs, octWorld);
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

    // TODO(@darzu): debugging
    // console.log(debugOcttree(tree).join(','))
    // console.log(`trees: ${debugOcttree(tree).length}`);

    _lastCollisionTestTimeMs = performance.now() - start;
    return _collidesWith;
}
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

const scratchVec3: vec3 = vec3.create();
function octtree(parentObjs: Map<number, AABB>, aabb: AABB): OctTree | null {
    const thisObjs = new Map<number, AABB>();
    for (let [id, objAABB] of parentObjs.entries()) {
        if (enclosedBy(objAABB, aabb)) {
            thisObjs.set(id, objAABB)
            parentObjs.delete(id)
        }
    }
    if (thisObjs.size === 0)
        return null;
    const nextLen = vec3.scale(scratchVec3, vec3.sub(scratchVec3, aabb.max, aabb.min), 0.5)
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
// function bitree(
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