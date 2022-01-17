import { vec3 } from "../gl-matrix.js";
import { tempVec } from "../temp-pool.js";

// An MxN rectangular grid of points, connected via springs.
interface SpringGrid {
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
}

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

export function stepSystem(g: SpringGrid, externalForce: vec3, dt: number) {
  const forceVec = tempVec();
  for (let point = 0; point < g.rows * g.columns; point++) {
    if (g.fixed.has(point)) {
      continue;
    }
    vec3.copy(forceVec, externalForce);
    addSpringForce(g, point, forceVec);
    vec3.scale(forceVec, forceVec, dt);
    vec3.add(g.positions[point], g.positions[point], forceVec);
  }
}
