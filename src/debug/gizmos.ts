import { AABB, getAABBCornersTemp } from "../physics/aabb.js";
import { createFlatQuadMesh } from "../meshes/primatives.js";
import { Mesh, mergeMeshes } from "../meshes/mesh.js";
import { V3, V, tV, orthonormalize, mat4 } from "../matrix/sprig-matrix.js";
import { assert, dbgDirOnce } from "../utils/util.js";
import { createEmptyMesh } from "../wood/wood.js";

const _UP = V(0, 0, 1);
const _t1 = V3.mk();
const _t2 = V3.mk();
const _t3 = V3.mk();
const _t4 = V3.mk();
const _t5 = V3.mk();
export function createLineMesh(
  width: number,
  start: V3.InputT,
  end: V3.InputT,
  up?: V3.InputT
): Mesh {
  // TODO(@darzu): PERF!! So many temps
  // TODO(@darzu): I'm dissatisfied with how we do mesh building. Should be a
  //    better way. Maybe it's just the stupid vec stuff.
  // TODO(@darzu): consider building straight into the serialize buffers?
  up = V3.copy(_t1, up ?? _UP);
  // TODO(@darzu): IMPL
  const fwd = V3.sub(end, start, _t2);
  const len = V3.len(fwd);
  const right = _t3;
  orthonormalize(fwd, up, right);
  // console.log(vec3Dbg(fwd));
  // console.log(vec3Dbg(up));
  // console.log(vec3Dbg(right));

  V3.scale(fwd, len, fwd);
  V3.scale(right, width * 0.5, right);
  V3.scale(up, width * 0.5, up);
  const left = V3.neg(right, _t4);
  const down = V3.neg(up, _t5);

  const mesh = createEmptyMesh("line");

  const tr = V3.add(up, right, V3.mk());
  const tl = V3.add(up, left, V3.mk());
  const bl = V3.add(down, left, V3.mk());
  const br = V3.add(down, right, V3.mk());
  V3.add(tr, start, tr);
  V3.add(tl, start, tl);
  V3.add(bl, start, bl);
  V3.add(br, start, br);
  mesh.pos.push(tr, tl, bl, br);
  mesh.quad.push(V(0, 1, 2, 3));
  const ftr = V3.add(tr, fwd, V3.mk());
  const ftl = V3.add(tl, fwd, V3.mk());
  const fbl = V3.add(bl, fwd, V3.mk());
  const fbr = V3.add(br, fwd, V3.mk());
  mesh.pos.push(ftr, ftl, fbl, fbr);
  mesh.quad.push(V(7, 6, 5, 4));

  mesh.quad.push(V(1, 0, 4, 5)); // top
  mesh.quad.push(V(4, 0, 3, 7)); // right
  mesh.quad.push(V(2, 1, 5, 6)); // left
  mesh.quad.push(V(3, 2, 6, 7)); // bottom

  mesh.colors = mesh.quad.map((_) => V(0, 0, 0));

  mesh.surfaceIds = mesh.colors.map((_, i) => i + 1);
  (mesh as Mesh).usesProvoking = true;

  return mesh as Mesh;
}

export function createGizmoMesh(): Mesh {
  const mesh = mergeMeshes(
    createLineMesh(0.1, [0.05, 0, 0], [1, 0, 0]),
    createLineMesh(0.1, [0, 0.05, 0], [0, 1, 0]),
    createLineMesh(0.1, [0, 0, 0.05], [0, 0, 1], [1, 0, 0])
  ) as Mesh;
  // const mesh = createLineMesh(1, V(0, 0, 0), V(10, 0, 0));
  mesh.colors.forEach((c, i) => {
    if (i < 6) c[0] = 1.0; // x -> red
    else if (i < 12) c[1] = 1.0; // y -> green
    else c[2] = 1.0; // z -> blue
  });
  (mesh as Mesh).usesProvoking = true;
  // console.dir(mesh);

  return mesh;
}

