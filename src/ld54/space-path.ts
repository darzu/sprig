import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { createLineMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/ecs.js";
import { V, orthonormalize, quat, tV, V3 } from "../matrix/sprig-matrix.js";
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
import { quatFromUpForward_OLD } from "../utils/utils-3d.js";
import { appendBoard } from "../wood/shipyard.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";

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
  const points = getRandomCylindricalPoints(50, 50, 16);
  points.forEach((v) => V3.pitch(v, -Math.PI / 2, v));

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

  const UP: V3.InputT = [0, 0, 1];

  const spline = bezierSplineFromPoints(points, 20);
  const path = createEvenPathFromBezierSpline(spline, 5, UP);

  if (DEBUG_PATH_POINTS) dbgPathWithGizmos(path, 5);

  for (let i = 1; i < path.length; i++) {
    if (i % 2 !== 0) continue;

    const prevPoint = path[i - 1].pos;
    const thisPoint = path[i].pos;
    const seg = createLineMesh(1.0, prevPoint, thisPoint);
    seg.colors.forEach((c) => {
      // vec3.copy(c, AllEndesga16[i % AllEndesga16.length]);
      V3.copy(c, ENDESGA16.yellow);
    });
    meshes.push(seg);
  }

  meshes.forEach((mesh, i) => {
    mesh.usesProvoking = true;
    mesh.surfaceIds = mesh.colors.map((_, i) => i);
    validateMesh(mesh);
    const ent = EM.mk();
    // console.log("hidden");
    EM.set(ent, RenderableConstructDef, mesh);
    if (!DEBUG_PATH_POINTS)
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

  const ent = EM.mk();
  //EM.set(ent, RenderableConstructDef, pathMesh);
  //EM.set(ent, PositionDef);
  EM.set(ent, SpacePathDef, path);

  return ent;
}
