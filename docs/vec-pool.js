import { quat, vec3 } from "./gl-matrix.js";
import { range } from "./util.js";
class _PrimPool {
    constructor(maxVecs, maxQuats) {
        this.nextVec = 0;
        this.nextQuat = 0;
        this.vecs = range(maxVecs).map(() => vec3.create());
        this.quats = range(maxQuats).map(() => quat.create());
    }
    vec() {
        if (this.nextVec >= this.vecs.length)
            this.nextVec = 0;
        return this.vecs[this.nextVec++];
    }
    quat() {
        if (this.nextQuat >= this.quats.length)
            this.nextQuat = 0;
        return this.quats[this.nextQuat++];
    }
}
export const PrimPool = new _PrimPool(100, 100);
//# sourceMappingURL=vec-pool.js.map