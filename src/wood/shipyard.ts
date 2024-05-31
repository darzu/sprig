import {
  V3,
  V4,
  quat,
  mat4,
  mat3,
  V,
  tmpStack,
  orthonormalize,
  TV1,
  TV2,
} from "../matrix/sprig-matrix.js";
import { Mesh, RawMesh, transformMesh, validateMesh } from "../meshes/mesh.js";
import { assert } from "../utils/util.js";
import {
  createEmptyMesh,
  createBoardBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
  BoardBuilder,
  WoodState,
  setSideQuadIdxs,
  setEndQuadIdxs,
  BoardState,
  SegState,
  getQuadAreaNorm,
  BoardGroupState,
} from "./wood-builder.js";
import { BLACK, ShipFangsMesh } from "../meshes/mesh-list.js";
import {
  AABB,
  createAABB,
  getSizeFromAABB,
  mergeAABBs,
  transformAABB,
  updateAABBWithPoint,
} from "../physics/aabb.js";
import { ENDESGA16, RainbowEndesga16 } from "../color/palettes.js";
import {
  BezierCubic,
  Path,
  PathNode,
  clonePath,
  createEvenPathFromBezierCurve,
  createPathFromBezier,
  mirrorPath,
  reverseBezier,
  translatePath,
  translatePathAlongNormal,
} from "../utils/spline.js";
import { transformYUpModelIntoZUp } from "../camera/basis.js";
import { getPathFrom2DQuadMesh } from "./util-wood.js";
import { snapToPath } from "../utils/spline.js";
import { snapXToPath } from "../utils/spline.js";
import { createLine } from "../physics/broadphase.js";
import { PI, PId12, PId2, PId4, PId6 } from "../utils/util-no-import.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";
import { createObj } from "../ecs/em-objects.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color/color-ecs.js";
import { PositionDef } from "../physics/transform.js";
import { vec3Dbg } from "../utils/utils-3d.js";

/*
ship state

BOARD:
  bezier curves + num of steps
  raw path
  positions + global rotation
  two end points + rotation + num segments

SHEET:
  keyframe BOARDs
  tween strategy

BOARD OR SHEET + coloring

*/

// TODO(@darzu): use arc-length parameterization to resample splines

const railColor = ENDESGA16.darkBrown;
const keelColor = ENDESGA16.darkBrown;
const ribColor = ENDESGA16.darkBrown;
const plankColor = ENDESGA16.lightBrown;
const transomColor = ENDESGA16.lightBrown;
const floorColor = ENDESGA16.lightBrown;
const topPlankColor = ENDESGA16.darkBrown;
const plankStripeColor = ENDESGA16.blue;
const stripStartIdx = 4;
const stripEndIdx = 6;
const plankStripe2Color = ENDESGA16.white;
const strip2StartIdx = 7;
const strip2EndIdx = 8;

// TODO(@darzu): Bad abstraction. It's annoying to provide all these properties ribCount etc and also
//  not all wood projects will need/have these
export interface WoodObj {
  state: WoodState;
  mesh: Mesh;
}

export interface BoardPath {
  path: Path;

  width: number;
  depth: number;
}

// Note: these were manually placed via the modeler
// TODO(@darzu): Z_UP: visualize these to make sure they're right
export const ld53ShipAABBs: AABB[] = [
  { min: V(-10.6, -2.65, -22.1), max: V(-6.6, 3.65, 18.1) },
  { min: V(7.0, -2.65, -22.1), max: V(11.0, 3.65, 18.1) },
  { min: V(-6.8, -2.65, -30.45), max: V(6.4, 3.65, -25.95) },
  { min: V(5.45, -2.65, -26.15), max: V(7.95, 3.65, -21.65) },
  { min: V(-8.05, -2.65, -26.15), max: V(-5.55, 3.65, -21.65) },
  { min: V(-8.05, -2.65, 17.95), max: V(-4.35, 3.65, 22.45) },
  { min: V(4.25, -2.65, 17.95), max: V(7.95, 3.65, 22.45) },
  { min: V(-6.15, -2.65, 22.25), max: V(5.55, 3.65, 26.15) },
  { min: V(-6.8, -5.95, -26.1), max: V(7.2, 0.35, 22.5) },
].map((aabb) =>
  transformAABB(aabb, mat4.mul(mat4.fromYaw(Math.PI), transformYUpModelIntoZUp))
);

