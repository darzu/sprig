import {
  Component,
  EM,
  Entity,
  EntityManager,
  EntityW,
} from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import { FinishedDef } from "../ecs/em_helpers.js";
import { onInit } from "../init.js";
import {
  Mesh,
  normalizeMesh,
  unshareProvokingVerticesWithMap,
} from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { ColorDef } from "../color/color-ecs.js";
import { AssetsDef } from "../meshes/assets.js";
import { ColliderDef } from "../physics/collider.js";
import { constructNetTurret, TurretDef } from "../turret/turret.js";
import { InputsDef } from "../input/inputs.js";
import { LocalPlayerDef, PlayerDef } from "../games/hs-player.js";
import { DeletedDef } from "../ecs/delete.js";
import { clamp } from "../utils/math.js";
import { createRef } from "../ecs/em_helpers.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { assert } from "../utils/util.js";
import { ENDESGA16 } from "../color/palettes.js";

const SAIL_TURN_SPEED = 5;
export const SAIL_FURL_RATE = 0.02;
const BILLOW_FACTOR = 0.2;

export const SailDef = EM.defineComponent("sail", () => ({
  width: 1,
  height: 1,
  unfurledAmount: 0.1,
  minFurl: 0.1,
  billowAmount: 0.0,
  force: 0.0,
  posMap: new Map<number, number>(),
}));

function sailMesh(sail: Component<typeof SailDef>): Mesh {
  let x = 0;
  let y = 0;
  let i = 0;
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  const colors: vec3[] = [];
  const lines: vec2[] = [];
  const uvs: vec2[] = [];
  while (y <= sail.height) {
    if (x > sail.width) {
      x = 0;
      y = y + 1;
      continue;
    }
    pos.push(V(x, -y, 0));
    uvs.push(V(x / sail.width, y / sail.height));
    // add triangles
    if (y > 0) {
      if (x > 0) {
        // front
        tri.push(V(i, i - 1, i - sail.width - 1));
        colors.push(V(0, 0, 0));
        // back
        tri.push(V(i - sail.width - 1, i - 1, i));
        colors.push(V(0, 0, 0));
      }
      if (x < sail.width) {
        // front
        tri.push(V(i, i - sail.width - 1, i - sail.width));
        colors.push(V(0, 0, 0));
        // back
        tri.push(V(i - sail.width, i - sail.width - 1, i));
        colors.push(V(0, 0, 0));
      }
    }
    // add lines
    if (x > 0) {
      lines.push(vec2.clone([i - 1, i]));
    }
    if (y > 0) {
      lines.push(vec2.clone([i - sail.width - 1, i]));
    }
    x = x + 1;
    i = i + 1;
  }
  const { mesh, posMap } = unshareProvokingVerticesWithMap({
    pos,
    tri,
    quad: [],
    colors,
    lines,
    uvs,
  });
  sail.posMap = posMap;
  return normalizeMesh(mesh);
}

export function createSail(
  em: EntityManager,
  width: number,
  height: number,
  scale: number
): EntityW<
  [typeof SailDef, typeof PositionDef, typeof RotationDef, typeof ScaleDef]
> {
  const ent = em.new();
  em.ensureComponentOn(ent, SailDef);
  ent.sail.width = width;
  ent.sail.height = height;
  const mesh = sailMesh(ent.sail);
  em.ensureComponentOn(ent, RenderableConstructDef, mesh);
  em.ensureComponentOn(ent, ScaleDef, V(scale, scale, scale));
  em.ensureComponentOn(ent, PositionDef);
  em.ensureComponentOn(ent, RotationDef);
  // em.ensureComponentOn(ent, ColorDef, V(0.9, 0.9, 0.9));
  em.ensureComponentOn(ent, ColorDef, ENDESGA16.red);
  return ent;
}

const AHEAD_DIR = V(0, 0, 1);

EM.registerSystem(
  [SailDef, WorldFrameDef],
  [WindDef],
  (es, res) => {
    for (let e of es) {
      const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
      e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
      if (e.sail.billowAmount < 0) e.sail.billowAmount = 0;
      if (e.sail.unfurledAmount > e.sail.minFurl) {
        e.sail.force = e.sail.billowAmount * e.sail.unfurledAmount;
      } else {
        e.sail.force = 0;
      }
    }
  },
  "applyWindToSail"
);

