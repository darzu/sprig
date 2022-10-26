import { mat3, mat4, quat, vec3, vec4 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { Mesh, RawMesh, validateMesh } from "../render/mesh.js";
import { assertDbg } from "../util.js";
import { randNormalPosVec3 } from "../utils-3d.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
  TimberBuilder,
  WoodState,
  setSideQuadIdxs,
  setEndQuadIdxs,
} from "../wood.js";
import { BLACK } from "./assets.js";

const numRibSegs = 8;

export interface HomeShip {
  timberState: WoodState;
  timberMesh: Mesh;
  // TODO(@darzu): how to pass this?
  ribCount: number;
  ribSpace: number;
  ribWidth: number;
  ceilHeight: number;
  floorHeight: number;
  floorLength: number;
  floorWidth: number;
}

export function createHomeShip(): HomeShip {
  const _timberMesh = createEmptyMesh("homeShip");
  // RIBS
  const ribWidth = 0.5;
  const ribDepth = 0.4;
  const builder = createTimberBuilder(_timberMesh);
  builder.width = ribWidth;
  builder.depth = ribDepth;
  const ribCount = 10;
  const ribSpace = 3;

  const rib = makeTimberRib(builder.width, builder.depth);

  for (let i = 0; i < ribCount; i++) {
    let b = cloneBoard(rib)!;
    translateBoard(b, [i * ribSpace, 0, 0]);
    appendBoard(builder.mesh, b);
  }

  mirrorBoard(rib, [0, 0, 1]);

  for (let i = 0; i < ribCount; i++) {
    let b = cloneBoard(rib)!;
    translateBoard(b, [i * ribSpace, 0, 0]);
    appendBoard(builder.mesh, b);

    // mat4.identity(builder.cursor);
    // mat4.translate(builder.cursor, builder.cursor, [i * ribSpace, 0, 0]);
    // appendTimberRib(builder, true);
  }

  // FLOOR
  const floorPlankCount = 7;
  const floorSpace = 1.24;
  const floorLength = ribSpace * (ribCount - 1) + ribWidth * 2.0;
  const floorSegCount = 12;
  const floorHeight = 3.2;
  builder.width = 0.6;
  builder.depth = 0.2;
  for (let i = 0; i < floorPlankCount; i++) {
    mat4.identity(builder.cursor);
    mat4.translate(builder.cursor, builder.cursor, [
      -ribWidth,
      floorHeight - builder.depth,
      (i - (floorPlankCount - 1) * 0.5) * floorSpace + jitter(0.01),
    ]);
    appendTimberFloorPlank(builder, floorLength, floorSegCount);
  }
  const floorWidth = floorPlankCount * floorSpace;
  // CEILING
  const ceilPlankCount = 8;
  const ceilSpace = 1.24;
  const ceilLength = ribSpace * (ribCount - 1) + ribWidth * 2.0;
  const ceilSegCount = 12;
  const ceilHeight = 12;
  for (let i = 0; i < ceilPlankCount; i++) {
    mat4.identity(builder.cursor);
    mat4.translate(builder.cursor, builder.cursor, [
      -ribWidth,
      ceilHeight,
      (i - (ceilPlankCount - 1) * 0.5) * ceilSpace + jitter(0.01),
    ]);
    builder.width = 0.6;
    builder.depth = 0.2;
    appendTimberFloorPlank(builder, ceilLength, ceilSegCount);
  }
  // WALLS
  // TODO(@darzu): keep in sync with rib path
  const wallLength = floorLength;
  const wallSegCount = 8;
  // for (let i = 0; i < 6; i++) {
  // mat4.identity(builder.cursor);
  // mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
  builder.width = 0.45;
  builder.depth = 0.2;
  for (let ccwi = 0; ccwi < 2; ccwi++) {
    const ccw = ccwi === 0;
    const ccwf = ccw ? -1 : 1;
    let xFactor = 0.05;

    const wallOffset: vec3 = [-ribWidth, 0, ribDepth * -ccwf];

    const cursor2 = mat4.create();
    mat4.rotateX(cursor2, cursor2, Math.PI * 0.4 * -ccwf);

    // mat4.copy(builder.cursor, cursor2);
    // mat4.translate(builder.cursor, builder.cursor, wallOffset);
    // appendTimberWallPlank(builder, wallLength, wallSegCount);

    mat4.copy(builder.cursor, cursor2);
    mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
    // mat4.rotateX(builder.cursor, builder.cursor, Math.PI * xFactor * ccwf);
    mat4.translate(builder.cursor, builder.cursor, wallOffset);
    appendTimberWallPlank(builder, wallLength, wallSegCount, -1);

    for (let i = 0; i < numRibSegs; i++) {
      mat4.translate(cursor2, cursor2, [0, 2, 0]);
      mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);

      // plank 1
      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, wallLength, wallSegCount, i);

      // plank 2
      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
      mat4.rotateX(
        builder.cursor,
        builder.cursor,
        Math.PI * xFactor * 1.0 * ccwf
      );
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, wallLength, wallSegCount, i + 0.5);

      mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);
      xFactor = xFactor - 0.005;
    }
    mat4.translate(cursor2, cursor2, [0, 2, 0]);
  }
  // }

  // FRONT AND BACK WALL
  let _floorWidth = floorWidth;
  {
    let wallSegCount = 6;
    let numRibSegs = 6;
    let floorWidth = _floorWidth + 4;
    for (let ccwi = 0; ccwi < 2; ccwi++) {
      const ccw = ccwi === 0;
      const ccwf = ccw ? -1 : 1;
      let xFactor = 0.05;

      const wallOffset: vec3 = [-ribWidth, 0, ribDepth * -ccwf];

      const cursor2 = mat4.create();
      // mat4.rotateX(cursor2, cursor2, Math.PI * 0.4 * -ccwf);
      mat4.rotateY(cursor2, cursor2, Math.PI * 0.5);
      if (ccw) {
        mat4.translate(cursor2, cursor2, [0, 0, floorLength - ribWidth * 2.0]);
      }
      mat4.translate(cursor2, cursor2, [-6, 0, 0]);

      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
      // mat4.rotateX(builder.cursor, builder.cursor, Math.PI * xFactor * ccwf);
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, floorWidth, wallSegCount, -1);

      for (let i = 0; i < numRibSegs; i++) {
        mat4.translate(cursor2, cursor2, [0, 2, 0]);
        // mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);

        // plank 1
        mat4.copy(builder.cursor, cursor2);
        mat4.translate(builder.cursor, builder.cursor, wallOffset);
        appendTimberWallPlank(builder, floorWidth, wallSegCount, i);

        // plank 2
        mat4.copy(builder.cursor, cursor2);
        mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
        // mat4.rotateX(
        //   builder.cursor,
        //   builder.cursor,
        //   Math.PI * xFactor * 1.0 * ccwf
        // );
        mat4.translate(builder.cursor, builder.cursor, wallOffset);
        appendTimberWallPlank(builder, floorWidth, wallSegCount, i + 0.5);

        // mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);
        // xFactor = xFactor - 0.005;
      }
      mat4.translate(cursor2, cursor2, [0, 2, 0]);
    }
  }

  // console.dir(_timberMesh.colors);
  _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
  const timberState = getBoardsFromMesh(_timberMesh);
  verifyUnsharedProvokingForWood(_timberMesh, timberState);
  // unshareProvokingForWood(_timberMesh, timberState);
  // console.log(`before: ` + meshStats(_timberMesh));
  // const timberMesh = normalizeMesh(_timberMesh);
  // console.log(`after: ` + meshStats(timberMesh));
  const timberMesh = _timberMesh as Mesh;
  timberMesh.usesProvoking = true;

  reserveSplinterSpace(timberState, 200);
  validateMesh(timberState.mesh);

  return {
    timberState,
    timberMesh,
    ribCount,
    ribSpace,
    ribWidth,
    ceilHeight,
    floorHeight,
    floorLength,
    floorWidth,
  };
}

