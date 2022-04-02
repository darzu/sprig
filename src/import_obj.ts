// Import .obj files into sprig format
// https://people.cs.clemson.edu/~dhouse/courses/405/docs/brief-obj-file-format.html
// http://paulbourke.net/dataformats/obj/

import { vec2, vec3 } from "./gl-matrix.js";
import { Mesh } from "./render/mesh-pool.js";
import { idPair, IdPair } from "./physics/phys.js";
import { assert } from "./test.js";
import { isString } from "./util.js";

/*
Notes:
 - .obj is ascii
 - .mtl file is a materials file

format:
v x y z <- geo vertex
vn vi dx dy dz <- normal
vt vi u v <- texture vertex
f v1/t1/n1 v2/t2/n2 .... vn/tn/nn <- face
usemtl NAME <- starting a material
*/

export type ParseError = string; // TODO(@darzu): more sophisticated error format?

export function isParseError(m: any | ParseError): m is ParseError {
  return isString(m);
}

function parseVec(p: string[], len: 2): vec2 | ParseError;
function parseVec(p: string[], len: 3): vec3 | ParseError;
function parseVec(p: string[], len: number): number[] | vec3 | ParseError {
  const nums = p.map((s) => parseFloat(s));
  if (nums.some((n) => isNaN(n) || !isFinite(n)))
    return `invalid vector-${len} format: ${p.join(" ")}`;
  if (nums.length !== len)
    return `invalid vector-${len} format: ${p.join(" ")}`;
  return nums;
}

function parseFaceVert(s: string): vec3 | ParseError {
  // parse v1/t1/n1 into [v1, t1, n1]
  const parts = s.split("/");
  if (parts.length !== 3) return `invalid face vertex: ${s}`;
  const nums = parts.map((s) => parseFloat(s)) as vec3;
  return nums;
}
function parseFace(p: string[]): vec3[] | ParseError {
  const verts = p.map((s) => parseFaceVert(s));
  for (let v of verts) if (isParseError(v)) return v;
  return verts as vec3[];
}

function parseLineVert(s: string): vec2 | ParseError {
  // parse v1/t1 into [v1, t1]
  const parts = s.split("/");
  if (parts.length !== 2) return `invalid line vertex: ${s}`;
  const nums = parts.map((s) => parseFloat(s)) as vec2;
  return nums;
}
function parseLine(p: string[]): vec2[] | ParseError {
  const verts = p.map((s) => parseLineVert(s));
  for (let v of verts) if (isParseError(v)) return v;
  return verts as vec2[];
}

export function exportObj(m: Mesh, iOff: number = 0): string {
  let resLns = [
    `# sprigland exported mesh (${m.pos.length} verts, ${m.tri.length} faces)`,
  ];

  // output vertices
  for (let v of m.pos) {
    resLns.push(`v ${v[0].toFixed(2)} ${v[1].toFixed(2)} ${v[2].toFixed(2)}`);
  }
  // output faces
  for (let f of m.tri) {
    resLns.push(
      `f ${f[0] + 1 + iOff}// ${f[1] + 1 + iOff}// ${f[2] + 1 + iOff}//`
    );
  }
  // output lines
  for (let l of m.lines ?? []) {
    resLns.push(`l ${l[0] + 1 + iOff}/ ${l[1] + 1 + iOff}/`);
  }

  return resLns.join("\n");
}