let _lastSailBillow = 0;
let _lastSailUnfurl = 0;
EM.registerSystem(
  [SailDef, RenderableDef],
  [RendererDef],
  (es, { renderer }) => {
    assert(es.length <= 1);
    if (!es.length) return;
    const e = es[0];
    if (
      Math.abs(e.sail.billowAmount - _lastSailBillow) < 0.01 &&
      Math.abs(e.sail.unfurledAmount - _lastSailUnfurl) < 0.01
    )
      // no change
      return;
    // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
    const m = e.renderable.meshHandle.mesh! as Mesh;
    m.pos.forEach((p, i) => {
      const originalIndex = e.sail.posMap.get(i)!;
      let y = Math.floor(originalIndex / (e.sail.width + 1));
      let parabY;
      if (e.sail.height % 2 == 0) {
        parabY = y - e.sail.height / 2;
      } else {
        if (y < e.sail.height / 2) {
          parabY = y - Math.ceil(e.sail.height / 2);
        } else {
          parabY = y - Math.floor(e.sail.height / 2);
        }
      }
      p[2] = -(
        e.sail.billowAmount *
        BILLOW_FACTOR *
        e.sail.unfurledAmount *
        (parabY ** 2 - Math.ceil(e.sail.height / 2) ** 2)
      );
      p[1] = -y * e.sail.unfurledAmount;
    });
    renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
    _lastSailBillow = e.sail.billowAmount;
    _lastSailUnfurl = e.sail.unfurledAmount;
  },
  "billow"
);

EM.addConstraint(["billow", "after", "applyWindToSail"]);

export const MastDef = EM.defineComponent("mast", () => ({
  sail: createRef(0, [SailDef]),
  force: 0.0,
}));

export async function createMast(em: EntityManager) {
  const res = await em.whenResources(AssetsDef, MeDef);
  let ent = em.new();
  em.ensureComponentOn(ent, MastDef);
  em.ensureComponentOn(ent, RenderableConstructDef, res.assets.mast.proto);
  em.ensureComponentOn(ent, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.mast.aabb,
  });
  em.ensureComponentOn(ent, PositionDef);
  em.ensureComponentOn(ent, RotationDef);
  // em.ensureComponentOn(ent, ColorDef, V(0.8, 0.7, 0.3));
  em.ensureComponentOn(ent, ColorDef, ENDESGA16.darkBrown);
  em.ensureComponentOn(ent, AuthorityDef, res.me.pid);

  // EM.set(ent, YawPitchDef);

  // const interactBox = em.new();
  // em.set(interactBox, PhysicsParentDef, ent.id);
  // em.set(interactBox, PositionDef, V(0, 0, 0));
  // em.set(interactBox, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: {
  //     // HACK: put out of reach
  //     min: V(-1, 10, -1),
  //     max: V(1, 20, 1),
  //     // min: V(-1, -1, -1),
  //     // max: V(1, 1, 1),
  //   },
  // });
  // // TODO: setting the yawFactor to -1 is kind of hacky
  // constructNetTurret(
  //   ent,
  //   0,
  //   0,
  //   interactBox,
  //   Math.PI,
  //   -Math.PI / 8,
  //   -1,
  //   V(0, 20, 50),
  //   true,
  //   SAIL_TURN_SPEED
  // );

  // ent.turret.maxPitch = 0;
  // ent.turret.minPitch = 0;
  // ent.turret.maxYaw = Math.PI / 2;
  // ent.turret.minYaw = -Math.PI / 2;

  const sailWidth = 14;
  const sail = createSail(em, sailWidth, 8, 2);
  em.ensureComponentOn(sail, PhysicsParentDef, ent.id);
  sail.position[0] = -sailWidth;
  sail.position[1] = 38;
  sail.position[2] = 0.51;
  ent.mast.sail = createRef(sail);
  return ent;
}

// EM.registerSystem(
//   [MastDef, TurretDef],
//   [InputsDef, LocalPlayerDef],
//   (es, res) => {
//     const player = EM.findEntity(res.localPlayer.playerId, [PlayerDef])!;
//     if (!player) return;
//     for (let e of es) {
//       if (DeletedDef.isOn(e)) continue;
//       if (e.turret.mannedId !== player.id) continue;
//       const sail = e.mast.sail()!.sail;
//       if (res.inputs.keyDowns["s"]) sail.unfurledAmount += SAIL_FURL_RATE;
//       if (res.inputs.keyDowns["w"]) sail.unfurledAmount -= SAIL_FURL_RATE;
//       sail.unfurledAmount = clamp(sail.unfurledAmount, sail.minFurl, 1.0);
//     }
//   },
//   "furlSail"
// );

EM.addConstraint(["furlSail", "before", "applyWindToSail"]);

EM.registerSystem(
  [MastDef, RotationDef],
  [],
  (es) => {
    for (let e of es) {
      const sail = e.mast.sail()!.sail;
      const normal = vec3.transformQuat(AHEAD_DIR, e.rotation);
      e.mast.force = sail.force * vec3.dot(AHEAD_DIR, normal);
    }
  },
  "mastForce"
);

EM.addConstraint(["mastForce", "after", "applyWindToSail"]);
EM.addConstraint(["mastForce", "after", "billow"]);
