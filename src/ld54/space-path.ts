import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { createLineMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
import {
  createEmptyMesh,
  mergeMeshes,
  Mesh,
  validateMesh,
} from "../meshes/mesh.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  BezierCubic,
  Path,
  bezierSplineFromPoints,
  createEvenPathFromBezierSpline,
} from "../utils/spline.js";
import { appendBoard } from "../wood/shipyard.js";

export const SpacePathDef = EM.defineNonupdatableComponent(
  "spacePath",
  (path: Path) => ({
    path,
  })
);

export function createSpacePath() {
  const points: vec3[] = [
    V(0, -24, -30),
    V(30, -16, 0),
    V(0, -8, 30),
    V(-30, 0, 0),
    V(0, 8, -30),
    V(30, 16, 0),
    V(0, 24, 30),
    V(-30, 32, 0),
    // TODO(@darzu):
  ];

  // let numSeg = 20;
  const meshes: Mesh[] = [];

  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i - 1];
    const thisPoint = points[i];
    const seg = createLineMesh(0.1, prevPoint, thisPoint);
    seg.colors.forEach((c) => {
      c[0] = 1;
    });
    meshes.push(seg);
  }

  const spline = bezierSplineFromPoints(points, 10);
  const path = createEvenPathFromBezierSpline(spline, 5, [0, 1, 0]);

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
    const prevPoint = path[i - 1].pos;
    const thisPoint = path[i].pos;
    const seg = createLineMesh(1.0, prevPoint, thisPoint);
    seg.colors.forEach((c) => {
      vec3.copy(c, AllEndesga16[i % AllEndesga16.length]);
    });
    meshes.push(seg);
  }

  const pathMesh = mergeMeshes(...meshes) as Mesh;
  pathMesh.usesProvoking = true;

  pathMesh.surfaceIds = pathMesh.colors.map((_, i) => i);
  validateMesh(pathMesh);

  // TODO(@darzu): foo

  const ent = EM.new();
  EM.set(ent, RenderableConstructDef, pathMesh);
  EM.set(ent, PositionDef);
  EM.set(ent, SpacePathDef, path);

  return ent;
}
