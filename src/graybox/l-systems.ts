import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, mat4 } from "../matrix/sprig-matrix.js";
import { Mesh } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { DEFAULT_MASK, JFA_PRE_PASS_MASK } from "../render/pipeline-masks.js";
import {
  lineMeshPoolPtr,
  pointMeshPoolPtr,
} from "../render/pipelines/std-point.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { jitter } from "../utils/math.js";
import { assert, range } from "../utils/util.js";
import { createObj } from "./objects.js";

// TODO(@darzu): ABSTRACTION: l-systems, paths, boards all have a lot in common..
/*
  the generation seems most efficient when it's "just" actual code
  but we should store it better somehow, instead of regen with same seed/no rand
    or maybe store checkpoints?
  maybe have a procedural asset management system?
    tracks last version of algo
  optimize: 1. gen, 2. storage, 3. presentation
  would be great if we could easily do these in compute
*/

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
  const nodes: V3[] = [];
  const nodeNorms: V3[] = [];
  const lines: V2[] = [];
  const points: V3[] = [];
  const pointNorms: V3[] = [];

  const maxStack = 10;
  let _cursors: mat4[] = range(maxStack).map((_) => mat4.create());
  let _cursorIdx = 0;
  let cursor = _cursors[_cursorIdx];
  let _nodeIdxStack: number[] = [];
  let _lastNodeIdx: number = -1;

  let norm = V(0, 0, 1);

  // TODO(@darzu): add points vs lines!
  // TODO(@darzu): add leaves
  const line = () => {
    nodes.push(mat4.getTranslation(cursor, V3.mk()));
    nodeNorms.push(V3.clone(norm));
    if (_lastNodeIdx >= 0) {
      lines.push(V(_lastNodeIdx, nodes.length - 1));
    }
    _lastNodeIdx = nodes.length - 1;
  };
  const point = () => {
    points.push(mat4.getTranslation(cursor, V3.mk()));
    pointNorms.push(V3.clone(norm));
  };
  const mov = (x: number, y: number, z: number) =>
    mat4.translate(cursor, [x, y, z], cursor);
  const push = () => {
    let oldCursor = cursor;
    _cursorIdx++;
    assert(_cursorIdx <= _cursors.length - 1, `stack overflow`);
    cursor = _cursors[_cursorIdx];
    mat4.copy(cursor, oldCursor);
    _nodeIdxStack.push(_lastNodeIdx);
  };
  const pop = () => {
    _cursorIdx--;
    assert(_cursorIdx >= 0, "stack underflow");
    cursor = _cursors[_cursorIdx];
    assert(_nodeIdxStack.length > 0, "stack underflow 2");
    _lastNodeIdx = _nodeIdxStack.pop()!;
  };

  mov(80, 240, 0);
  function tree(depth: number) {
    for (let i = 0; i < depth; i++) {
      // up
      mov(0, 0, 10);
      line();
      // bend
      if (Math.random() < 0.1) {
        mat4.yaw(cursor, Math.PI * 0.1 * jitter(1), cursor);
        mat4.pitch(cursor, Math.PI * 0.1 * jitter(1), cursor);
      }
      // branch
      if (Math.random() < 0.1) {
        push();
        mat4.yaw(cursor, Math.PI * 0.2 * jitter(1), cursor);
        mat4.pitch(cursor, Math.PI * 0.2 * jitter(1), cursor);
        tree(depth - 1);
        pop();
      }
      // last leaves
      if (i === depth - 1) {
        push();
        for (let j = 0; j < 6; j++) {
          mov(jitter(2), jitter(2), jitter(2));
          point();
        }
        pop();
      }
    }
  }
  tree(10);

  // create mesh(es)
  const mkLineMesh: () => Mesh = () => ({
    dbgName: "lSys_lines",
    pos: nodes,
    tri: [],
    quad: [],
    lines,
    colors: [],
    surfaceIds: [],
    usesProvoking: true,
    posNormals: nodeNorms,
  });
  const mkPointMesh: () => Mesh = () => ({
    dbgName: "lSys_points",
    pos: points,
    tri: [],
    quad: [],
    lines: [],
    colors: [],
    surfaceIds: [],
    usesProvoking: true,
    posNormals: pointNorms,
  });

  const lineMesh = mkLineMesh();
  const pointMesh = mkPointMesh();

  console.dir(lineMesh);

  const branches = createObj(
    [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
    {
      renderableConstruct: [
        lineMesh,
        true,
        undefined,
        JFA_PRE_PASS_MASK | DEFAULT_MASK,
        lineMeshPoolPtr,
      ],
      position: [0, 0, 0],
      scale: [1, 1, 1],
      color: ENDESGA16.lightBrown,
    }
  );
  // TODO(@darzu): leaves need to not have backface culling
  const leaves = createObj(
    [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
    {
      renderableConstruct: [
        pointMesh,
        true,
        undefined,
        JFA_PRE_PASS_MASK | DEFAULT_MASK,
        pointMeshPoolPtr,
      ],
      position: [0, 0, 0],
      scale: [1, 1, 1],
      color: ENDESGA16.lightGreen,
    }
  );
}
