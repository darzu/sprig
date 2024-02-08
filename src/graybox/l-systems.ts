import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, mat4 } from "../matrix/sprig-matrix.js";
import { Mesh } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { lineMeshPoolPtr } from "../render/pipelines/std-line-point.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { jitter } from "../utils/math.js";
import { assert, range } from "../utils/util.js";
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
  const points: V3[] = [];
  const normals: V3[] = [];
  const lines: V2[] = [];

  const maxStack = 10;
  let _cursors: mat4[] = range(maxStack).map((_) => mat4.create());
  let _cursorIdx = 0;
  let cursor = _cursors[_cursorIdx];
  let _pointIdxStack: number[] = [];
  let _lastPointIdx: number = -1;

  // TODO(@darzu): add points vs lines!
  // TODO(@darzu): add leaves
  const point = (norm: V3) => {
    points.push(mat4.getTranslation(cursor, V3.mk()));
    normals.push(norm);
    if (_lastPointIdx >= 0) {
      lines.push(V(_lastPointIdx, points.length - 1));
    }
    _lastPointIdx = points.length - 1;
  };
  const mov = (x: number, y: number, z: number) =>
    mat4.translate(cursor, [x, y, z], cursor);
  const push = () => {
    let oldCursor = cursor;
    _cursorIdx++;
    assert(_cursorIdx <= _cursors.length - 1, `stack overflow`);
    cursor = _cursors[_cursorIdx];
    mat4.copy(cursor, oldCursor);
    _pointIdxStack.push(_lastPointIdx);
  };
  const pop = () => {
    _cursorIdx--;
    assert(_cursorIdx >= 0, "stack underflow");
    cursor = _cursors[_cursorIdx];
    assert(_pointIdxStack.length > 0, "stack underflow 2");
    _lastPointIdx = _pointIdxStack.pop()!;
  };

  let norm = V(0, 0, 1);

  mov(80, 240, 0);
  function tree(depth: number) {
    for (let i = 0; i < depth; i++) {
      // up
      mov(0, 0, 10);
      point(norm);
      if (Math.random() < 0.1) {
        mat4.yaw(cursor, Math.PI * 0.1 * jitter(1), cursor);
        mat4.pitch(cursor, Math.PI * 0.1 * jitter(1), cursor);
      }
      if (Math.random() < 0.1) {
        push();
        mat4.yaw(cursor, Math.PI * 0.2 * jitter(1), cursor);
        mat4.pitch(cursor, Math.PI * 0.2 * jitter(1), cursor);
        tree(depth - 1);
        pop();
      }
    }
  }
  tree(10);

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
