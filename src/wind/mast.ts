import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, Resources } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { defineObj, T, createObj } from "../graybox/objects.js";
import { vec3 } from "../matrix/sprig-matrix.js";
import { MastMesh } from "../meshes/mesh-list.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { SailDef, createSail } from "./sail.js";

const MastObj = defineObj({
  name: "mast",
  components: [
    RenderableConstructDef,
    ColliderDef,
    PositionDef,
    RotationDef,
    ColorDef,
    AuthorityDef,
  ],
  propsType: T<{ force: number }>(),
  physicsParentChildren: true,
  children: {
    sail: [SailDef],
  },
} as const);
export const MastDef = MastObj.props;

export function createMast(
  res: Resources<[typeof MeDef, typeof MastMesh.def]>
) {
  const sailWidth = 14;
  const sail = createSail(sailWidth, 8, 2);
  sail.position[0] = -sailWidth;
  sail.position[1] = 0.51;
  sail.position[2] = 38;

  const mesh = res.mesh_mast;

  const ent = createObj(MastObj, {
    props: { force: 0.0 },
    args: {
      renderableConstruct: [mesh.proto],
      collider: {
        shape: "AABB",
        solid: false,
        aabb: mesh.aabb,
      },
      position: undefined,
      rotation: undefined,
      color: ENDESGA16.darkBrown,
      authority: res.me.pid,
    },
    children: {
      sail: sail,
    },
  });

  return ent;
}

EM.addSystem(
  "mastForce",
  Phase.GAME_WORLD,
  [MastDef, RotationDef],
  [],
  (es) => {
    for (let e of es) {
      const sail = e.mast.sail.sail;
      const normal = vec3.transformQuat(vec3.FWD, e.rotation);
      e.mast.force = sail.force * vec3.dot(vec3.FWD, normal);
    }
  }
);