const FLIP_FACES = false;
export function importObj(obj: string): Mesh[] | ParseError {
  // TODO(@darzu): implement a streaming parser for better perf
  let pos: vec3[] = [];
  let tri: vec3[] = [];
  let colors: vec3[] = [];
  // TODO(@darzu): compute lines
  let lines: vec2[] = [];
  let seenLines: Set<IdPair> = new Set();

  let idxOffset = 0;

  const meshes: Mesh[] = [];

  function nextMesh() {
    // no mesh data, skip
    if (pos.length === 0) return;

    // finish mesh
    for (let i = 0; i < tri.length; i++) {
      // TODO(@darzu): import color
      colors.push([0.2, 0.2, 0.2]);
    }
    const m: Mesh = { pos, tri, colors, lines };
    meshes.push(m);

    // start a new mesh
    idxOffset += pos.length;
    pos = [];
    tri = [];
    colors = [];
    lines = [];
    seenLines = new Set();
  }

  const lns = obj.split("\n");
  const alreadyHasLines = lns.some((l) => l.trim().startsWith("l "));
  const shouldGenerateLines = !alreadyHasLines;

  for (let rawL of lns) {
    const l = rawL.trim();
    const [kind, ...p] = l.split(" ");
    if (!kind) {
      continue;
    } else if (kind === "v") {
      // parse vertex
      //    v x y x
      const nums = parseVec(p, 3);
      if (isParseError(nums)) return nums;
      pos.push(nums);
    } else if (kind === "vn") {
      // parse normal
      //    vn vi dx dy dz
      //    indices are 1-indexed
      // TODO(@darzu): actually, we might not need to parse normals. We recompute these from the face.
    } else if (kind === "usemtl") {
      // parse material assignment
      //    usemtl MATERIAL_NAME
      // TODO(@darzu): implement
    } else if (kind === "l") {
      // parse line
      //    l v1/t1 v2/t2
      const lineOpt = parseLine(p);
      if (isParseError(lineOpt)) return lineOpt;
      const inds = lineOpt.map((v) => v[0] - 1 - idxOffset);
      const indsErr = checkIndices(inds, pos.length - 1);
      if (isParseError(indsErr)) return indsErr + ` in line: ${p.join(" ")}`;
      if (inds.length !== 2) return `Too many indices in line: ${p.join(" ")}`;
      lines.push(inds as vec2);
    } else if (kind === "f") {
      // parse face
      //    f v1/t1/n1 v2/t2/n2 .... vn/tn/nn
      //    indices are 1-indexed
      const faceOpt = parseFace(p);
      if (isParseError(faceOpt)) return faceOpt;
      const inds = faceOpt.map((v) => v[0] - 1 - idxOffset);
      const indsErr = checkIndices(inds, pos.length - 1);
      if (isParseError(indsErr)) return indsErr + ` in face: ${p.join(" ")}`;
      if (inds.length === 3) {
        // triangle
        // TODO(@darzu): clockwise or counter clockwise?
        if (FLIP_FACES) {
          tri.push(reverse(inds as vec3));
        } else {
          tri.push(inds as vec3);
        }
      } else if (inds.length === 4) {
        // quad
        // assuming clockwise, then we want 0,1,3 and 1,2,3
        const tri1: vec3 = [inds[0], inds[1], inds[3]];
        const tri2: vec3 = [inds[1], inds[2], inds[3]];
        if (FLIP_FACES) {
          tri.push(reverse(tri1));
          tri.push(reverse(tri2));
        } else {
          tri.push(tri1);
          tri.push(tri2);
        }
      } else {
        return `unsupported: ${faceOpt.length}-sided face`;
      }

      if (shouldGenerateLines) {
        generateLines(inds);
      }
    } else if (kind === "o") {
      // object name
      // TODO(@darzu):
      console.log(`new obj: ${p}`);
      nextMesh();
    } else if (
      kind === "#" || // comment
      kind === "mtllib" || // accompanying .mtl file name
      kind === "usemap" || // texture map
      kind === "vt" || // texture coordinate
      kind === "s" || // TODO(@darzu): What does "s" mean?
      kind === "g" || // group
      false
    ) {
      // ignore it
    } else {
      console.warn(`unknown .obj line format:\n${l}`);
    }
  }

  if (!pos.length) return "empty mesh";

  // TODO(@darzu): for debugging, assign each face a different shade
  // const colorStep = 0.5 / tri.length;
  // for (let i = 0; i < tri.length; i++) {
  //   const shade = colorStep * i + 0.1;
  //   colors.push([shade, shade, shade]);
  // }

  nextMesh();

  return meshes;

  function checkIndices(
    inds: vec3 | number[],
    maxInd: number
  ): ParseError | null {
    for (let vi of inds)
      if (isNaN(vi) || vi < 0 || maxInd < vi)
        return `invalid vertex index '${vi + 1}'`;
    return null;
  }
  function reverse(v: vec3): vec3 {
    return [v[2], v[1], v[0]];
  }
  function sortByGreedyDistance(inds: number[]) {
    // TODO(@darzu): improve perf?
    const res: number[] = [inds[0]];

    let nextInds = inds.slice(1, inds.length);
    let i0 = inds[0];
    while (true) {
      // console.log(`NIs: ${nextInds.join(",")}`);
      const p0 = pos[i0];

      let minD = Infinity;
      let minII = -1;
      nextInds.forEach((i1, i1i) => {
        const p1 = pos[i1];
        const d = vec3.sqrDist(p0, p1);
        if (d < minD) {
          minD = d;
          minII = i1i;
        }
      });
      if (minD < Infinity) {
        i0 = nextInds[minII];
        res.push(i0);
        nextInds.splice(minII, 1);
      } else {
        break;
      }
    }

    return res;
  }
  function generateLines(inds: number[]) {
    // try to sort the indices so that we don't zig-zag
    if (inds.length > 3) {
      // console.log(`${inds.join(",")} ->`);
      inds = sortByGreedyDistance(inds);
      // console.log(`${inds.join(",")}`);
    }

    const indPairs: vec2[] = [];
    for (let i = 0; i < inds.length; i++) {
      indPairs.push([inds[i], inds[i + 1 === inds.length ? 0 : i + 1]]);
    }
    for (let [i0, i1] of indPairs) {
      const hash = idPair(i0, i1);
      if (!seenLines.has(hash)) {
        lines.push([i0, i1]);
        seenLines.add(hash);
      }
    }
  }
}

