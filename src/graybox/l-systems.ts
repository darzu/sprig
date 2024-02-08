import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, mat4 } from "../matrix/sprig-matrix.js";
import { Mesh } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { lineMeshPoolPtr } from "../render/pipelines/std-line-point.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { createObj } from "./objects.js";

// TODO(@darzu): ABSTRACTION: l-systems, paths, boards all have a lot in common..

interface LSys {
  run: (depth: number) => void;
}

interface LSysOpt {
  emitPoint: (p: V3.InputT) => void;
  emitLine: (a: V3.InputT, b: V3.InputT) => void;
}

function createLSys(pa: LSysOpt): LSys {
  const lsys: LSys = {
    run,
  };

  return lsys;

  function run(depth: number) {
    // TODO(@darzu): IMPL
  }
}

export function testingLSys() {
  const cursor = mat4.create();
  const points: V3[] = [];
  const normals: V3[] = [];
  const depth = 10;

  const pushPoint = (norm: V3) => {
    points.push(mat4.getTranslation(cursor, V3.mk()));
    normals.push(norm);
  };
  const mov = (x: number, y: number, z: number) =>
    mat4.translate(cursor, [x, y, z], cursor);

  let norm = V(0, 0, 1);

  mov(80, 240, 0);
  for (let i = 0; i < depth; i++) {
    mov(0, 0, 20);
    pushPoint(norm);
  }

  function stichLines() {
    const lines: V2[] = [];
    for (let i = 1; i < points.length; i++) {
      lines.push(V(i - 1, i));
    }
    return lines;
  }

  const lines: V2[] = stichLines();

  // create mesh
  const mkMesh: () => Mesh = () => ({
    dbgName: "lSys",
    pos: points,
    tri: [],
    quad: [],
    lines,
    colors: [],
    surfaceIds: [],
    usesProvoking: true,
    posNormals: normals,
  });

  const mesh = mkMesh();

  console.dir(mesh);

  const obj = createObj(
    [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
    {
      renderableConstruct: [mesh, true, undefined, undefined, lineMeshPoolPtr],
      position: [0, 0, 0],
      scale: [1, 1, 1],
      color: ENDESGA16.lightBrown,
    }
  );
}
