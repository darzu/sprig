import { V3, TV1, quat } from "../matrix/sprig-matrix.js";
import { meshToHalfEdgePoly, HFace } from "../meshes/half-edge.js";
import { Mesh } from "../meshes/mesh.js";
import { Path } from "../utils/spline.js";
import { assert } from "../utils/util.js";
import { centroid, quatFromUpForward_OLD } from "../utils/utils-3d.js";

// TODO(@darzu): test this more rigorously
export function getPathFrom2DQuadMesh(m: Mesh, perp: V3.InputT): Path {
  const hpoly = meshToHalfEdgePoly(m);

  // find the end face
  let endFaces = hpoly.faces.filter(isEndFace);
  // console.dir(endFaces);
  assert(endFaces.length === 2);
  const endFace =
    endFaces[0].edg.orig.vi < endFaces[1].edg.orig.vi
      ? endFaces[0]
      : endFaces[1];

  // find the end edge
  let endEdge = endFace.edg;
  while (!endEdge.twin.face) endEdge = endEdge.next;
  endEdge = endEdge.next.next;
  // console.log("endEdge");
  // console.dir(endEdge);
  // build the path
  const path: Path = [];
  let e = endEdge;
  while (true) {
    let v0 = m.pos[e.orig.vi];
    let v1 = m.pos[e.next.orig.vi];
    let pos = centroid(v0, v1);
    let dir = V3.cross(V3.sub(v0, v1, TV1), perp, TV1);
    const rot = quatFromUpForward_OLD(quat.mk(), perp, dir);
    path.push({ pos, rot });

    if (!e.face) break;

    e = e.next.next.twin;
  }

  // console.log("path");
  // console.dir(path);
  return path;

  function isEndFace(f: HFace): boolean {
    let neighbor: HFace | undefined = undefined;
    let e = f.edg;
    for (let i = 0; i < 4; i++) {
      if (e.twin.face)
        if (!neighbor) neighbor = e.twin.face;
        else if (e.twin.face !== neighbor) return false;
      e = e.next;
    }
    return true;
  }
}
