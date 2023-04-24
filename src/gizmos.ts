import { AABB } from "./physics/aabb.js";
import { Mesh, mergeMeshes } from "./render/mesh.js";
import { vec3, V, tV } from "./sprig-matrix.js";
import { orthonormalize, vec3Dbg } from "./utils-3d.js";
import { createEmptyMesh } from "./wood.js";

const _UP = V(0, 1, 0);
export function createLineMesh(
  width: number,
  start: vec3.InputT,
  end: vec3.InputT,
  up?: vec3.InputT
): Mesh {
  // TODO(@darzu): PERF!! So many temps
  // TODO(@darzu): I'm dissatisfied with how we do mesh building. Should be a
  //    better way. Maybe it's just the stupid vec stuff.
  // TODO(@darzu): consider building straight into the serialize buffers?
  up = vec3.copy(vec3.tmp(), up ?? _UP);
  // TODO(@darzu): IMPL
  const fwd = vec3.sub(end, start);
  const len = vec3.length(fwd);
  const right = vec3.tmp();
  orthonormalize(fwd, up, right);
  // console.log(vec3Dbg(fwd));
  // console.log(vec3Dbg(up));
  // console.log(vec3Dbg(right));

  vec3.scale(fwd, len, fwd);
  vec3.scale(right, width * 0.5, right);
  vec3.scale(up, width * 0.5, up);
  const left = vec3.negate(right);
  const down = vec3.negate(up);

  const mesh = createEmptyMesh("line");

  const tr = vec3.add(up, right, vec3.create());
  const tl = vec3.add(up, left, vec3.create());
  const bl = vec3.add(down, left, vec3.create());
  const br = vec3.add(down, right, vec3.create());
  vec3.add(tr, start, tr);
  vec3.add(tl, start, tl);
  vec3.add(bl, start, bl);
  vec3.add(br, start, br);
  mesh.pos.push(tr, tl, bl, br);
  mesh.quad.push(V(0, 1, 2, 3));
  const ftr = vec3.add(tr, fwd, vec3.create());
  const ftl = vec3.add(tl, fwd, vec3.create());
  const fbl = vec3.add(bl, fwd, vec3.create());
  const fbr = vec3.add(br, fwd, vec3.create());
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
    createLineMesh(0.1, V(0.05, 0, 0), V(1, 0, 0)),
    createLineMesh(0.1, V(0, 0.05, 0), V(0, 1, 0), V(1, 0, 0)),
    createLineMesh(0.1, V(0, 0, 0.05), V(0, 0, 1))
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

export interface GraphOptions {
  intervalLength: vec3;
  intervalGap: number;
  domainSize: AABB;
  worldSize: AABB;
  axisWidth: number;
}

export function createGraph3DAxesMesh(opts: GraphOptions): Mesh {
  let axes: Mesh[] = [];
  // const gap = opts.axisWidth * 0.2; // TODO(@darzu): tweak
  const halfWidth = opts.axisWidth * 0.5;
  const ups = [tV(0, 1, 0), tV(0, 0, 1), tV(1, 0, 0)];
  for (let i of [0, 1, 2]) {
    const domainLength = opts.domainSize.max[i] - opts.domainSize.min[i];
    const numIntervals = Math.ceil(domainLength / opts.intervalLength[i]);
    const worldLength = opts.worldSize.max[i] - opts.worldSize.min[i];
    const worldIntLength = worldLength / numIntervals;
    let _start = vec3.tmp();
    let _end = vec3.tmp();
    for (let j = 0; j < numIntervals; j++) {
      vec3.set(-halfWidth, -halfWidth, -halfWidth, _start);
      vec3.set(-halfWidth, -halfWidth, -halfWidth, _end);
      _start[i] = j * worldIntLength + opts.intervalGap;
      _end[i] = (j + 1) * worldIntLength - opts.intervalGap;
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
