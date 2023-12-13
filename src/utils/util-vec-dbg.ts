import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { ArrowMesh } from "../meshes/mesh-list.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";

export const VecDbgDef = EM.defineNonupdatableComponent(
  "vecDbg",
  (v: vec3, scale: number) => ({ v, scale })
);

// TODO(@darzu): HACK! This whole system works by tracking a reference to a vector
EM.addEagerInit([VecDbgDef], [], [], () => {
  EM.addSystem(
    "updateVecDebugVisuals",
    Phase.POST_GAME_WORLD,
    [VecDbgDef, ScaleDef, RotationDef],
    [],
    (es, res) => {
      for (let e of es) {
        updateVecDbgVis(e.vecDbg.v, e.vecDbg.scale, e);
      }
    }
  );
});

export interface VecDbgVisOpts {
  origin?: vec3.InputT;
  scale?: number;
  parentId?: number;
  color?: vec3.InputT;
}
export const DefaultVecDbgVisOpts: Required<VecDbgVisOpts> = {
  origin: [0, 0, 0],
  scale: 1,
  parentId: 0,
  color: ENDESGA16.lightGreen,
};

export function addVecUpdatingDbgVis(v: vec3, opts?: VecDbgVisOpts) {
  const o = { ...DefaultVecDbgVisOpts, ...opts };

  const ent = addVecDbgVis(v, o);

  EM.set(ent, VecDbgDef, v, o.scale);

  return ent;
}

export function addVecDbgVis(v: vec3.InputT, opts?: VecDbgVisOpts) {
  const o = { ...DefaultVecDbgVisOpts, ...opts };

  const ent = EM.new();
  EM.set(ent, PositionDef, o.origin);
  EM.set(ent, RenderableConstructDef, ArrowMesh);
  EM.set(ent, ColorDef, o.color);
  EM.set(ent, ScaleDef);
  EM.set(ent, RotationDef);
  if (o.parentId !== 0) EM.set(ent, PhysicsParentDef, o.parentId);

  updateVecDbgVis(v, o.scale, ent);

  return ent;
}

function updateVecDbgVis(
  v: vec3.InputT,
  s: number,
  e: EntityW<[typeof ScaleDef, typeof RotationDef]>
) {
  // update scale
  const scale = s * vec3.length(v);
  // vec3.set(1, scale, 1, e.scale);
  vec3.set(scale * 0.5, scale, scale * 0.5, e.scale);

  // update rotation
  quat.fromForward(v, e.rotation);
}
