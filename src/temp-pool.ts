import { mat4, quat, vec2, vec3, vec4 } from "./gl-matrix.js";
import { range } from "./util.js";

class _TempPool {
  private vec2s: vec2[];
  private nextVec2 = 0;
  private vec3s: vec3[];
  private nextVec3 = 0;
  private vec4s: vec4[];
  private nextVec4 = 0;

  private quats: quat[];
  private nextQuat = 0;

  private mat4s: mat4[];
  private nextMat4 = 0;

  constructor(maxVecs: number, maxQuats: number, maxMat4s: number) {
    this.vec2s = range(maxVecs).map(() => vec2.create());
    this.vec3s = range(maxVecs).map(() => vec3.create());
    this.vec4s = range(maxVecs).map(() => vec4.create());
    this.quats = range(maxQuats).map(() => quat.create());
    this.mat4s = range(maxMat4s).map(() => mat4.create());
  }

  public vec2(): vec2 {
    if (this.nextVec2 >= this.vec2s.length) this.nextVec2 = 0;
    return this.vec2s[this.nextVec2++];
  }
  public vec3(): vec3 {
    if (this.nextVec3 >= this.vec3s.length) this.nextVec3 = 0;
    return this.vec3s[this.nextVec3++];
  }
  public vec4(): vec4 {
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
// export const tempVec = () => vec3.create();
export const tempVec2 = pool.vec2.bind(pool);
export const tempVec3 = pool.vec3.bind(pool);
export const tempVec4 = pool.vec4.bind(pool);
export const tempQuat = pool.quat.bind(pool);
export const tempMat4 = pool.mat4.bind(pool);
