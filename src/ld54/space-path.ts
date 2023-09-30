import { createLineMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
import { mergeMeshes, Mesh } from "../meshes/mesh.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";

export function initSpacePath() {
  const pathNodes: vec3[] = [
    V(30, -16, 0),
    V(0, -8, 30),
    V(-30, 0, 0),
    V(0, 8, -30),
    V(30, 16, 0),
    V(0, 24, 30),
    // TODO(@darzu):
  ];

  // let numSeg = 20;
  const meshes: Mesh[] = [];

  for (let i = 1; i < pathNodes.length; i++) {
    const prevPoint = pathNodes[i - 1];
    const thisPoint = pathNodes[i];
    const seg = createLineMesh(0.1, prevPoint, thisPoint);
    seg.colors.forEach((c) => {
      c[0] = 1;
    });
    meshes.push(seg);
  }

  const pathMesh = mergeMeshes(...meshes) as Mesh;
  pathMesh.usesProvoking = true;

  // TODO(@darzu): foo

  const path = EM.new();
  EM.set(path, RenderableConstructDef, pathMesh);
  EM.set(path, PositionDef);
}