export function appendTimberWallPlank(
  b: TimberBuilder,
  length: number,
  numSegs: number,
  plankIdx: number
) {
  const firstQuadIdx = b.mesh.quad.length;

  // mat4.rotateY(b.cursor, b.cursor, Math.PI * 0.5);
  // mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.5);
  mat4.rotateZ(b.cursor, b.cursor, Math.PI * 1.5);

  b.addLoopVerts();
  b.addEndQuad(true);

  const segLen = length / numSegs;

  for (let i = 0; i < numSegs; i++) {
    if (i === 2 && 3 <= plankIdx && plankIdx <= 4) {
      // hole
      b.addEndQuad(false);
      mat4.translate(b.cursor, b.cursor, [0, segLen * 0.55, 0]);
      b.addLoopVerts();
      b.addEndQuad(true);
      mat4.translate(b.cursor, b.cursor, [0, segLen * 0.45, 0]);
    } else {
      // normal
      mat4.translate(b.cursor, b.cursor, [0, segLen, 0]);
      b.addLoopVerts();
      b.addSideQuads();
    }
  }

  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++) {
    const clr = randNormalPosVec3(vec3.create());
    // const clr = vec3.clone(BLACK);
    // const clr = vec3.clone(vec3.ONES);
    // vec3.scale(clr, clr, jitter(0.5));
    vec3.scale(clr, clr, 0.5);
    b.mesh.colors.push(clr);
  }

  // console.dir(b.mesh);

  return b.mesh;
}

