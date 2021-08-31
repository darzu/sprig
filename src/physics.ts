import { vec3 } from "./gl-matrix.js";

export interface CollidesWith {
    // one-to-many GameObject ids
    [id: number]: number[]
}

export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack for stat debugging
let _collidesWith: CollidesWith = {};
export function checkCollisions(objs: { worldAABB: AABB, id: number }[]): CollidesWith {
    const start = performance.now()

    // TODO(@darzu): do better than n^2. oct-tree
    // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
    // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
    for (let o of objs) {
        if (!_collidesWith[o.id])
            _collidesWith[o.id] = []
        else
            _collidesWith[o.id].length = 0
    }
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
    _lastCollisionTestTimeMs = performance.now() - start;
    return _collidesWith;
}
export function doesOverlap(a: AABB, b: AABB) {
    return true
        && b.min[0] <= a.max[0]
        && b.min[1] <= a.max[1]
        && b.min[2] <= a.max[2]
        && a.min[0] <= b.max[0]
        && a.min[1] <= b.max[1]
        && a.min[2] <= b.max[2]
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