function getLD53KeelPath(): Path {
  // Note: Made w/ game-font !
  // TODO(@darzu): Z_UP: transform these?
  const keelTemplate: Mesh = {
    pos: [
      V(0.58, 0.0, 1.49),
      V(-1.4, 0.0, 1.52),
      V(-1.38, 0.0, 1.74),
      V(0.59, 0.0, 1.71),
      V(-3.73, 0.0, 1.47),
      V(-3.72, 0.0, 1.68),
      V(-4.4, 0.0, 1.22),
      V(-4.64, 0.0, 1.41),
      V(-4.76, 0.0, 0.24),
      V(-5.03, 0.0, 0.3),
      V(-4.81, 0.0, -0.08),
      V(-5.13, 0.0, -0.04),
      V(-5.05, 0.0, -1.12),
      V(-5.38, 0.0, -1.09),
      V(2.36, 0.0, 1.46),
      V(2.28, 0.0, 1.26),
      V(3.63, 0.0, 1.07),
      V(3.5, 0.0, 0.89),
      V(4.51, 0.0, 0.49),
      V(4.32, 0.0, 0.37),
      V(5.15, 0.0, -0.4),
      V(4.93, 0.0, -0.44),
      V(5.29, 0.0, -1.46),
      V(5.06, 0.0, -1.46),
    ],
    tri: [],
    quad: [
      V(0, 1, 2, 3),
      V(4, 5, 2, 1),
      V(6, 7, 5, 4),
      V(8, 9, 7, 6),
      V(10, 11, 9, 8),
      V(12, 13, 11, 10),
      V(14, 15, 0, 3),
      V(16, 17, 15, 14),
      V(18, 19, 17, 16),
      V(20, 21, 19, 18),
      V(22, 23, 21, 20),
    ],
    colors: [
      V(0.49, 0.16, 0.86),
      V(0.48, 0.03, 0.88),
      V(0.47, 0.19, 0.86),
      V(0.53, 0.5, 0.68),
      V(0.34, 0.74, 0.58),
      V(0.62, 0.36, 0.69),
      V(0.93, 0.32, 0.19),
      V(0.57, 0.18, 0.8),
      V(0.67, 0.18, 0.72),
      V(0.19, 0.92, 0.34),
      V(0.42, 0.81, 0.42),
    ],
    surfaceIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    usesProvoking: true,
  };

  // TODO(@darzu): Clean up ship's construction (too many transforms, basis changes, etc)
  // const keelTempAABB = getAABBFromMesh(keelTemplate);
  // console.dir(keelTempAABB);
  let keelTemplate2 = transformMesh(
    keelTemplate,
    mat4.fromRotationTranslationScale(
      quat.rotX(quat.identity(), Math.PI / 2),
      [0, 0, 0],
      // vec3.scale(vec3.negate(keelTempAABB.min), 6),
      [5, 5, 5]
    )
  ) as Mesh;
  // const keelTemplate2 = keelTemplate;

  const keelPath = getPathFrom2DQuadMesh(keelTemplate2, [0, 0, 1]);
  // keelPath = getPathFrom2DQuadMesh(keelTemplate2, [0, 1, 0]);

  // fix keel orientation
  // r->g, g->b, b->r
  fixPathBasis(keelPath, [0, 1, 0], [0, 0, 1], [1, 0, 0]);

  const tempAABB = createAABB();
  keelPath.forEach((p) => updateAABBWithPoint(tempAABB, p.pos));
  translatePath(keelPath, [0, -tempAABB.min[1], 0]);

  // dbgPathWithGizmos(keelPath);

  return keelPath;
}

export function getAABBFromPath(path: Path): AABB {
  const aabb = createAABB();
  path.forEach((p) => updateAABBWithPoint(aabb, p.pos));
  return aabb;
}

export async function loadFangShip(): Promise<WoodObj> {
  const gMesh = await ShipFangsMesh.gameMesh();
  const _mesh = gMesh.mesh;
  const woodState = getBoardsFromMesh(_mesh);
  verifyUnsharedProvokingForWood(_mesh, woodState);
  const mesh = _mesh as Mesh;
  reserveSplinterSpace(woodState, 200);
  validateMesh(woodState.mesh);

  mesh.colors.forEach((c) => V3.copy(c, ENDESGA16.lightBrown));

  return { state: woodState, mesh };
}

