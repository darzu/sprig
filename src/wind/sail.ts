import { Component, EM, EntityW } from "../ecs/entity-manager.js";
import { Resources } from "../ecs/em-resources.js";
import { V2, V3, quat, V, tV } from "../matrix/sprig-matrix.js";
import {
  Frame,
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { AuthorityDef, MeDef } from "../net/components.js";
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
import { ColorDef } from "../color/color-ecs.js";
import { AllMeshesDef, MastMesh } from "../meshes/mesh-list.js";
import { ColliderDef } from "../physics/collider.js";
import { clamp } from "../utils/math.js";
import { createRef } from "../ecs/em-helpers.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
import { assert } from "../utils/util.js";
import { ENDESGA16 } from "../color/palettes.js";
import { angleBetweenPosXZ, angleBetweenXZ } from "../utils/utils-3d.js";
import { Phase } from "../ecs/sys-phase.js";
import { ObjOwnProps, defineObj } from "../graybox/objects.js";
import { T } from "../utils/util-no-import.js";

const SAIL_TURN_SPEED = 5;
export const SAIL_FURL_RATE = 0.02;
const BILLOW_FACTOR = 0.2;

const SailObj = defineObj({
  name: "sail",
  propsType: T<{
    width: number;
    height: number;
    unfurledAmount: number;
    minFurl: number;
    _billowAmount: number;
    force: number;
    posMap: Map<number, number>;
    _lastSailBillow: number;
    _lastSailUnfurl: number;
  }>(),
  components: [
    RenderableConstructDef,
    ScaleDef,
    PositionDef,
    RotationDef,
    ColorDef,
  ],
} as const);
export const SailDef = SailObj.props;

function sailMesh(sail: Component<typeof SailDef>): Mesh {
  let x = 0;
  let z = 0;
  let i = 0;
  const pos: V3[] = [];
  const tri: V3[] = [];
  const colors: V3[] = [];
  const lines: V2[] = [];
  const uvs: V2[] = [];
  while (z <= sail.height) {
    if (x > sail.width) {
      x = 0;
      z = z + 1;
      continue;
    }
    pos.push(V(x, 0, -z));
    uvs.push(V(x / sail.width, z / sail.height));
    // add triangles
    if (z > 0) {
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
      lines.push(V2.clone([i - 1, i]));
    }
    if (z > 0) {
      lines.push(V2.clone([i - sail.width - 1, i]));
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
  width: number,
  height: number,
  scale: number
): EntityW<
  [typeof SailDef, typeof PositionDef, typeof RotationDef, typeof ScaleDef]
> {
  const props: ObjOwnProps<typeof SailObj> = {
    width,
    height,
    unfurledAmount: 0.1,
    minFurl: 0.1,
    _billowAmount: 0.0,
    force: 0.0,
    posMap: new Map<number, number>(),
    _lastSailBillow: 0,
    _lastSailUnfurl: 0,
  };

  const mesh = sailMesh(props);

  const ent = SailObj.new({
    props,
    args: {
      renderableConstruct: [mesh],
      scale: [scale, scale, scale],
      position: undefined,
      rotation: undefined,
      color: ENDESGA16.lightGray,
    },
  });

  return ent;
}

EM.addSystem(
  "applyWindToSail",
  Phase.GAME_WORLD,
  [SailDef, WorldFrameDef],
  [WindDef],
  (es, res) => {
    for (let e of es) {
      const normal = quat.fwd(e.world.rotation);
      e.sail._billowAmount = V3.dot(normal, res.wind.dir);
      if (e.sail._billowAmount < 0) e.sail._billowAmount = 0;
      e.sail.unfurledAmount = clamp(e.sail.unfurledAmount, e.sail.minFurl, 1.0);
      if (e.sail.unfurledAmount > e.sail.minFurl) {
        e.sail.force = e.sail._billowAmount * e.sail.unfurledAmount;
      } else {
        e.sail.force = 0;
      }
    }
  }
);

EM.addSystem(
  "billowSails",
  Phase.GAME_WORLD,
  [SailDef, RenderableDef],
  [RendererDef],
  (es, { renderer }) => {
    for (let e of es) {
      if (
        Math.abs(e.sail._billowAmount - e.sail._lastSailBillow) < 0.01 &&
        Math.abs(e.sail.unfurledAmount - e.sail._lastSailUnfurl) < 0.01
      )
        // no change
        continue;
      // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
      const m = e.renderable.meshHandle.mesh! as Mesh;
      m.pos.forEach((p, i) => {
        const originalIndex = e.sail.posMap.get(i)!;
        let z = Math.floor(originalIndex / (e.sail.width + 1));
        let parabZ;
        if (e.sail.height % 2 == 0) {
          parabZ = z - e.sail.height / 2;
        } else {
          if (z < e.sail.height / 2) {
            parabZ = z - Math.ceil(e.sail.height / 2);
          } else {
            parabZ = z - Math.floor(e.sail.height / 2);
          }
        }
        p[1] = -(
          e.sail._billowAmount *
          BILLOW_FACTOR *
          e.sail.unfurledAmount *
          (parabZ ** 2 - Math.ceil(e.sail.height / 2) ** 2)
        );
        p[2] = -z * e.sail.unfurledAmount;
      });
      renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
      e.sail._lastSailBillow = e.sail._billowAmount;
      e.sail._lastSailUnfurl = e.sail.unfurledAmount;
    }
  }
);

// EM.addConstraint(["mastForce", "after", "applyWindToSail"]);
// EM.addConstraint(["mastForce", "after", "billow"]);

// UNUSED:
function useWindToTurn(
  us: Frame,
  targetPos: V3,
  windDir: V3,
  outSailRot: quat
) {
  // TODO(@darzu): expensive
  const fwd = tV(0, 0, -1);
  const behind = tV(0, 0, 1);

  const angleToParty = angleBetweenPosXZ(
    us.position,
    us.rotation,
    fwd,
    targetPos
  );
  // turn the tower
  // TODO(@darzu): DEBUGGING:
  // const TURN_SPEED = 0.01;
  const TURN_SPEED = 0.1;
  if (Math.abs(angleToParty) > 0.01) {
    const angleDelta = clamp(angleToParty, -TURN_SPEED, TURN_SPEED);
    // TODO(@darzu): use yaw/pitch/roll
    quat.rotY(us.rotation, angleDelta, us.rotation);
  }

  // set the sail
  const sailFwd = V3.tQuat(behind, us.rotation);
  const angleToWind = angleBetweenXZ(sailFwd, windDir);
  const sailAngle = angleToWind - angleToParty;
  // TODO(@darzu): use yaw/pitch/roll
  quat.rotY(quat.IDENTITY, sailAngle, outSailRot);

  // console.log(`turning by: ${angleBetween}`);
}
