import { vec3 } from "../gl-matrix.js";
import { tempVec } from "../temp-pool.js";
import { EM, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";

// An MxN rectangular grid of points, connected via springs.
export interface SpringGrid {
  rows: number;
  columns: number;
  positions: vec3[];
  // indices of points whose position should not change (i.e., they
  // are affixed to something)
  fixed: Set<number>;
  // the length of each spring
  distance: number;
  // the strength of each spring (k as in F = kx in Hooke's Law)
  k: number;
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
    k?: number
  ) => {
    rows = rows || 0;
    columns = columns || 0;
    fixed = fixed || [];
    distance = distance || 1;
    k = k || 1;
    const positions = new Array(rows * columns);
    const externalForce = vec3.create();
    const fixedSet = new Set(fixed);
    return {
      rows,
      columns,
      positions,
      fixed: fixedSet,
      distance,
      k,
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
      y = y - 1;
      break;
    case Direction.Down:
      y = y + 1;
      break;
    case Direction.Left:
      x = x - 1;
      break;
    case Direction.Right:
      x = x + 1;
      break;
  }
  if (x > 0 && x < g.columns && y > 0 && y < g.columns) {
    return y * g.columns + x;
  }
  return null;
}

function addSpringForce(g: SpringGrid, point: number, force: vec3) {
  const distanceVec = tempVec();
  for (let direction of [
    Direction.Up,
    Direction.Down,
    Direction.Left,
    Direction.Right,
  ]) {
    let o = neighbor(g, point, direction);
    if (!o) continue;
    // A vector pointing from this point to one of its neighbors
    vec3.sub(distanceVec, g.positions[point], g.positions[o]);
    const distance = vec3.length(distanceVec);
    vec3.normalize(distanceVec, distanceVec);
    // Apply a force on the point:
    // - push it away if it is close (distance < g.distance)
    // - pull it closer if it is far (distance > g.distance)
    vec3.scale(distanceVec, distanceVec, g.k * (distance - g.distance));
    vec3.add(force, force, distanceVec);
  }
}

export function stepSprings(g: SpringGrid, dt: number) {
  const forceVec = tempVec();
  for (let point = 0; point < g.rows * g.columns; point++) {
    if (g.fixed.has(point)) {
      continue;
    }
    vec3.copy(forceVec, g.externalForce);
    addSpringForce(g, point, forceVec);
    vec3.scale(forceVec, forceVec, dt);
    vec3.add(g.positions[point], g.positions[point], forceVec);
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