export function createWoodenBox(): WoodObj {
  const _stk = tmpStack();

  const w = createWoodBuilder({ meshName: "woodBoxTest" });
  w.b.xLen = 0.4;
  w.b.zLen = 0.2;

  const boardGap = 0.1;

  w.startGroup("wall1");
  const wall1Rot = quat.fromYawPitchRoll(PId4, 0, -PId2);
  createWallFromPath({
    path: createPathFromStartRotLen({
      start: [-20, -20, 0],
      rot: wall1Rot,
      len: 40,
    }),
    right: quat.right(wall1Rot),
    count: 10,
  });

  w.startGroup("wall2");
  const wall2Rot = quat.fromYawPitchRoll(0, PId6, PId12);
  createWallFromPath({
    path: createPathFromStartRotLen({
      start: [10, 0, 5],
      rot: wall2Rot,
      len: 40,
    }),
    right: quat.right(wall2Rot),
    count: 10,
  });

  {
    w.startGroup("rail");
    const railCurve = bezierFromPointsDirectionsInfluence({
      start: [0, -20, 5],
      startDir: V3.fromYawPitch((5 / 16) * PI),
      startInfluence: 24,
      end: [0, 20, 20],
      endDir: V3.fromYawPitch((12 / 16) * PI),
      endInfluence: 12,
    });
    const railPath = createPathFromBezier(railCurve, 16, [1, 0, 0]);
    createWallFromPath({
      path: railPath,
      right: [0, 0, -1],
      count: 10,
    });
  }

  const obj = w.finish(200);

  _stk.pop();

  return obj;

  function createWallFromPath({
    path,
    right,
    count,
  }: {
    path: Path;
    right: V3.InputT;
    count: number;
  }): void {
    for (let i = 0; i < count; i++) {
      const trans = V3.scale(right, (w.b.xLen * 2 + boardGap) * i);
      const ipath = translatePath(clonePath(path), trans);
      if (i % 4 === 0) {
        dbgPathWithGizmos(ipath);
      }
      const color =
        i === 5 || i === 4 ? ENDESGA16.lightBlue : ENDESGA16.lightBrown;
      w.addBoard(ipath, color);
    }
  }
}

function createPathFromStartRotLen({
  start,
  rot,
  len,
}: {
  start: V3.InputT;
  rot: quat;
  len: number;
}): Path {
  const fwd = quat.fwd(rot);
  const end = V3.addScaled(start, fwd, len, V3.mk());
  const length = V3.dist(start, end);
  const segLen = 3.0;
  const numSeg = Math.ceil(length / segLen);
  const positions = lerpBetween(V3.clone(start), end, numSeg - 2);
  assert(positions.length === numSeg);
  const path: Path = positions.map((pos) => ({
    pos,
    rot: quat.clone(rot),
  }));
  return path;
}

function bezierFromPointsDirectionsInfluence({
  start,
  startDir,
  startInfluence,
  end,
  endDir,
  endInfluence,
}: {
  start: V3.InputT;
  startDir: V3.InputT;
  startInfluence: number;
  end: V3.InputT;
  endDir: V3.InputT;
  endInfluence: number;
}): BezierCubic {
  // TODO(@darzu): REFACTOR: bezier from end points + rotation & influence
  let railCurve: BezierCubic;

  const p0 = V3.clone(start);
  const p1 = V3.addScaled(p0, startDir, startInfluence, V3.mk());
  const p3 = V3.clone(end);
  const p2 = V3.addScaled(p3, endDir, endInfluence, V3.mk());

  railCurve = { p0, p1, p2, p3 };
  return railCurve;
}

