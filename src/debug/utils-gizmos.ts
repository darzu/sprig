import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import {
  createGraph3DAxesMesh,
  createGraph3DDataMesh,
  GraphAxesMeshOpts,
} from "./gizmos.js";
import {
  AABB,
  createAABB,
  updateAABBWithPoint,
  getSizeFromAABB,
} from "../physics/aabb.js";
import {
  PositionDef,
  PhysicsParentDef,
  ScaleDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { V, vec3 } from "../matrix/sprig-matrix.js";
import { vec3Dbg } from "../utils/utils-3d.js";

// TODO(@darzu): It'd be great to have a dbg gizmo drawer-y global resources with features:
//  - mesh: gizmo, arrow, ball, AABBs etc
//  - pool w/ max number present and option to reuse in ring buffer style
// Perhaps all gray boxing should be do-able w/ this immediate mode gizmo dbg stuff!

export function getDataDomain(data: vec3[][]): AABB {
  const aabb = createAABB(
    V(Infinity, Infinity, Infinity),
    V(-Infinity, -Infinity, -Infinity)
  );
  for (let row of data) for (let d of row) updateAABBWithPoint(aabb, d);
  return aabb;
}

// TODO(@darzu): take in data
export function createGraph3D(
  pos: vec3,
  data: vec3[][],
  color?: vec3,
  domain?: AABB,
  range?: AABB
) {
  color = color ?? ENDESGA16.lightGreen;
  domain = domain ?? getDataDomain(data);
  const domainSize = getSizeFromAABB(domain);
  range = range ?? createAABB(V(0, 0, 0), V(50, 50, 50));

  // console.log("domain");
  // console.dir(domain);

  const opts: GraphAxesMeshOpts = {
    intervalDomainLength: vec3.scale(domainSize, 0.1, vec3.mk()),
    domainSize: domain,
    // {
    //   min: V(0, 0, 0),
    //   max: V(100, 100, 100),
    // },
    worldSize: range,

    axisWidth: 0.8,
    intervalGap: 0.4,
  };

  const worldSize = getSizeFromAABB(opts.worldSize);

  // TODO(@darzu): maybe everything should be created with a scale
  const graphMesh = createGraph3DAxesMesh(opts);
  const graph = EM.new();
  EM.set(graph, RenderableConstructDef, graphMesh);
  EM.set(graph, PositionDef, pos);

  const surfScale = vec3.div(worldSize, domainSize, vec3.mk());
  // console.log(`surfScale: ${vec3Dbg(surfScale)}`);

  const graphSurf = EM.new();
  const graphSurfMesh = createGraph3DDataMesh(data);
  EM.set(graphSurf, RenderableConstructDef, graphSurfMesh);
  EM.set(
    graphSurf,
    PositionDef,
    vec3.mul(vec3.negate(domain.min), surfScale, vec3.mk())
    // vec3.add(worldGizmo.position, [50, 10, 50], V(0, 0, 0))
  );
  EM.set(graphSurf, PhysicsParentDef, graph.id);
  EM.set(graphSurf, ColorDef, color);
  EM.set(graphSurf, ScaleDef, surfScale);

  return graph;
}