// TESTS

function assertObjError(obj: string, e: ParseError): void {
  const m = importObj(obj);
  assert(
    isString(m) && m === e,
    `error mismatch for: ${obj}\n  actual:\t${m}\nexpected:\t${e}`
  );
}
function assertSingleObjSuccess(obj: string): Mesh {
  const m = importObj(obj);
  assert(!isParseError(m), `failed to import obj: ${m}`);
  assert(m.length === 1, `Too many obj: ${m.length}`);
  return m[0];
}

export function testImporters() {
  // invalid
  // TODO(@darzu):
  assertObjError("oijawlidjoiwad", "empty mesh");
  assertObjError("", "empty mesh");
  assertObjError("v foo bar", "invalid vector-3 format: foo bar");
  assertObjError("v 1 2 3 4", "invalid vector-3 format: 1 2 3 4");
  assertObjError("f foo", "invalid face vertex: foo");
  assertObjError(
    `
    v 1 2 3
    v 1 2 3
    f 1/0/0 2/0/0
    `,
    "unsupported: 2-sided face"
  );
  assertObjError(
    `
    v 1 2 3
    v 1 2 3
    v 1 2 3
    f 1/0/0 2/0/0 4/0/0
    `,
    "invalid vertex index '4' in face: 1/0/0 2/0/0 4/0/0"
  );

  // valid
  assertSingleObjSuccess("v 0 1 2");
  const good1 = assertSingleObjSuccess(`
    v 0 1 2
    v 0 1 2
    v 0 1 2
    f 1/0/0 2/0/0 3/0/0
  `);
  assert(good1.tri.length === 1, "test expects 1 tri");
  const good2 = assertSingleObjSuccess(`
  v 0 1 2
  v 0 1 2
  v 0 1 2
  v 0 1 2
  f 1/0/0 2/0/0 3/0/0 4/0/0
  `);
  assert(good2.tri.length === 2, "test expects 2 tris");
  const good3 = assertSingleObjSuccess(`
    v 0 1 2
    v 0 1 2
    v 0 1 2
    l 1/0 2/0
  `);
  assert(
    good3.tri.length === 0 && good3.lines?.length === 1,
    "test expects 0 tri, 1 line"
  );

  // valid, complex
  const hat = assertSingleObjSuccess(HAT_OBJ);

  // exporting
  const hatOut = exportObj(hat);
  // console.log(hatOut);

  // importing our export
  assertSingleObjSuccess(hatOut);
}