export function createLD53Ship(): WoodObj {
  const _start = performance.now();

  const _stk = tmpStack();

  const w = createWoodBuilder({ meshName: "homeShip" });

  // KEEL
  const keelWidth = 0.7;
  const keelDepth = 1.2;
  w.b.setSize(keelWidth, keelDepth);

  const keelPath = getLD53KeelPath();
  const keelAABB = getAABBFromPath(keelPath);
  const keelSize = getSizeFromAABB(keelAABB, V3.mk());

  w.startGroup("keel");
  w.addBoard(keelPath, keelColor);

  // RIBS
  const ribWidth = 0.5;
  const ribDepth = 0.4;
  const ribCount = 12;
  // const ribSpace = 3;

  const keelLength = keelSize[0];

  const railHeight = keelAABB.max[1] - 1;
  const prowOverhang = 0.5;
  const prow = V(keelAABB.max[0] + prowOverhang, railHeight, 0);
  const sternOverhang = 1;
  const sternpost = V(keelAABB.min[0] - sternOverhang, railHeight, 0);
  // const transomWidth = 12;
  const transomWidth = 6;
  const railLength = keelLength + prowOverhang + sternOverhang;

  const ribSpace = railLength / (ribCount + 1);
  // const ribSpace = (railLength - 2) / ribCount;

  let railCurve: BezierCubic;
  {
    // const sternAngle = (1 * Math.PI) / 16;
    const sternAngle = (3 * Math.PI) / 16;
    const sternInfluence = 24;
    const prowAngle = (4 * Math.PI) / 16;
    const prowInfluence = 12;
    const p0 = V3.add(sternpost, [0, 0, transomWidth * 0.5], V3.mk());
    const p1 = V3.add(
      p0,
      [
        Math.cos(sternAngle) * sternInfluence,
        0,
        Math.sin(sternAngle) * sternInfluence,
      ],
      V3.mk()
    );
    const p3 = prow;
    const p2 = V3.add(
      p3,
      [
        -Math.cos(prowAngle) * prowInfluence,
        0,
        Math.sin(prowAngle) * prowInfluence,
      ],
      V3.mk()
    );

    railCurve = { p0, p1, p2, p3 };
  }
  const railNodes = ribCount + 2;
  const railPath = createPathFromBezier(
    railCurve,
    railNodes,
    [0, 1, 0] // TODO(@darzu): Z_UP
  );
  // fixPathBasis(railPath, [0, 1, 0], [0, 0, 1], [1, 0, 0]);

  // RIBS
  w.startGroup("ribs");
  w.b.setSize(ribWidth, ribDepth);

  // let ribEnds: V3[] = [];
  let ribPaths: Path[] = [];
  let ribCurves: BezierCubic[] = [];
  for (let i = 0; i < ribCount; i++) {
    // const ribX = i * ribSpace + 2 + keelAABB.min[0];
    const ribX = i * ribSpace + ribSpace + keelAABB.min[0];
    const ribStart = snapXToPath(keelPath, ribX, V3.mk());

    // const p = translatePath(makeRibPath(i), V(i * ribSpace, 0, 0));
    // const weirdP = translatePath(makeRibPathWierd(i), ribStart);
    // if (i === 0) dbgPathWithGizmos(p);

    // TODO(@darzu): compute outboard with bezier curve
    // const outboard = (1 - Math.abs(i - ribCount / 2) / (ribCount / 2)) * 10;

    let ribCurve: BezierCubic;
    {
      const p0 = V3.clone(ribStart);
      const p1 = V3.add(p0, [0, 0, 5], V3.mk());
      // TODO(@darzu): HACKs for the first and last rib
      // if (i === 0) {
      //   p1[1] += 1;
      //   p1[2] -= 4;
      // }
      if (i === ribCount - 1) {
        p1[1] += 1;
        p1[2] -= 4;
      }
      const ribEnd = snapXToPath(railPath, ribStart[0], V3.mk());
      // ribEnds.push(ribEnd);

      const p3 = ribEnd;
      // const p3 = vec3.add(ribStart, [0, keelSize[1], outboard], vec3.create());
      const p2 = V3.add(p3, [0, -5, 2], V3.mk());
      ribCurve = { p0, p1, p2, p3 };

      // if (i === 0) {
      //   console.dir(railPath);
      //   console.log(vec3Dbg(ribStart));
      //   console.log(vec3Dbg(ribEnd));
      //   console.dir(ribCurve);
      // }
    }
    ribCurves.push(ribCurve);

    const numRibSegs = 8;
    const bPath = createPathFromBezier(ribCurve, numRibSegs, [1, 0, 0]);
    // fixPathBasis(bPath, [0, 1, 0], [0, 0, 1], [1, 0, 0]);
    ribPaths.push(bPath);

    // if (i === 0) {
    //   console.log("RIB BEZIER PATH");
    //   // console.log(outboard);
    //   console.dir(ribCurve);
    //   console.dir(bPath);
    //   dbgPathWithGizmos(bPath);
    //   dbgPathWithGizmos(mirrorPath(clonePath(bPath), V(0, 0, 1)));
    // }
    // if (i === 1) dbgPathWithGizmos(weirdP);

    w.addBoard(bPath, ribColor);
    w.addBoard(mirrorPath(clonePath(bPath), V(0, 0, 1)), ribColor);
  }

  // RAIL
  // fix rail spacing to match ribs
  for (let i = 0; i < ribCount; i++) {
    const railIdx = i + 1;
    const ribPath = ribPaths[i];
    const ribEnd = ribPath[ribPath.length - 1];
    // console.log(`${vec3Dbg(railPath[railIdx].pos)} vs ${ribEnd.pos}`);
    V3.copy(railPath[railIdx].pos, ribEnd.pos);
    // railPath[railIdx].pos[0] = ribStarts[i][0];
    // railPath[railIdx].pos[2] = ribStarts[i][2];
  }
  // rail board:
  const mirrorRailPath = mirrorPath(clonePath(railPath), V(0, 0, 1));

  w.startGroup("rail");
  w.b.setSize(ribWidth, ribDepth);
  w.addBoard(railPath, railColor);
  w.addBoard(mirrorRailPath, railColor);

  // REAR RAIL
  {
    const start = railPath[0];
    const end = mirrorRailPath[0];
    const midPos = V3.lerp(start.pos, end.pos, 0.5, V3.mk());
    V3.lerp(midPos, start.pos, 1.2, start.pos);
    V3.lerp(midPos, end.pos, 1.2, end.pos);
    const mid: PathNode = {
      pos: midPos,
      rot: quat.clone(start.rot),
    };
    const path: Path = [start, end];
    for (let n of path) {
      quat.fromEuler(-Math.PI / 2, 0, Math.PI / 2, n.rot);
    }
    w.addBoard(path, railColor);
  }

  // translatePath(railPath, [0, 0, 8]);
  // dbgPathWithGizmos(railPath);

  // PLANK PARAMS
  // const plankCount = 20;
  const plankWidth = 0.4;
  const plankDepth = 0.2;

  // RIBS W/ SLOTS
  const evenRibs: Path[] = [];
  let plankCount = 0;
  let longestRibIdx = 0;
  {
    let ribIdx = 0;
    for (let curve of ribCurves) {
      let topToBottomCurve = reverseBezier(curve);
      const even = createEvenPathFromBezierCurve(
        topToBottomCurve,
        plankWidth * 2.0, // * 0.95,
        [1, 0, 0]
      );
      // even.reverse();
      // translatePath(even, [0, 0, 10]);
      // fixPathBasis(even, [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
      translatePathAlongNormal(even, ribDepth); // + 0.3);
      // fixPathBasis(even, [0, 1, 0], [1, 0, 0], [0, 0, -1]);
      // dbgPathWithGizmos(even);
      // dbgPathWithGizmos([even[0]]);
      evenRibs.push(even);
      if (even.length > plankCount) {
        plankCount = even.length;
        longestRibIdx = ribIdx;
      }
      ribIdx++;
    }
  }
  // console.log(`plankCount: ${plankCount}`);

  // PLANKS (take 2)
  // const centerRibP = ribPaths[longestRibIdx];
  // const centerRibC = ribCurves[longestRibIdx];
  // dbgPathWithGizmos(centerRibP);

  const sternKeelPath = keelPath.reduce(
    (p, n, i) => (i < 4 ? [...p, n] : p),
    [] as Path
  );
  const bowKeelPath = keelPath.reduce(
    (p, n, i) => (i >= keelPath.length - 4 ? [...p, n] : p),
    [] as Path
  );

  let transomPlankNum = evenRibs[0].length;

  w.startGroup("planks");
  w.b.setSize(plankWidth, plankDepth);
  const plankPaths: Path[] = [];
  const plankPathsMirrored: Path[] = [];
  const _temp4 = V3.mk();
  for (let i = 0; i < plankCount; i++) {
    const nodes: Path = evenRibs
      .filter((rib) => rib.length > i)
      .map((rib) => rib[i]);
    if (nodes.length < 2) continue;

    // one extra board to connect to the keel up front
    if (i < 20) {
      const secondToLast = nodes[nodes.length - 1];
      const last: PathNode = {
        pos: V3.clone(secondToLast.pos),
        rot: quat.clone(secondToLast.rot),
      };
      const snapped = snapToPath(bowKeelPath, last.pos[1], 1, _temp4);
      last.pos[0] = snapped[0] + 1;
      last.pos[2] = snapped[2];
      nodes.push(last);
    }

    // extend boards backward for the transom
    if (i < transomPlankNum) {
      const second = nodes[0];
      const third = nodes[1];
      const first: PathNode = {
        pos: V3.clone(second.pos),
        rot: quat.clone(second.rot),
      };
      const diff = V3.sub(second.pos, third.pos, first.pos);
      const scale = (transomPlankNum - 1 - i) / (transomPlankNum - 1) + 0.4;
      // console.log("scale: " + scale);
      V3.scale(diff, scale, diff);
      V3.add(second.pos, diff, first.pos);
      nodes.unshift(first);
    }

    fixPathBasis(nodes, [0, 1, 0], [0, 0, 1], [1, 0, 0]);

    // dbgPathWithGizmos(nodes);

    plankPaths.push(nodes);

    let mirroredPath = mirrorPath(clonePath(nodes), [0, 0, 1]);
    plankPathsMirrored.push(mirroredPath);

    let color = plankColor;
    if (i === 0) color = topPlankColor;
    if (stripStartIdx <= i && i <= stripEndIdx) color = plankStripeColor;
    if (strip2StartIdx <= i && i <= strip2EndIdx) color = plankStripe2Color;

    w.addBoard(nodes, color);
    w.addBoard(mirroredPath, color);
  }

  // TRANSOM
  w.startGroup("transom");
  w.b.setSize(plankWidth, plankDepth);
  for (let i = 0; i < transomPlankNum; i++) {
    const start = plankPaths[i][0];
    const end = plankPathsMirrored[i][0];
    const length = V3.dist(start.pos, end.pos);
    const transomSegLen = 3.0;
    const numDesired = Math.max(Math.ceil(length / transomSegLen), 2);

    let positions = lerpBetween(start.pos, end.pos, numDesired - 2);
    // console.log(numDesired);
    // console.log(positions.length);
    assert(positions.length === numDesired);
    let path: Path = positions.map((pos) => ({
      pos,
      rot: quat.clone(start.rot),
    }));

    // if (i == 2)
    // dbgPathWithGizmos(path);
    for (let n of path) {
      quat.fromEuler(-Math.PI / 2, 0, Math.PI / 2, n.rot);
      quat.rotY(n.rot, -Math.PI / 16, n.rot);
    }
    let color = transomColor;
    if (i === 0) color = topPlankColor;
    if (stripStartIdx <= i && i <= stripEndIdx) color = plankStripeColor;
    if (strip2StartIdx <= i && i <= strip2EndIdx) color = plankStripe2Color;
    w.addBoard(path, color);
  }

  // FLOOR
  w.startGroup("floor");
  let floorPlankIdx = 4;
  const floorBound1 = plankPaths[floorPlankIdx];
  const floorBound2 = plankPathsMirrored[floorPlankIdx];
  let floorHeight = floorBound1[0].pos[1];
  let floorWidth = 0;
  let midIdx = 0;
  for (let i = 0; i < floorBound1.length; i++) {
    const dist = V3.dist(floorBound1[i].pos, floorBound2[i].pos);
    if (dist > floorWidth) {
      floorWidth = dist;
      midIdx = i;
    }
  }
  let floorLength = -1;
  {
    const boundFore = floorBound1.reduce(
      (p, n, i) => (i >= midIdx ? [...p, n] : p),
      [] as Path
    );
    boundFore.reverse();
    const boundAft = floorBound1.reduce(
      (p, n, i) => (i < midIdx ? [...p, n] : p),
      [] as Path
    );
    // console.log("fore and aft:");
    // console.dir(boundFore);
    // console.dir(boundAft);
    const floorBoardWidth = 1.2;
    const floorBoardGap = 0.05;
    w.b.setSize(floorBoardWidth / 2 - floorBoardGap, plankDepth);
    // console.log(`ribSpace: ${ribSpace}`);
    const floorSegLength = 4.0;
    const halfNumFloorBoards = Math.floor(floorWidth / floorBoardWidth / 2);
    const __t1 = V3.mk();
    for (let i = 0; i < halfNumFloorBoards; i++) {
      const z = i * floorBoardWidth + floorBoardWidth * 0.5;
      const fore = V(0, floorHeight, z);
      const foreSnap = snapToPath(boundFore, fore[2], 2, __t1);
      // console.log(`foreSnap: ${vec3Dbg(foreSnap)}`);
      fore[0] = foreSnap[0] - 1.0;
      const aft = V(0, floorHeight, z);
      const aftSnap = snapToPath(boundAft, aft[2], 2, __t1);
      aft[0] = aftSnap[0] + 1.0;
      // const positions = [aft, fore];
      const length = fore[0] - aft[0];
      if (i === 0) floorLength = length;
      const numDesired = Math.ceil(length / floorSegLength);
      const positions = lerpBetween(aft, fore, numDesired - 2);
      // TODO(@darzu): LERP!
      const path: Path = positions.map((pos) => ({
        pos,
        rot: quat.fromEuler(0, -Math.PI / 2, -Math.PI / 2),
      }));
      // dbgPathWithGizmos(path);
      let mirroredPath = mirrorPath(clonePath(path), [0, 0, 1]);
      w.addBoard(path, floorColor);
      w.addBoard(mirroredPath, floorColor);
      // break; // TODO(@darzu):
    }
  }

  const ceilHeight = floorHeight + 15; // TODO(@darzu): OLD

  const _meshDone = performance.now();
  console.log(
    `createLD53Ship, start->mesh: ${(_meshDone - _start).toFixed(1)}ms`
  );

  const shipObj = w.finish(200);

  // ROTATE WHOLE THING (YIKES)
  // TODO(@darzu): fix up ship construction
  if (false) {
    // TODO(@darzu): Z_UP: basis change. inline this above?
    shipObj.mesh.pos.forEach((v) => V3.tMat4(v, transformYUpModelIntoZUp, v));

    // change so ship faces +y
    const rotate = quat.fromYawPitchRoll(-Math.PI / 2, 0, 0);
    shipObj.mesh.pos.forEach((v) => {
      V3.tQuat(v, rotate, v);
    });

    // TODO(@darzu): CLEAN UP: currently the result is the ship fwd is y-; We should fix everything to have y+ is fwd
  }

  // lower the whole ship so it's main deck is at 0 height
  const DECK_AT_ZERO = false;
  if (DECK_AT_ZERO)
    shipObj.mesh.pos.forEach((v) => {
      V3.add(v, [0, 0, -floorHeight], v);
    });

  _stk.pop();

  const _end = performance.now();
  console.log(
    `createLD53Ship, mesh->WoodState: ${(_end - _meshDone).toFixed(1)}ms`
  );
  console.log(`createLD53Ship, total: ${(_end - _start).toFixed(1)}ms`);

  return shipObj;
}

