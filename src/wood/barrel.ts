import { calculateNAndBrickWidth } from "../stone/stone.js";
import { getHalfsizeFromAABB } from "../physics/aabb.js";
import { Mesh, getAABBFromMesh, validateMesh } from "../meshes/mesh.js";
import { V, quat, V3, mat4 } from "../matrix/sprig-matrix.js";
import {
  WoodState,
  createEmptyMesh,
  createBoardBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
  BoardBuilder,
} from "./wood-builder.js";
import {
  lerpBetween,
  pathNodeFromMat4,
  createWoodBuilder,
  WoodObj,
} from "./shipyard.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";
import { Path } from "../utils/spline.js";
import { BLACK } from "../meshes/mesh-list.js";

const __tempCursor = mat4.create();
export function createRingPath(
  radius: number,
  approxSpacing: number,
  y = 0
): Path {
  const path: Path = [];
  const [n, spacing] = calculateNAndBrickWidth(radius, approxSpacing);
  const angle = (2 * Math.PI) / n;
  const cursor = mat4.identity(__tempCursor);
  mat4.translate(cursor, [0, y, 0], cursor);
  // mat4.rotateY(cursor, angle / 2, cursor);
  mat4.translate(cursor, [0, 0, radius], cursor);
  // mat4.rotateY(cursor, angle / 2, cursor);
  mat4.rotateY(cursor, -angle / 2, cursor);
  for (let i = 0; i < n; i++) {
    mat4.rotateY(cursor, angle / 2, cursor);
    path.push(pathNodeFromMat4(cursor));
    mat4.rotateY(cursor, angle / 2, cursor);
    mat4.translate(cursor, [spacing, 0, 0], cursor);
  }
  return path;
}

export function createBarrelMesh(): WoodObj {
  const w = createWoodBuilder({ meshName: "barrel" });

  const allG = w.addGroup("all");

  // const ringPath: Path = [];
  // const cursor = mat4.create();
  // for (let i = 0; i < numStaves; i++) {
  //   const pos = mat4.getTranslation(cursor, vec3.create());
  //   const rot = mat4.getRotation(cursor, quat.create());
  //   ringPath.push({ pos, rot });
  //   mat4.translate(cursor, [2, 0, 0], cursor);
  //   mat4.rotateY(cursor, Math.PI / 8, cursor);
  // }
  const plankWidthApprox = 1.2;
  const plankGap = -0.2;
  const radius = 3;
  const [num, plankWidth] = calculateNAndBrickWidth(radius, plankWidthApprox);
  const plankDepth = plankWidth * 0.4;

  const ringPath = createRingPath(radius, plankWidthApprox, 0);

  dbgPathWithGizmos(ringPath);

  const segLen = 2.0;
  const numSeg = 6;
  const initialAngle = Math.PI / 6;
  const angleStep = 2 * (initialAngle / numSeg);

  w.b.setSize(plankWidth / 2 - plankGap, plankDepth / 2);

  const cursor = mat4.create();
  for (let rn of ringPath) {
    let path: Path = [];
    mat4.fromRotationTranslation(rn.rot, rn.pos, cursor);
    mat4.rotateX(cursor, initialAngle, cursor);
    for (let i = 0; i < numSeg; i++) {
      path.push(pathNodeFromMat4(cursor));
      mat4.rotateX(cursor, -angleStep, cursor);
      mat4.translate(cursor, [0, segLen, 0], cursor);
    }

    allG.addBoard(path, BLACK);
    // dbgPathWithGizmos(path);
  }

  // recenter
  // const size = getHalfsizeFromAABB(getAABBFromMesh(_timberMesh));
  // _timberMesh.pos.forEach((v) => V3.sub(v, size, v));
  return w.finish(5);
}