export interface GraphAxesMeshOpts {
  intervalDomainLength: V3;
  intervalGap: number;
  domainSize: AABB;
  worldSize: AABB;
  axisWidth: number;
}

export function createGraph3DAxesMesh(opts: GraphAxesMeshOpts): Mesh {
  let axes: Mesh[] = [];
  // const gap = opts.axisWidth * 0.2; // TODO(@darzu): tweak
  const halfWidth = opts.axisWidth * 0.5;
  const ups = [tV(0, 1, 0), tV(0, 0, 1), tV(1, 0, 0)];
  for (let i of [0, 1, 2]) {
    const domainLength = opts.domainSize.max[i] - opts.domainSize.min[i];
    const numIntervals = Math.ceil(domainLength / opts.intervalDomainLength[i]);
    const worldLength = opts.worldSize.max[i] - opts.worldSize.min[i];
    const worldIntLength = worldLength / numIntervals;
    let _start = V3.tmp();
    let _end = V3.tmp();
    for (let j = 0; j < numIntervals; j++) {
      V3.set(-halfWidth, -halfWidth, -halfWidth, _start);
      V3.set(-halfWidth, -halfWidth, -halfWidth, _end);
      _start[i] = j * worldIntLength + opts.intervalGap;
      _end[i] = (j + 1) * worldIntLength - opts.intervalGap;
      // TODO(@darzu): TEST world min
      V3.add(_start, opts.worldSize.min, _start);
      V3.add(_end, opts.worldSize.min, _end);
      // console.log(`${vec3Dbg(_start)} -> ${vec3Dbg(_end)}`);
      const ln = createLineMesh(opts.axisWidth, _start, _end, ups[i]);
      ln.colors.forEach((c) => (c[i] = 1.0)); // set R, G, or B
      axes.push(ln);
    }
  }

  const mesh = mergeMeshes(...axes) as Mesh;
  mesh.usesProvoking = true;

  return mesh;
}

export function createGraph3DDataMesh(data: V3[][]): Mesh {
  assert(data.length > 1 && data[0].length > 1);
  const yLen = data.length;
  const xLen = data[0].length;
  // NOTE: this index fn must match the flat mesh's construction
  // TODO(@darzu): standardize grid walk and data[?][?] access conventions for sprig
  const mesh = createFlatQuadMesh(xLen, yLen, true);
  const idx = (xi: number, yi: number) => yi * xLen + xi;
  // mesh.surfaceIds.fill(1);
  for (let yi = 0; yi < yLen; yi++) {
    for (let xi = 0; xi < xLen; xi++) {
      assert(data[yi].length === xLen);
      const i = idx(xi, yi);
      const pos = data[yi][xi];
      V3.copy(mesh.pos[i], pos);
    }
  }
  return mesh;
}

export function createGizmoForAABB(aabb: AABB, width: number): Mesh {
  // TODO(@darzu): this doesn't look right yet..
  const lns: Mesh[] = [];
  const corners = getAABBCornersTemp(aabb);
  for (let i = 0; i < corners.length - 1; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const u = corners[i];
      const v = corners[j];
      const numSame =
        (u[0] === v[0] ? 1 : 0) +
        (u[1] === v[1] ? 1 : 0) +
        (u[2] === v[2] ? 1 : 0);
      if (numSame === 2) {
        const ln = createLineMesh(width, u, v);
        const r = u[0] > 0 && v[0] > 0 ? 1 : 0;
        const g = u[1] > 0 && v[1] > 0 ? 1 : 0;
        const b = u[2] > 0 && v[2] > 0 ? 1 : 0;
        ln.colors.forEach((c) => {
          V3.set(r, g, b, c);
        });
        lns.push(ln);
      }
    }
  }

  const result = mergeMeshes(...lns) as Mesh;
  result.usesProvoking = true;
  return result;
}
