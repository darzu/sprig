import { vec3 } from "../gl-matrix.js";
import { tempVec } from "../temp-pool.js";
import { EM, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";

// An MxN rectangular grid of points, connected via springs.
export interface SpringGrid {
  rows: number;
  columns: number;
  positions: vec3[];
  nextPositions: vec3[];
  // indices of points whose position should not change (i.e., they
  // are affixed to something)
  fixed: Set<number>;
  // the length of each spring
  distance: number;
  // the constant factor in the linear restoring on-axis force of each spring
  kOnAxis: number;
  // the constant factor in the linear restoring off-axis (shearing)
  // force of each spring
  kOffAxis: number;
  // The sum of any external forces acting on the system
  // (e.g. gravity, drag, wind)
  externalForce: vec3;
}

export const SpringGridDef = EM.defineComponent(
  "springGrid",
  (
    rows?: number,
    columns?: number,
    fixed?: Iterable<number>,
    distance?: number,
    kOnAxis?: number,
    kOffAxis?: number
  ) => {
    rows = rows || 0;
    columns = columns || 0;
    fixed = fixed || [];
    distance = distance || 1;
    kOnAxis = kOnAxis || 0.01;
    kOffAxis = kOffAxis || kOnAxis;
    const positions: vec3[] = [];
    const nextPositions: vec3[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        positions.push(vec3.fromValues(x * distance, y * distance, 0));
        nextPositions.push(vec3.create());
      }
    }
    const externalForce = vec3.create();
    const fixedSet = new Set(fixed);
    return {
      rows,
      columns,
      positions,
      nextPositions,
      fixed: fixedSet,
      distance,
      kOnAxis,
      kOffAxis,
      externalForce,
    };
  }
);

enum Direction {
  Up,
  Down,
  Left,
  Right,
}

function neighbor(
  g: SpringGrid,
  point: number,
  direction: Direction
): number | null {
  let x = point % g.columns;
  let y = (point - x) / g.columns;
  switch (direction) {
    case Direction.Up:
      y = y + 1;
      break;
    case Direction.Down:
      y = y - 1;
      break;
    case Direction.Left:
      x = x - 1;
      break;
    case Direction.Right:
      x = x + 1;
      break;
  }
  if (x >= 0 && x < g.columns && y >= 0 && y < g.rows) {
    return y * g.columns + x;
  }
  return null;
}

function targetLocation(
  g: SpringGrid,
  neighbor: number,
  inDirection: Direction,
  out: vec3
) {
  vec3.copy(out, g.positions[neighbor]);
  switch (inDirection) {
    case Direction.Up:
      out[1] = out[1] - g.distance;
      break;
    case Direction.Down:
      out[1] = out[1] + g.distance;
      break;
    case Direction.Left:
      out[0] = out[0] + g.distance;
      break;
    case Direction.Right:
      out[0] = out[0] - g.distance;
      break;
  }
}

function addSpringForce(g: SpringGrid, point: number, force: vec3) {
  const distanceVec = tempVec();
  for (let direction of [
    Direction.Up,
    Direction.Down,
    Direction.Left,
    Direction.Right,
  ]) {
    //console.log(`spring force on ${point}`);
    let o = neighbor(g, point, direction);
    if (o === null) continue;

    targetLocation(g, o, direction, distanceVec);
    //console.log("vectors");
    //console.log(Direction[direction]);
    //console.log(distanceVec);
    //console.log(g.positions[point]);
    vec3.sub(distanceVec, g.positions[point], distanceVec);

    // distanceVec now stores the distance between this point and
    // where it "should" be as far as this neighbor is concerned.  We
    // want to apply a restoring force to try to get it back to that
    // position.

    vec3.scale(distanceVec, distanceVec, -g.kOnAxis);
    vec3.add(force, force, distanceVec);
  }
}

export function stepSprings(g: SpringGrid, dt: number) {
  const forceVec = tempVec();
  for (let point = 0; point < g.rows * g.columns; point++) {
    if (g.fixed.has(point)) {
      vec3.copy(g.nextPositions[point], g.positions[point]);
      //console.log(`${point} fixed`);
      continue;
    }
    vec3.copy(forceVec, g.externalForce);
    addSpringForce(g, point, forceVec);
    if (vec3.length(forceVec) !== 0) {
      vec3.scale(forceVec, forceVec, dt);
      vec3.add(g.nextPositions[point], g.positions[point], forceVec);
    } else {
      vec3.copy(g.nextPositions[point], g.positions[point]);
    }
  }
  for (let point = 0; point < g.rows * g.columns; point++) {
    vec3.copy(g.positions[point], g.nextPositions[point]);
  }
}

export function registerSpringSystem(em: EntityManager) {
  em.registerSystem(
    [SpringGridDef],
    [PhysicsTimerDef],
    (springs, { physicsTimer }) => {
      const dt = physicsTimer.period;
      for (let i = 0; i < physicsTimer.steps; i++) {
        for (let { springGrid } of springs) {
          stepSprings(springGrid, dt);
        }
      }
    },
    "spring"
  );
}
