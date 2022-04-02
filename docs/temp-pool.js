import { quat, vec3 } from "./gl-matrix.js";
import { range } from "./util.js";
class _TempPool {
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
const pool = new _TempPool(100, 100);
export const tempVec = pool.vec.bind(pool);
export const tempQuat = pool.quat.bind(pool);
//# sourceMappingURL=temp-pool.js.map