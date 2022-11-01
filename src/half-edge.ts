import { DBG_ASSERT } from "./flags.js";
import { BLACK } from "./game/assets.js";
import { vec3 } from "./gl-matrix.js";
import { hexAvg } from "./hex.js";
import { RawMesh } from "./render/mesh.js";
import { assertDbg, edges, range } from "./util.js";

// https://jerryyin.info/geometry-processing-algorithms/half-edge/

export interface HEdge {
  next: HEdge;
  prev: HEdge;
  twin: HEdge;
  orig: HVert;
  face?: HFace;
}
export interface HVert {
  vi: number;
  edg: HEdge;
  // TODO(@darzu): use "vi" so we can share and edit in vert and quad list directly?
}
export interface HFace {
  fi: number; // if < quad.length, qi else ti = fi - quad.length
  edg: HEdge;
}
export interface HPoly {
  mesh: RawMesh;
  verts: HVert[];
  faces: HFace[];
  edges: HEdge[];
}

export function meshToHalfEdgePoly(m: RawMesh): HPoly {
  const numFaces = m.tri.length + m.quad.length;
  const hpoly: HPoly = {
    mesh: m,
    verts: range(m.pos.length).map(
      (vi) =>
        ({
          vi,
          edg: null,
        } as unknown as HVert)
    ),
    faces: range(numFaces).map(
      (fi) =>
        ({
          fi,
          edg: null,
        } as unknown as HFace)
    ),
    edges: range(m.tri.length * 3 + m.quad.length * 4).map(
      (ei) =>
        ({
          next: null,
          prev: null,
          twin: null,
          orig: null,
          face: null,
        } as unknown as HEdge)
    ),
  };

  // add face data
  // NOTE: this doesn't set twins
  for (let qi = 0; qi < m.quad.length; qi++) addQuad(qi);
  for (let ti = 0; ti < m.tri.length; ti++) addTri(ti);

  // find edges by origin
  const hedgesByOrig: Map<number, HEdge[]> = new Map();
  for (let e of hpoly.edges) {
    if (!hedgesByOrig.has(e.orig.vi)) hedgesByOrig.set(e.orig.vi, [e]);
    else hedgesByOrig.get(e.orig.vi)!.push(e);
  }

  // add twin data
  let outerHEdgesByOrig: Map<number, HEdge> = new Map();
  for (let e of hpoly.edges) {
    if (e.twin) continue;
    let twinCanidates = hedgesByOrig.get(e.next.orig.vi)!;
    let twin = twinCanidates.find((t) => t.next.orig.vi === e.orig.vi);
    if (!twin) {
      // outside the surface, so create a new twin HEdge
      // NOTE: we need to connect up these outside surface HEdges later
      twin = {
        next: null,
        prev: null,
        twin: e,
        orig: e.next.orig,
        face: undefined,
      } as unknown as HEdge;
      if (DBG_ASSERT && outerHEdgesByOrig.has(twin.orig.vi)) {
        console.dir(hpoly);
        console.dir(hedgesByOrig);
        console.dir(outerHEdgesByOrig);
        assertDbg(
          false,
          `outer already has: ${twin.orig.vi}; twin of: ${e.orig.vi}->${e.next.orig.vi}`
        );
      }
      outerHEdgesByOrig.set(twin.orig.vi, twin);
    }
    e.twin = twin;
    twin.twin = e;
  }

  // patch up outside HEdges
  for (let e of outerHEdgesByOrig.values()) {
    let next = outerHEdgesByOrig.get(e.twin.orig.vi);
    assertDbg(!!next);
    e.next = next;
    next.prev = e;
  }

  if (DBG_ASSERT) {
    // verify
    // console.dir(hpoly);
    for (let e of hpoly.edges) {
      assertDbg(e.next);
      assertDbg(e.prev);
      assertDbg(e.orig);
      assertDbg(e.twin);
    }
    for (let v of hpoly.verts) {
      assertDbg(v.edg);
      assertDbg(v.vi !== undefined);
    }
    for (let f of hpoly.faces) {
      assertDbg(f.edg);
      assertDbg(f.fi !== undefined);
    }
  }

  return hpoly;

  function addQuad(qi: number) {
    // NOTE: HalfEdge.twin isn't set here!
    // collect references
    const hf = hpoly.faces[qi];
    const vis = m.quad[qi];
    const v0 = hpoly.verts[vis[0]];
    const v1 = hpoly.verts[vis[1]];
    const v2 = hpoly.verts[vis[2]];
    const v3 = hpoly.verts[vis[3]];
    const ei0 = qi * 4;
    const e0 = hpoly.edges[ei0 + 0];
    const e1 = hpoly.edges[ei0 + 1];
    const e2 = hpoly.edges[ei0 + 2];
    const e3 = hpoly.edges[ei0 + 3];

    // patch up face
    hf.edg = e0;

    // patch up verts
    v0.edg = e0;
    v0.vi = vis[0];
    v1.edg = e1;
    v1.vi = vis[1];
    v2.edg = e2;
    v2.vi = vis[2];
    v3.edg = e3;
    v3.vi = vis[3];

    // patch up edges
    e0.face = hf;
    e0.orig = v0;
    e0.next = e1;
    e0.prev = e3;

    e1.face = hf;
    e1.orig = v1;
    e1.next = e2;
    e1.prev = e0;

    e2.face = hf;
    e2.orig = v2;
    e2.next = e3;
    e2.prev = e1;

    e3.face = hf;
    e3.orig = v3;
    e3.next = e0;
    e3.prev = e2;
  }

  function addTri(ti: number) {
    // NOTE: HalfEdge.twin isn't set here!
    // collect references
    const hf = hpoly.faces[m.quad.length + ti];
    const vis = m.tri[ti];
    const v0 = hpoly.verts[vis[0]];
    const v1 = hpoly.verts[vis[1]];
    const v2 = hpoly.verts[vis[2]];
    const ei0 = m.quad.length * 4 + ti * 3;
    const e0 = hpoly.edges[ei0 + 0];
    const e1 = hpoly.edges[ei0 + 1];
    const e2 = hpoly.edges[ei0 + 2];

    // patch up face
    hf.edg = e0;

    // patch up verts
    v0.edg = e0;
    v0.vi = vis[0];
    v1.edg = e1;
    v1.vi = vis[1];
    v2.edg = e2;
    v2.vi = vis[2];

    // patch up edges
    e0.face = hf;
    e0.orig = v0;
    e0.next = e1;
    e0.prev = e2;

    e1.face = hf;
    e1.orig = v1;
    e1.next = e2;
    e1.prev = e0;

    e2.face = hf;
    e2.orig = v2;
    e2.next = e0;
    e2.prev = e1;
  }
}