export function pathNodeFromMat4(cursor: mat4): PathNode {
  const rot = mat4.getRotation(cursor, quat.mk());
  const pos = mat4.getTranslation(cursor, V3.mk());
  return {
    pos,
    rot,
  };
}

// TODO(@darzu): PERF. creates a lot of vecs
export function lerpBetween(start: V3, end: V3, numNewMid: number): V3[] {
  const positions: V3[] = [];
  positions.push(start);
  for (let i = 0; i < numNewMid; i++) {
    const t = (i + 1) / (numNewMid + 2 - 1);
    const pos = V3.lerp(start, end, t, V3.mk());
    positions.push(pos);
  }
  positions.push(end);
  return positions;
}

function cloneBoard(board: BoardPath): BoardPath {
  return {
    ...board,
    path: clonePath(board.path),
  };
}

// TODO(@darzu): use everywhere
interface WoodBuilder {
  readonly props: WoodBuilderProps;

  b: BoardBuilder;
  state: WoodState;

  startGroup(name: string): void;
  addBoard(path: Path, color: V3.InputT): void;
  finish(maxNumSplinters: number): WoodObj;

  // TODO(@darzu): finish w/ reserve splinter state etc
}

interface WoodBuilderProps {
  meshName: string;
}

// TODO(@darzu): just for debugging?
export function colorGroup(
  mesh: RawMesh,
  group: BoardGroupState,
  color: V3.InputT
) {
  group.boards.forEach((b) =>
    b.segments.forEach((s) => {
      for (let qi of s.quadSideIdxs) V3.copy(mesh.colors[qi], color);
      if (s.quadFrontIdx) V3.copy(mesh.colors[s.quadFrontIdx], color);
      if (s.quadBackIdx) V3.copy(mesh.colors[s.quadBackIdx], color);
    })
  );
}
export function rainbowColorWood(obj: WoodObj) {
  obj.state.groups.forEach((g, i) => {
    const color = RainbowEndesga16[i % (RainbowEndesga16.length - 1)];
    colorGroup(obj.mesh, g, color);
  });
}

