import { mat4, vec3 } from "../matrix/sprig-matrix.js";
import {
  Mesh,
  createEmptyMesh,
  unshareProvokingVertices,
} from "../meshes/mesh.js";
import { createTimberBuilder } from "../wood/wood.js";

export interface MultiBarOpts {
  width: number;
  length: number;
  centered: boolean;
  fullColor: vec3;
  missingColor: vec3;
}

export function createMultiBarMesh({
  width,
  length,
  centered,
  fullColor,
  missingColor,
}: MultiBarOpts): Mesh {
  const mesh = createEmptyMesh("statBar");

  const builder = createTimberBuilder(mesh);
  builder.width = width; // +X
  builder.depth = width; // +Y (after rotate below)

  // point toward -Z
  mat4.rotateX(builder.cursor, -Math.PI * 0.5, builder.cursor);

  const halflen = length * 0.5;

  if (centered)
    mat4.translate(builder.cursor, [0, -halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addEndQuad(true);
  mat4.translate(builder.cursor, [0, halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addSideQuads();
  const part1Qidx = mesh.quad.length - 1;
  mat4.translate(builder.cursor, [0, halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addSideQuads();
  builder.addEndQuad(false);
  // const part2Qidx = mesh.quad.length;

  mesh.quad.forEach((_, i) => {
    const c = vec3.create();
    if (i <= part1Qidx) vec3.copy(c, missingColor);
    else vec3.copy(c, fullColor);
    mesh.colors.push(c);
  });
  mesh.surfaceIds = mesh.colors.map((_, i) => i + 1);

  const _mesh = unshareProvokingVertices(mesh, true) as Mesh;
  // const _mesh = mesh as Mesh;

  // const _mesh = mesh as Mesh;
  // _mesh.usesProvoking = true;

  return _mesh;
}
