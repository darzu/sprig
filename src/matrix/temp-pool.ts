import { V2, V3, V4, quat, mat4, V } from "./sprig-matrix.js";
import { range } from "../utils/util.js";

// TODO(@darzu): remove this!! we have a different way to do this now

class _TempPool {
  private vec2s: V2[];
  private nextVec2 = 0;
  private vec3s: V3[];
  private nextVec3 = 0;
  private vec4s: V4[];
  private nextVec4 = 0;

  private quats: quat[];
  private nextQuat = 0;

  private mat4s: mat4[];
  private nextMat4 = 0;

  constructor(maxVecs: number, maxQuats: number, maxMat4s: number) {
    this.vec2s = range(maxVecs).map(() => V2.mk());
    this.vec3s = range(maxVecs).map(() => V3.mk());
    this.vec4s = range(maxVecs).map(() => V4.mk());
    this.quats = range(maxQuats).map(() => quat.create());
    this.mat4s = range(maxMat4s).map(() => mat4.create());
  }

  public vec2(): V2 {
    if (this.nextVec2 >= this.vec2s.length) this.nextVec2 = 0;
    return this.vec2s[this.nextVec2++];
  }
  public vec3(): V3 {
    if (this.nextVec3 >= this.vec3s.length) this.nextVec3 = 0;
    return this.vec3s[this.nextVec3++];
  }
  public vec4(): V4 {
    if (this.nextVec4 >= this.vec4s.length) this.nextVec4 = 0;
    return this.vec4s[this.nextVec4++];
  }

  public quat(): quat {
    if (this.nextQuat >= this.quats.length) this.nextQuat = 0;
    return this.quats[this.nextQuat++];
  }

  public mat4(): mat4 {
    if (this.nextMat4 >= this.mat4s.length) this.nextMat4 = 0;
    return this.mat4s[this.nextMat4++];
  }
}

const pool = new _TempPool(1000, 1000, 1000);

// TODO(@darzu): for debugging temp vec problems
// export const tempVec = () => V3.create();
export const tempVec2 = pool.vec2.bind(pool);
export const tempVec3 = pool.vec3.bind(pool);
export const tempVec4 = pool.vec4.bind(pool);
export const tempQuat = pool.quat.bind(pool);
export const tempMat4 = pool.mat4.bind(pool);