export function appendTimberFloorPlank(
  b: TimberBuilder,
  length: number,
  numSegs: number
) {
  const firstQuadIdx = b.mesh.quad.length;

  mat4.rotateY(b.cursor, b.cursor, Math.PI * 0.5);
  mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.5);

  b.addLoopVerts();
  b.addEndQuad(true);

  const segLen = length / numSegs;

  for (let i = 0; i < numSegs; i++) {
    mat4.translate(b.cursor, b.cursor, [0, segLen, 0]);
    b.addLoopVerts();
    b.addSideQuads();
  }

  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  // console.dir(b.mesh);

  return b.mesh;
}

interface BoardNode {
  // TODO(@darzu): we should just use a list..
  prev?: BoardNode;
  next?: BoardNode;

  pos: vec3;
  rot: quat;
  width: number;
  depth: number;
}

// TODO(@darzu): mirror fn

function nodeFromMat4(cursor: mat4, prev?: BoardNode): BoardNode {
  // TODO(@darzu): can width/depth be captured in the mat4?
  const rot = quat.create();
  const pos = vec3.create();
  mat4.getRotation(rot, cursor);
  vec3.transformMat4(pos, pos, cursor);
  // vec3.sub(dir, dir, pos);
  // TODO(@darzu): assert dir is normalized?
  const res: BoardNode = {
    prev,
    pos,
    rot,
    width: prev?.width ?? 1,
    depth: prev?.depth ?? 1,
  };
  if (prev) prev.next = res;
  return res;
}

function cloneBoard(
  curr?: BoardNode,
  newPrev?: BoardNode
): BoardNode | undefined {
  if (!curr) return undefined;
  const res: BoardNode = {
    prev: newPrev,
    pos: vec3.clone(curr.pos),
    rot: quat.clone(curr.rot),
    width: curr.width,
    depth: curr.depth,
  };
  res.next = cloneBoard(curr.next, res);
  return res;
}
function translateBoard(b: BoardNode, tran: vec3) {
  let curr: BoardNode | undefined = b;
  while (curr) {
    vec3.add(curr.pos, curr.pos, tran);
    curr = curr.next;
  }
}
function mirrorBoard(node: BoardNode, planeNorm: vec3) {
  let a = planeNorm[0];
  let b = planeNorm[1];
  let c = planeNorm[2];

  // https://math.stackexchange.com/a/696190/126904
  let mirrorMat3 = mat3.fromValues(
    1 - 2 * a ** 2,
    -2 * a * b,
    -2 * a * c,
    -2 * a * b,
    1 - 2 * b ** 2,
    -2 * b * c,
    -2 * a * c,
    -2 * b * c,
    1 - 2 * c ** 2
  );

  let mirrorNormalQuat = quat.fromValues(a, b, c, 0);

  let curr: BoardNode | undefined = node;
  while (curr) {
    // TODO(@darzu): can we use mat3?
    quat.mul(curr.rot, mirrorNormalQuat, curr.rot);
    quat.mul(curr.rot, curr.rot, mirrorNormalQuat);

    vec3.transformMat3(curr.pos, curr.pos, mirrorMat3);

    curr = curr.next;
  }
}

