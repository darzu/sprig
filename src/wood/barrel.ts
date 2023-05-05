import { calculateNAndBrickWidth } from "../ld53/stone.js";
import { getHalfsizeFromAABB } from "../physics/aabb.js";
import { Mesh, getAABBFromMesh, validateMesh } from "../meshes/mesh.js";
import { V, quat, vec3, mat4 } from "../matrix/sprig-matrix.js";
import {
  WoodState,
  createEmptyMesh,
  TimberBuilder,
  createTimberBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
} from "./wood.js";
import {
  lerpBetween,
  Path,
  appendBoard,
  dbgPathWithGizmos,
  pathNodeFromMat4,
} from "./shipyard.js";

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

export function createBarrelMesh(): [Mesh, WoodState] {
  const _timberMesh = createEmptyMesh("barrel");

  const builder: TimberBuilder = createTimberBuilder(_timberMesh);

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

    appendBoard(builder.mesh, {
      path: path,
      width: plankWidth / 2 - plankGap,
      depth: plankDepth / 2,
    });
    // dbgPathWithGizmos(path);
  }

  // recenter
  // const size = getHalfsizeFromAABB(getAABBFromMesh(_timberMesh));
  // _timberMesh.pos.forEach((v) => vec3.sub(v, size, v));

  _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
  const timberState = getBoardsFromMesh(_timberMesh);
  verifyUnsharedProvokingForWood(_timberMesh, timberState);
  const timberMesh = _timberMesh as Mesh;
  timberMesh.usesProvoking = true;

  reserveSplinterSpace(timberState, 5);
  validateMesh(timberState.mesh);

  return [timberMesh, timberState];
}