export function createWoodBuilder(props: WoodBuilderProps): WoodBuilder {
  const mesh = createEmptyMesh(props.meshName);

  mesh.pos.push(V(0, 0, 0)); // add 1 degenerate vert for degenerate quads (e.g. [0,0,0,0]) to use

  const b = createBoardBuilder(mesh);

  let currentGroup: BoardGroupState | undefined = undefined;

  const state: WoodState = {
    mesh,
    groups: [],
  };

  let finished = false;

  const w: WoodBuilder = {
    b,
    props,
    state,
    startGroup,
    addBoard,
    finish,
  };

  return w;

  function finish(maxNumSplinters: number): WoodObj {
    assert(!finished);
    finished = true;

    mesh.surfaceIds = mesh.colors.map((_, i) => i);
    verifyUnsharedProvokingForWood(mesh, state);
    const finalMesh = mesh as Mesh;
    finalMesh.usesProvoking = true;
    reserveSplinterSpace(state, maxNumSplinters);
    validateMesh(state.mesh);

    return {
      state,
      mesh: finalMesh,
    };
  }

  function startGroup(name: string) {
    currentGroup = {
      name,
      boards: [],
    };
    state.groups.push(currentGroup);
  }

  function addBoard(path: Path, color: V3.InputT) {
    assert(currentGroup, `Must call startGroup() before addBoard()`);
    const state = appendBoard(
      mesh,
      {
        width: b.xLen,
        depth: b.zLen,
        path,
      },
      color
    );
    currentGroup.boards.push(state);
  }
}

