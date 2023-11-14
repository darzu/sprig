import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { createLineMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, quat, tV, vec3 } from "../matrix/sprig-matrix.js";
import {
  createEmptyRawMesh,
  mergeMeshes,
  Mesh,
  validateMesh,
} from "../meshes/mesh.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  BezierCubic,
  Path,
  bezierSplineFromPoints,
  createEvenPathFromBezierSpline,
  getRandomCylindricalPoints,
} from "../utils/spline.js";
import { orthonormalize, quatFromUpForward } from "../utils/utils-3d.js";
import { appendBoard } from "../wood/shipyard.js";

export const SpacePathDef = EM.defineNonupdatableComponent(
  "spacePath",
  (path: Path) => ({
    path,
  })
);

export const SpacePathSegmentDef = EM.defineNonupdatableComponent(
  "spacePathSegment",
  (n: number) => ({ n })
);

const DEBUG_PATH_POINTS = false;

export function createSpacePath() {
  // const points: vec3[] = [
  //   V(0, -24, -30),
  //   V(30, -16, 0),
  //   V(0, -8, 30),
  //   V(-30, 0, 0),
  //   V(0, 8, -30),
  //   V(30, 16, 0),
  //   V(0, 24, 30),
  //   V(-30, 32, 0),
  //   // TODO(@darzu):
  // ];

  const points = getRandomCylindricalPoints(50, 50, 16);

  // let numSeg = 20;
  const meshes: Mesh[] = [];

  if (DEBUG_PATH_POINTS) {
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const thisPoint = points[i];
      const seg = createLineMesh(0.1, prevPoint, thisPoint);
      seg.colors.forEach((c) => {
        c[0] = 1;
      });
      meshes.push(seg);
    }
  }

  const spline = bezierSplineFromPoints(points, 20);
  const path = createEvenPathFromBezierSpline(spline, 5, [0, 1, 0]);

  // TODO(@darzu): HACK: fix path rotations
  const up = tV(0, 1, 0); // TODO(@darzu): Z_UP
  const _t1 = vec3.tmp();
  const _t2 = vec3.tmp();
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i].pos;
    const end = path[i + 1].pos;

    // TODO(@darzu): IMPL
    const fwd = vec3.sub(end, start, _t1);
    const len = vec3.length(fwd);
    const right = _t2;
    orthonormalize(fwd, up, right);
    // console.log(vec3Dbg(fwd));
    // console.log(vec3Dbg(up));
    // console.log(vec3Dbg(right));

    vec3.scale(fwd, len, fwd);
    // const left = vec3.negate(right);
    // const down = vec3.negate(up);

    // const forwardish = vec3.sub(node.pos, next.pos);
    quatFromUpForward(path[i].rot, up, fwd);
    // quat.rotateY(node.rot, Math.PI * 1.0, node.rot);

    // quat.rotateZ(node.rot, Math.PI * 0.25, node.rot);
  }

  // const pathMesh = createEmptyMesh("pathMesh") as Mesh;
  // pathMesh.usesProvoking = true;

  // appendBoard(
  //   pathMesh,
  //   {
  //     path,
  //     width: 1.0,
  //     depth: 1.0,
  //   },
  //   V(0, 1, 0)
  // );

  for (let i = 1; i < path.length; i++) {
    if (i % 2 !== 0) continue;

    const prevPoint = path[i - 1].pos;
    const thisPoint = path[i].pos;
    const seg = createLineMesh(1.0, prevPoint, thisPoint);
    seg.colors.forEach((c) => {
      // vec3.copy(c, AllEndesga16[i % AllEndesga16.length]);
      vec3.copy(c, ENDESGA16.yellow);
    });
    meshes.push(seg);
  }

  meshes.forEach((mesh, i) => {
    mesh.usesProvoking = true;
    mesh.surfaceIds = mesh.colors.map((_, i) => i);
    validateMesh(mesh);
    const ent = EM.new();
    console.log("hidden");
    EM.set(ent, RenderableConstructDef, mesh);
    EM.whenEntityHas(ent, RenderableDef).then(
      (e) => (e.renderable.hidden = true)
    );
    EM.set(ent, PositionDef);
    EM.set(ent, SpacePathSegmentDef, i);
  });
  /*
  const pathMesh = mergeMeshes(...meshes) as Mesh;
  pathMesh.usesProvoking = true;

  pathMesh.surfaceIds = pathMesh.colors.map((_, i) => i);
  validateMesh(pathMesh);
*/
  // TODO(@darzu): foo

  const ent = EM.new();
  //EM.set(ent, RenderableConstructDef, pathMesh);
  //EM.set(ent, PositionDef);
  EM.set(ent, SpacePathDef, path);

  return ent;
}
