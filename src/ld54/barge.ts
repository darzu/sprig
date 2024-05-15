import { transformYUpModelIntoZUp } from "../camera/basis.js";
import { ENDESGA16 } from "../color/palettes.js";
import { mat4, quat, V3 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import {
  createEmptyRawMesh,
  transformMesh,
  Mesh,
  validateMesh,
} from "../meshes/mesh.js";
import {
  createAABB,
  updateAABBWithPoint,
  getSizeFromAABB,
} from "../physics/aabb.js";
import {
  Path,
  translatePath,
  BezierCubic,
  createPathFromBezier,
  mirrorPath,
  clonePath,
  reverseBezier,
  createEvenPathFromBezierCurve,
  translatePathAlongNormal,
  PathNode,
} from "../utils/spline.js";
import { assert } from "../utils/util.js";
import {
  WoodShip,
  fixPathBasis,
  appendBoard,
  lerpBetween,
} from "../wood/shipyard.js";
import { snapXToPath } from "../utils/spline.js";
import { snapToPath } from "../utils/spline.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";
import { getPathFrom2DQuadMesh } from "../wood/util-wood.js";
import {
  TimberBuilder,
  createTimberBuilder,
  getBoardsFromMesh,
  verifyUnsharedProvokingForWood,
  reserveSplinterSpace,
  WoodState,
} from "../wood/wood.js";

// TODO(@darzu): HUGE HACK. De-dupe w/ other ship

const railColor = ENDESGA16.darkBrown;
const keelColor = ENDESGA16.darkBrown;
const ribColor = ENDESGA16.darkBrown;
const plankColor = ENDESGA16.lightBrown;
const transomColor = ENDESGA16.lightBrown;
const floorColor = ENDESGA16.lightBrown;
const topPlankColor = ENDESGA16.darkBrown;
// const plankStripeColor = ENDESGA16.darkGreen;
const plankStripeColor = ENDESGA16.midBrown;
// const stripStartIdx = 1;
// const stripEndIdx = 5;
// const stripStartIdx = 16;
// const stripEndIdx = 20;
const stripStartIdx = 6;
const stripEndIdx = 10;
// const plankStripe2Color = ENDESGA16.lightGreen;
const plankStripe2Color = ENDESGA16.midBrown;
const strip2StartIdx = 19;
const strip2EndIdx = 20;
// const strip2StartIdx = 6;
// const strip2EndIdx = 20;

const FALSE = ("this" as string) === "that";

// Note: Made w/ game-font !
// const keelTemplate: Mesh = {
//   pos: [
//     V(-2.25, 0.0, -1.08),
//     V(-3.68, 0.0, -1.44),
//     V(-4.07, 0.0, -1.14),
//     V(-2.25, 0.0, -0.69),
//     V(0.06, 0.0, -0.57),
//     V(0.03, 0.0, -0.92),
//     V(2.36, 0.0, -0.57),
//     V(2.18, 0.0, -0.9),
//     V(3.56, 0.0, -1.44),
//     V(3.27, 0.0, -1.63),
//     V(3.92, 0.0, -2.88),
//     V(3.53, 0.0, -2.83),
//     V(-3.96, 0.0, -2.6),
//     V(-4.43, 0.0, -2.53),
//   ],
//   tri: [],
//   quad: [
//     V(0, 1, 2, 3),
//     V(4, 5, 0, 3),
//     V(6, 7, 5, 4),
//     V(8, 9, 7, 6),
//     V(10, 11, 9, 8),
//     V(12, 13, 2, 1),
//   ],
//   colors: [
//     V(0.42, 0.49, 0.76),
//     V(0.53, 0.6, 0.6),
//     V(0.44, 0.83, 0.34),
//     V(0.37, 0.79, 0.49),
//     V(0.44, 0.68, 0.59),
//     V(0.97, 0.11, 0.21),
//   ],
//   surfaceIds: [1, 2, 3, 4, 5, 6],
//   usesProvoking: true,
// };
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

export interface SpaceBarge {
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

export function createSpaceBarge(): SpaceBarge {
  const _start = performance.now();
  const _timberMesh = createEmptyRawMesh("homeShip");

  const builder: TimberBuilder = createTimberBuilder(_timberMesh);

  // KEEL
  // TODO(@darzu): IMPL keel!
  const keelWidth = 1.4;
  const keelDepth = 1.2;
  builder.width = keelWidth;
  builder.depth = keelDepth;

  let keelPath: Path;
  {
    keelTemplate.pos.forEach((p) => {
      V3.mul(p, [1, 1, 0.5], p);
    });

    // const keelTempAABB = getAABBFromMesh(keelTemplate);
    // console.dir(keelTempAABB);
    let keelTemplate2 = transformMesh(
      keelTemplate,
      mat4.fromRotationTranslationScale(
        quat.rotX(quat.identity(), Math.PI / 2),
        [0, 0, 0],
        // vec3.scale(vec3.negate(keelTempAABB.min), 6),
        // [5, 5, 5]
        [5, 5, 5]
      )
    ) as Mesh;

    keelPath = getPathFrom2DQuadMesh(keelTemplate2, [0, 0, 1]);

    // fix keel orientation
    // r->g, g->b, b->r
    fixPathBasis(keelPath, [0, 1, 0], [0, 0, 1], [1, 0, 0]);

    const tempAABB = createAABB();
    keelPath.forEach((p) => updateAABBWithPoint(tempAABB, p.pos));
    translatePath(keelPath, [0, -tempAABB.min[1], 0]);

    // dbgPathWithGizmos(keelPath);
  }

  const keelAABB = createAABB();
  keelPath.forEach((p) => updateAABBWithPoint(keelAABB, p.pos));
  const keelSize = getSizeFromAABB(keelAABB, V3.mk());

  appendBoard(
    builder.mesh,
    {
      path: keelPath,
      width: keelWidth,
      depth: keelDepth,
    },
    keelColor
  );

  // RIBS
  const ribWidth = 0.3;
  const ribDepth = 0.4;
  builder.width = ribWidth;
  builder.depth = ribDepth;
  const ribCount = 16;
  // const ribSpace = 3;

  const keelLength = keelSize[0];

  const railHeight = keelAABB.max[1] - 1;
  const prowOverhang = 1.0;
  const prow = V(keelAABB.max[0] + prowOverhang, railHeight, 0);
  const sternOverhang = 1;
  const sternpost = V(keelAABB.min[0] - sternOverhang, railHeight, 0);
  // const transomWidth = 12;
  const transomWidth = 12;
  const railLength = keelLength + prowOverhang + sternOverhang;

  const ribSpace = railLength / (ribCount + 1);
  // const ribSpace = (railLength - 2) / ribCount;

  let railCurve: BezierCubic;
  {
    // const sternAngle = (1 * Math.PI) / 16;
    const sternAngle = (3 * Math.PI) / 16;
    const sternInfluence = 24;
    const prowAngle = (4 * Math.PI) / 16;
    const prowInfluence = 24;
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
  const railPath = createPathFromBezier(railCurve, railNodes, [0, 1, 0]);
  // fixPathBasis(railPath, [0, 1, 0], [0, 0, 1], [1, 0, 0]);

  // let ribEnds: V3[] = [];
  let ribPaths: Path[] = [];
  let ribCurves: BezierCubic[] = [];
  if (FALSE || true) {
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

      appendBoard(
        builder.mesh,
        {
          path: bPath,
          width: ribWidth,
          depth: ribDepth,
        },
        ribColor
      );

      appendBoard(
        builder.mesh,
        {
          path: mirrorPath(clonePath(bPath), V(0, 0, 1)),
          width: ribWidth,
          depth: ribDepth,
        },
        ribColor
      );
    }
  }

  // RAIL
  let mirrorRailPath: Path = []; // set later
  if (FALSE || true) {
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
    mirrorRailPath = mirrorPath(clonePath(railPath), V(0, 0, 1));
    appendBoard(
      builder.mesh,
      {
        path: railPath,
        width: ribWidth,
        depth: ribDepth,
      },
      railColor
    );
    appendBoard(
      builder.mesh,
      {
        path: mirrorRailPath,
        width: ribWidth,
        depth: ribDepth,
      },
      railColor
    );
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
  if (FALSE || true) {
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
  }

  // PLANKS (take 2)
  const plankPaths: Path[] = [];
  const plankPathsMirrored: Path[] = [];
  let transomPlankNum = 2;
  if (FALSE || true) {
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

    transomPlankNum = evenRibs[0].length;

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

      plankPaths.push(nodes);

      let mirroredPath = mirrorPath(clonePath(nodes), [0, 0, 1]);
      plankPathsMirrored.push(mirroredPath);

      let color = plankColor;
      if (i === 0) color = topPlankColor;
      if (stripStartIdx <= i && i <= stripEndIdx) color = plankStripeColor;
      if (strip2StartIdx <= i && i <= strip2EndIdx) color = plankStripe2Color;

      appendBoard(
        builder.mesh,
        {
          path: nodes,
          width: plankWidth,
          depth: plankDepth,
        },
        color
      );
      appendBoard(
        builder.mesh,
        {
          path: mirroredPath,
          width: plankWidth,
          depth: plankDepth,
        },
        color
      );
    }
  }

  // TRANSOM
  if (FALSE || true) {
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
        // TODO(@darzu): Z_UP rotateY
        quat.rotY(n.rot, -Math.PI / 16, n.rot);
      }
      let color = transomColor;
      if (i === 0) color = topPlankColor;
      if (stripStartIdx <= i && i <= stripEndIdx) color = plankStripeColor;
      if (strip2StartIdx <= i && i <= strip2EndIdx) color = plankStripe2Color;
      appendBoard(
        builder.mesh,
        {
          path: path,
          width: plankWidth,
          depth: plankDepth,
        },
        color
      );
    }
  }

  // REAR RAIL
  if (FALSE || true) {
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
    appendBoard(
      builder.mesh,
      {
        path: path,
        width: ribWidth,
        depth: ribDepth,
      },
      railColor
    );
  }

  let floorPlankIdx = 4;
  let floorHeight = 0; // set later
  let floorWidth = 0;
  let floorLength = -1;
  if (FALSE) {
    // FLOOR
    const floorBound1 = plankPaths[floorPlankIdx];
    const floorBound2 = plankPathsMirrored[floorPlankIdx];
    floorHeight = floorBound1[0].pos[1];

    let midIdx = 0;
    for (let i = 0; i < floorBound1.length; i++) {
      const dist = V3.dist(floorBound1[i].pos, floorBound2[i].pos);
      if (dist > floorWidth) {
        floorWidth = dist;
        midIdx = i;
      }
    }
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
        appendBoard(
          builder.mesh,
          {
            path: path,
            width: floorBoardWidth / 2 - floorBoardGap,
            depth: plankDepth,
          },
          floorColor
        );
        appendBoard(
          builder.mesh,
          {
            path: mirroredPath,
            width: floorBoardWidth / 2 - floorBoardGap,
            depth: plankDepth,
          },
          floorColor
        );
        // break; // TODO(@darzu):
      }
    }
  }

  const ceilHeight = floorHeight + 15; // TODO(@darzu): OLD

  // ROTATE WHOLE THING (YIKES)
  {
    const rotate = quat.fromEuler(0, -Math.PI / 2, 0);
    _timberMesh.pos.forEach((v) => {
      V3.tQuat(v, rotate, v);
      V3.add(v, [0, -floorHeight, 0], v);
    });

    // TODO(@darzu): Z_UP: basis change. inline this above?
    _timberMesh.pos.forEach((v) => V3.tMat4(v, transformYUpModelIntoZUp, v));

    const rotate2 = quat.fromYawPitchRoll(Math.PI, 0, 0);
    _timberMesh.pos.forEach((v) => {
      V3.tQuat(v, rotate2, v);
    });
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

  const _end = performance.now();
  console.log(`createSpaceBarge took: ${(_end - _start).toFixed(1)}ms`);

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
