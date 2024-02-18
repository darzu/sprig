import { EM } from "../ecs/entity-manager.js";
import { V2, V3, V, mat3, quat } from "../matrix/sprig-matrix.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { Mesh } from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color/color-ecs.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
import { assert } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3Dbg } from "../utils/utils-3d.js";

export const SockDef = EM.defineComponent("sock", () => ({
  scale: 1,
}));

function sockMesh(): Mesh {
  const pos: V3[] = [V(0, 0, 0), V(0, 0, 2), V(0, 2, 1)];
  const tri: V3[] = [V(0, 1, 2), V(2, 1, 0)];
  const colors: V3[] = tri.map((_) => V(0, 0, 0));
  const lines: V2[] = [];

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

export function createSock(scale: number) {
  const ent = EM.new();
  EM.set(ent, SockDef);
  ent.sock.scale = scale;
  const mesh = sockMesh();
  // scaleMesh(mesh, scale);
  EM.set(ent, ScaleDef, V(scale, scale, scale));
  EM.set(ent, RenderableConstructDef, mesh);
  EM.set(ent, PositionDef);
  EM.set(ent, RotationDef);
  EM.set(ent, ColorDef, V(0.9, 0.9, 0.9));
  return ent;
}

let lastWinAngle = NaN;
let lastShipRot = quat.mk();
EM.addSystem(
  "billowSock",
  Phase.GAME_WORLD,
  [SockDef, RenderableDef, WorldFrameDef],
  [RendererDef, WindDef],
  (es, { renderer, wind }) => {
    for (let e of es) {
      // TODO(@darzu): PERF. this is crazy, we should just rotate the sock, not update the verts
      if (
        wind.angle === lastWinAngle &&
        quat.equals(e.world.rotation, lastShipRot)
      )
        continue;
      // const invShip = mat3.invert(mat3.fromMat4(e.world.transform));
      const invShip = quat.invert(e.world.rotation);
      // const windLocalDir = vec3.transformMat3(wind.dir, invShip);
      const windLocalDir = V3.tQuat(wind.dir, invShip);
      // console.log(
      //   `windLocalDir: ${vec3Dbg(windLocalDir)} vs wind.dir: ${vec3Dbg(wind.dir)}`
      // );

      // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
      const m = e.renderable.meshHandle.mesh! as Mesh;
      m.pos[2][0] = windLocalDir[0] * 4.0 * e.sock.scale;
      m.pos[2][1] = windLocalDir[1] * 4.0 * e.sock.scale;
      // console.log("billow sock: " + vec3Dbg(m.pos[2]));
      // TODO: perf: detect when we actually need to update this
      renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
      lastWinAngle = wind.angle;
      quat.copy(lastShipRot, e.world.rotation);
    }
  }
);