function makeTimberRib(width: number, depth: number): BoardNode {
  const cursor = mat4.create();

  mat4.rotateX(cursor, cursor, Math.PI * 0.4 * -1);

  const first = nodeFromMat4(cursor);
  first.width = width;
  first.depth = depth;
  let prev = first;

  // b.addLoopVerts();
  // b.addEndQuad(true);
  let xFactor = 0.05;
  for (let i = 0; i < numRibSegs; i++) {
    mat4.translate(cursor, cursor, [0, 2, 0]);
    mat4.rotateX(cursor, cursor, Math.PI * xFactor * 1);
    prev = nodeFromMat4(cursor, prev);
    // b.addLoopVerts();
    // b.addSideQuads();
    mat4.rotateX(cursor, cursor, Math.PI * xFactor * 1);
    // mat4.rotateY(cursor, cursor, Math.PI * -0.003);
    xFactor = xFactor - 0.005;
  }
  mat4.translate(cursor, cursor, [0, 2, 0]);
  // b.addLoopVerts();
  // b.addSideQuads();
  // b.addEndQuad(false);
  prev = nodeFromMat4(cursor, prev);

  // console.dir(b.mesh);

  return first;
}

function appendBoard(mesh: RawMesh, first: BoardNode) {
  // TODO(@darzu): de-duplicate with TimberBuilder
  const firstQuadIdx = mesh.quad.length;
  // const mesh = b.mesh;

  addLoopVerts(first);
  addEndQuad(true);

  let curr = first.next;
  // let last = first;

  while (curr) {
    addLoopVerts(curr);
    addSideQuads();
    // last = curr;
    curr = curr.next;
  }

  addEndQuad(false);

  // TODO(@darzu): streamline
  for (let qi = firstQuadIdx; qi < mesh.quad.length; qi++)
    mesh.colors.push(vec3.clone(BLACK));

  // NOTE: for provoking vertices,
  //  indexes 0, 1 of a loop are for stuff behind (end cap, previous sides)
  //  indexes 2, 3 of a loop are for stuff ahead (next sides, end cap)

  function addSideQuads() {
    const loop2Idx = mesh.pos.length - 4;
    const loop1Idx = mesh.pos.length - 4 - 4;

    const q0 = vec4.create();
    const q1 = vec4.create();
    const q2 = vec4.create();
    const q3 = vec4.create();

    setSideQuadIdxs(loop1Idx, loop2Idx, q0, q1, q2, q3);

    mesh.quad.push(q0, q1, q2, q3);
  }

  function addEndQuad(facingDown: boolean) {
    const lastLoopIdx = mesh.pos.length - 4;
    const q = vec4.create();
    setEndQuadIdxs(lastLoopIdx, q, facingDown);
    mesh.quad.push(q);
  }

  function addLoopVerts(n: BoardNode) {
    // width/depth
    const v0 = vec3.fromValues(n.width, 0, n.depth);
    const v1 = vec3.fromValues(n.width, 0, -n.depth);
    const v2 = vec3.fromValues(-n.width, 0, -n.depth);
    const v3 = vec3.fromValues(-n.width, 0, n.depth);
    // rotate
    vec3.transformQuat(v0, v0, n.rot);
    vec3.transformQuat(v1, v1, n.rot);
    vec3.transformQuat(v2, v2, n.rot);
    vec3.transformQuat(v3, v3, n.rot);
    // translate
    vec3.add(v0, v0, n.pos);
    vec3.add(v1, v1, n.pos);
    vec3.add(v2, v2, n.pos);
    vec3.add(v3, v3, n.pos);
    // append
    mesh.pos.push(v0, v1, v2, v3);
  }
}

export function appendTimberRib(b: TimberBuilder, ccw: boolean) {
  const firstQuadIdx = b.mesh.quad.length;

  const ccwf = ccw ? -1 : 1;

  mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.4 * -ccwf);

  b.addLoopVerts();
  b.addEndQuad(true);
  let xFactor = 0.05;
  for (let i = 0; i < numRibSegs; i++) {
    mat4.translate(b.cursor, b.cursor, [0, 2, 0]);
    mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * ccwf);
    b.addLoopVerts();
    b.addSideQuads();
    mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * ccwf);
    // mat4.rotateY(b.cursor, b.cursor, Math.PI * -0.003);
    xFactor = xFactor - 0.005;
  }
  mat4.translate(b.cursor, b.cursor, [0, 2, 0]);
  b.addLoopVerts();
  b.addSideQuads();
  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  // console.dir(b.mesh);

  return b.mesh;
}