// TODO(@darzu): de-export, merge into addBoard, use BoardBuilder
export function appendBoard(
  mesh: RawMesh,
  board: BoardPath,
  color: V3.InputT = BLACK
): BoardState {
  // TODO(@darzu): PERF. Instead of creating V3s, we should be indexing into a f32 array
  // TODO(@darzu): build up wood state along with the mesh!
  const bState: BoardState = {
    segments: [],
    localAABB: createAABB(),
  };

  assert(board.path.length >= 2, `invalid board path!`);
  // TODO(@darzu): de-duplicate with TimberBuilder
  const firstQuadIdx = mesh.quad.length;
  // const mesh = b.mesh;

  // console.log(`board width:${board.width},depth:${board.depth}`);

  board.path.forEach((p, i) => {
    // tracking
    const isFirst = i === 0;
    const isFirstSeg = i === 1;
    const isLast = i === board.path.length - 1;
    const firstQIdx = mesh.quad.length;

    // add verts & quads
    addLoopVerts(p);
    if (isFirst) addEndQuad(true);
    else addSideQuads();
    if (isLast) addEndQuad(false);

    // create states
    if (!isFirst) {
      // NOTE: must match setSideQuadIdxs
      const loop2Idx = mesh.pos.length - 4;
      const loop1Idx = mesh.pos.length - 4 - 4;
      const fwdLoop = V(loop2Idx + 0, loop2Idx + 1, loop2Idx + 2, loop2Idx + 3);
      const aftLoop = V(loop1Idx + 0, loop1Idx + 1, loop1Idx + 2, loop1Idx + 3);
      const segAABB = createAABB();
      for (let i = aftLoop[0]; i <= fwdLoop[3]; i++)
        updateAABBWithPoint(segAABB, mesh.pos[i]);
      mergeAABBs(bState.localAABB, bState.localAABB, segAABB);
      const firstSideQIdx = firstQIdx;
      const quadSideIdxs = V(
        firstSideQIdx + 0,
        firstSideQIdx + 1,
        firstSideQIdx + 2,
        firstSideQIdx + 3
      );
      const quadBackIdx = isFirstSeg ? firstQIdx - 1 : undefined;
      const quadFrontIdx = isLast ? firstQIdx + 4 : undefined;

      const midLine = createLine(board.path[i - 1].pos, board.path[i].pos);

      const upAft = quat.up(board.path[i - 1].rot, TV1);
      const upFwd = quat.up(board.path[i].rot, TV2);
      const up = V3.avg(upAft, upFwd, TV1);

      const midRotation = quat.fromForwardAndUpish(
        midLine.ray.dir,
        up,
        quat.mk()
      );

      const sState: SegState = {
        localAABB: segAABB,
        midLine,
        // TODO(@darzu): IMPL mid board rotation, aligned with the segment
        midRotation,
        // areaNorms: [
        //   getQuadAreaNorm(mesh, quadSideIdxs[0]),
        //   getQuadAreaNorm(mesh, quadSideIdxs[1]),
        //   getQuadAreaNorm(mesh, quadSideIdxs[2]),
        //   getQuadAreaNorm(mesh, quadSideIdxs[3]),
        // ],
        xWidth: board.width,
        zDepth: board.depth,
        aftLoop,
        fwdLoop,
        quadSideIdxs,
        quadFrontIdx,
        quadBackIdx,
      };
      bState.segments.push(sState);
    }
  });

  // TODO(@darzu): streamline
  assert(mesh.colors.length === firstQuadIdx);
  for (let qi = firstQuadIdx; qi < mesh.quad.length; qi++)
    mesh.colors.push(V3.clone(color));
  assert(mesh.colors.length === mesh.quad.length);

  // NOTE: for provoking vertices,
  //  indexes 0, 1 of a loop are for stuff behind (end cap, previous sides)
  //  indexes 2, 3 of a loop are for stuff ahead (next sides, end cap)

  return bState;

  function addSideQuads() {
    const loop2Idx = mesh.pos.length - 4;
    const loop1Idx = mesh.pos.length - 4 - 4;

    const q0 = V4.mk();
    const q1 = V4.mk();
    const q2 = V4.mk();
    const q3 = V4.mk();

    setSideQuadIdxs(loop1Idx, loop2Idx, q0, q1, q2, q3);

    mesh.quad.push(q0, q1, q2, q3);
  }

  function addEndQuad(facingNegY: boolean) {
    const lastLoopIdx = mesh.pos.length - 4;
    const q = V4.mk();
    setEndQuadIdxs(lastLoopIdx, q, facingNegY);
    mesh.quad.push(q);
  }

  function addLoopVerts(n: PathNode) {
    // forward is y-axis, width is x-axis, depth is z-axis
    const v0 = V(board.width, 0, board.depth);
    const v1 = V(board.width, 0, -board.depth);
    const v2 = V(-board.width, 0, -board.depth);
    const v3 = V(-board.width, 0, board.depth);
    // rotate
    V3.tQuat(v0, n.rot, v0);
    V3.tQuat(v1, n.rot, v1);
    V3.tQuat(v2, n.rot, v2);
    V3.tQuat(v3, n.rot, v3);
    // translate
    V3.add(v0, n.pos, v0);
    V3.add(v1, n.pos, v1);
    V3.add(v2, n.pos, v2);
    V3.add(v3, n.pos, v3);
    // append
    mesh.pos.push(v0, v1, v2, v3);
  }
}

// TODO(@darzu): perhaps all uses of fixPathBasis are bad?
export function fixPathBasis(
  path: Path,
  newX: V3.InputT,
  newY: V3.InputT,
  newZ: V3.InputT
) {
  // TODO(@darzu): PERF. Must be a better way to do this...
  const fixRot = quat.fromMat3(
    mat3.fromValues(
      newX[0],
      newX[1],
      newX[2],
      newY[0],
      newY[1],
      newY[2],
      newZ[0],
      newZ[1],
      newZ[2]
    )
  );
  path.forEach((p) => quat.mul(p.rot, fixRot, p.rot));
}
