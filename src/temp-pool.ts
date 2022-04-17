import { quat, vec3 } from "./gl-matrix.js";
import { range } from "./util.js";

class _TempPool {
  private vecs: vec3[];
  private nextVec = 0;

  private quats: quat[];
  private nextQuat = 0;

  constructor(maxVecs: number, maxQuats: number) {
    this.vecs = range(maxVecs).map(() => vec3.create());
    this.quats = range(maxQuats).map(() => quat.create());
  }

  public vec(): vec3 {
    if (this.nextVec >= this.vecs.length) this.nextVec = 0;
    return this.vecs[this.nextVec++];
  }

  public quat(): quat {
    if (this.nextQuat >= this.quats.length) this.nextQuat = 0;
    return this.quats[this.nextQuat++];
  }
}

const pool = new _TempPool(1000, 1000);

export const tempVec = pool.vec.bind(pool);
export const tempQuat = pool.quat.bind(pool);
