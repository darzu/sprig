import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, V, mat3 } from "../sprig-matrix.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { Mesh } from "../render/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color/color-ecs.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
import { assert } from "../util.js";

export const SockDef = EM.defineComponent("sock", () => ({
  scale: 1,
}));

function sockMesh(): Mesh {
  const pos: vec3[] = [V(0, 0, 0), V(0, 2, 0), V(0, 1, 2)];
  const tri: vec3[] = [V(0, 1, 2), V(2, 1, 0)];
  const colors: vec3[] = tri.map((_) => V(0, 0, 0));
  const lines: vec2[] = [];

  return {
    pos,
    tri,
    quad: [],
    colors,
    lines,
    usesProvoking: true,
    surfaceIds: tri.map((_, ti) => ti + 1),
    dbgName: "windsock",
  };
}

export function createSock(em: EntityManager, scale: number) {
  const ent = em.new();
  em.ensureComponentOn(ent, SockDef);
  ent.sock.scale = scale;
  const mesh = sockMesh();
  // scaleMesh(mesh, scale);
  em.ensureComponentOn(ent, ScaleDef, V(scale, scale, scale));
  em.ensureComponentOn(ent, RenderableConstructDef, mesh);
  em.ensureComponentOn(ent, PositionDef);
  em.ensureComponentOn(ent, RotationDef);
  em.ensureComponentOn(ent, ColorDef, V(0.9, 0.9, 0.9));
  return ent;
}

let lastWinAngle = NaN;
EM.registerSystem(
  [SockDef, RenderableDef, WorldFrameDef],
  [RendererDef, WindDef],
  (es, { renderer, wind }) => {
    assert(es.length <= 1);
    const e = es[0];
    if (!e) return;
    if (wind.angle === lastWinAngle) return;
    const invShip = mat3.invert(mat3.fromMat4(e.world.transform));
    const windLocalDir = vec3.transformMat3(wind.dir, invShip);

    // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
    const m = e.renderable.meshHandle.mesh! as Mesh;
    m.pos[2][0] = windLocalDir[0] * 4.0 * e.sock.scale;
    m.pos[2][2] = windLocalDir[2] * 4.0 * e.sock.scale;
    // console.log("billow sock: " + vec3Dbg(m.pos[2]));
    // TODO: perf: detect when we actually need to update this
    renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
    lastWinAngle = wind.angle;
  },
  "billowSock"
);
EM.requireSystem("billowSock");