// Example hat, straight from blender:
export const HAT_OBJ = `
# Blender v2.92.0 OBJ File: 'hat.blend'
# www.blender.org
mtllib hat.mtl
o Cylinder
v 0.000000 0.000000 -1.000000
v -0.000000 0.100000 -0.956888
v 0.707107 0.000000 -0.707107
v 0.676622 0.100000 -0.676622
v 1.000000 0.000000 0.000000
v 0.956888 0.100000 0.000000
v 0.707107 0.000000 0.707107
v 0.676622 0.100000 0.676622
v -0.000000 0.000000 1.000000
v -0.000000 0.100000 0.956888
v -0.707107 0.000000 0.707107
v -0.676622 0.100000 0.676622
v -1.000000 0.000000 -0.000000
v -0.956888 0.100000 -0.000000
v -0.707107 0.000000 -0.707107
v -0.676622 0.100000 -0.676622
v -0.000000 0.100000 -0.462975
v 0.327373 0.100000 -0.327373
v 0.462975 0.100000 0.000000
v 0.327373 0.100000 0.327373
v -0.000000 0.100000 0.462975
v -0.327373 0.100000 0.327373
v -0.462975 0.100000 -0.000000
v -0.327373 0.100000 -0.327373
v -0.000000 0.405509 -0.382035
v 0.270140 0.405509 -0.270140
v 0.382035 0.405509 0.000000
v 0.270140 0.405509 0.270140
v -0.000000 0.405509 0.382035
v -0.270140 0.405509 0.270140
v -0.382035 0.405509 -0.000000
v -0.270140 0.405509 -0.270140
v -0.000000 0.463052 -0.000000
vt 1.000000 0.500000
vt 1.000000 1.000000
vt 0.875000 1.000000
vt 0.875000 0.500000
vt 0.750000 1.000000
vt 0.750000 0.500000
vt 0.625000 1.000000
vt 0.625000 0.500000
vt 0.500000 1.000000
vt 0.500000 0.500000
vt 0.375000 1.000000
vt 0.375000 0.500000
vt 0.250000 1.000000
vt 0.250000 0.500000
vt 0.375000 1.000000
vt 0.375000 1.000000
vt 0.250000 1.000000
vt 0.250000 1.000000
vt 0.125000 1.000000
vt 0.125000 0.500000
vt 0.000000 1.000000
vt 0.000000 0.500000
vt 0.919706 0.080294
vt 0.580294 0.080294
vt 0.580294 0.419706
vt 0.875000 1.000000
vt 0.750000 1.000000
vt 0.500000 1.000000
vt 0.250000 0.490000
vt 0.080294 0.419706
vt 0.080294 0.419706
vt 0.250000 0.490000
vt 1.000000 1.000000
vt 0.625000 1.000000
vt 0.010000 0.250000
vt 0.010000 0.250000
vt 0.625000 1.000000
vt 0.500000 1.000000
vt 0.875000 1.000000
vt 0.750000 1.000000
vt 0.010000 0.250000
vt 0.080294 0.419706
vt 1.000000 1.000000
vt 0.250000 0.490000
vt 1.000000 1.000000
vt 0.250000 0.490000
vt 0.375000 1.000000
vt 0.625000 1.000000
vt 0.875000 1.000000
vt 0.080294 0.419706
vt 0.500000 1.000000
vt 0.750000 1.000000
vt 0.750000 0.490000
vt 0.919706 0.419706
vt 0.990000 0.250000
vt 0.750000 0.010000
vt 0.510000 0.250000
vn 0.3555 0.3700 -0.8583
vn 0.8583 0.3700 -0.3555
vn 0.8583 0.3700 0.3555
vn 0.3555 0.3700 0.8583
vn -0.3555 0.3700 0.8583
vn -0.8583 0.3700 0.3555
vn -0.8974 0.2378 0.3717
vn -0.8583 0.3700 -0.3555
vn -0.3555 0.3700 -0.8583
vn 0.0000 -1.0000 0.0000
vn 0.0000 1.0000 0.0000
vn 0.3717 0.2378 0.8974
vn 0.8974 0.2378 -0.3717
vn -0.8974 0.2378 -0.3717
vn -0.3717 0.2378 0.8974
vn 0.8974 0.2378 0.3717
vn 0.3717 0.2378 -0.8974
vn -0.3717 0.2378 -0.8974
vn 0.0616 0.9870 -0.1487
vn -0.0616 0.9870 -0.1487
vn -0.1487 0.9870 0.0616
vn 0.0616 0.9870 0.1487
vn 0.1487 0.9870 -0.0616
vn -0.1487 0.9870 -0.0616
vn -0.0616 0.9870 0.1487
vn 0.1487 0.9870 0.0616
usemtl None
s off
f 1/1/1 2/2/1 4/3/1 3/4/1
f 3/4/2 4/3/2 6/5/2 5/6/2
f 5/6/3 6/5/3 8/7/3 7/8/3
f 7/8/4 8/7/4 10/9/4 9/10/4
f 9/10/5 10/9/5 12/11/5 11/12/5
f 11/12/6 12/11/6 14/13/6 13/14/6
f 22/15/7 30/16/7 31/17/7 23/18/7
f 13/14/8 14/13/8 16/19/8 15/20/8
f 15/20/9 16/19/9 2/21/9 1/22/9
f 7/23/10 11/24/10 15/25/10
f 4/3/11 18/26/11 19/27/11 6/5/11
f 10/9/11 21/28/11 22/15/11 12/11/11
f 2/29/11 16/30/11 24/31/11 17/32/11
f 2/2/11 17/33/11 18/26/11 4/3/11
f 6/5/11 19/27/11 20/34/11 8/7/11
f 12/11/11 22/15/11 23/18/11 14/13/11
f 8/7/11 20/34/11 21/28/11 10/9/11
f 16/30/11 14/35/11 23/36/11 24/31/11
f 20/34/12 28/37/12 29/38/12 21/28/12
f 18/26/13 26/39/13 27/40/13 19/27/13
f 24/31/14 23/36/14 31/41/14 32/42/14
f 21/28/15 29/38/15 30/16/15 22/15/15
f 19/27/16 27/40/16 28/37/16 20/34/16
f 17/33/17 25/43/17 26/39/17 18/26/17
f 17/32/18 24/31/18 32/42/18 25/44/18
f 25/43/19 33/45/19 26/39/19
f 25/44/20 32/42/20 33/46/20
f 30/16/21 33/47/21 31/17/21
f 28/37/22 33/48/22 29/38/22
f 26/39/23 33/49/23 27/40/23
f 32/42/24 31/41/24 33/50/24
f 29/38/25 33/51/25 30/16/25
f 27/40/26 33/52/26 28/37/26
f 15/25/10 1/53/10 3/54/10
f 3/54/10 5/55/10 7/23/10
f 7/23/10 9/56/10 11/24/10
f 11/24/10 13/57/10 15/25/10
f 15/25/10 3/54/10 7/23/10
`;
