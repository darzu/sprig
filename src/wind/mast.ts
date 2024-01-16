import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, Resources } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { defineObj, T } from "../graybox/objects.js";
import { InputsDef } from "../input/inputs.js";
import { V, mat3, quat, tV, vec3 } from "../matrix/sprig-matrix.js";
import { MastMesh } from "../meshes/mesh-list.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { drawUpdatingVector } from "../utils/util-vec-dbg.js";
import { assert, dbgOnce } from "../utils/util.js";
import { SailDef, createSail } from "./sail.js";
import { WindDef } from "./wind.js";

const MIN_SPEED = 0.0001;
const MAX_SPEED = 10.0;
const VELOCITY_DRAG = 30.0; // squared drag factor
// const VELOCITY_DECAY = 0.995; // linear decay scalar
const SAIL_ACCEL_RATE = 0.001;

const DBG_MAST = false;

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

export const HasMastObj = defineObj({
  name: "hasMast",
  components: [],
  physicsParentChildren: true,
  children: {
    mast: [MastDef, RotationDef],
  },
} as const);
export const HasMastDef = HasMastObj.props;

export function createMast(
  res: Resources<[typeof MeDef, typeof MastMesh.def]>
) {
  const sailWidth = 14;
  const sail = createSail(sailWidth, 8, 2);
  sail.position[0] = -sailWidth;
  sail.position[1] = 0.51;
  sail.position[2] = 38;

  const mesh = res.mesh_mast;

  const ent = MastObj.new({
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

EM.addEagerInit([MastDef], [], [], () => {
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

  EM.addSystem(
    "autoTurnMast",
    Phase.GAME_PLAYERS,
    [HasMastDef, WorldFrameDef],
    [InputsDef, WindDef],
    (es, res) => {
      if (es.length == 0) return;
      assert(es.length === 1);
      const ship = es[0];
      const mast = ship.hasMast.mast;

      // TODO(@darzu): Debugging
      if (dbgOnce("windOnMast")) {
        assert(WorldFrameDef.isOn(mast));
        if (DBG_MAST)
          drawUpdatingVector(res.wind.dir, {
            origin: vec3.add(mast.world.position, V(0, 0, 30)),
            scale: 20,
            // parentId: mast.id,
            color: ENDESGA16.yellow,
          });

        // addVecUpdatingDbgVis(V(0, 1, 0), {
        //   origin: V(0, 0, 0),
        //   scale: 20,
        //   parentId: mast.id,
        // });
      }

      // TODO(@darzu): DBGING
      // console.log(`wind.dir: ${vec3Dbg(res.wind.dir)}`);

      // console.log(`MAST: ${quatDbg(mast.rotation)}`);

      // const rudder = ship.ld52ship.rudder()!;

      // const shipDir = vec3.transformQuat(V(0, 0, 1), shipWorld.world.rotation);

      const invShip = mat3.invert(mat3.fromMat4(ship.world.transform));
      const windLocalDir = vec3.transformMat3(res.wind.dir, invShip);
      const shipLocalDir = vec3.FWD;

      const optimalSailLocalDir = vec3.normalize(
        vec3.add(windLocalDir, shipLocalDir)
      );

      // console.log(`ship to wind: ${vec3.dot(windLocalDir, shipLocalDir)}`);

      // const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
      // e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
      // sail.force * vec3.dot(AHEAD_DIR, normal);

      // const currSailForce =

      // need to maximize: dot(wind, sail) * dot(sail, ship)

      // TODO(@darzu): ANIMATE SAIL TOWARD WIND
      if (vec3.dot(optimalSailLocalDir, shipLocalDir) > 0.01) {
        quat.fromForwardAndUpish(optimalSailLocalDir, vec3.UP, mast.rotation);
      }
    }
  );

  EM.addSystem(
    "mastPush",
    Phase.GAME_WORLD,
    [HasMastDef, WorldFrameDef, RotationDef, LinearVelocityDef],
    [],
    (es) => {
      for (let e of es) {
        // acceleration
        const direction = vec3.transformQuat(vec3.FWD, e.world.rotation);
        const sailAccel = vec3.scale(
          direction,
          e.hasMast.mast.mast.force * SAIL_ACCEL_RATE
        );
        const linVelMag = vec3.length(e.linearVelocity);
        const velDrag = linVelMag * linVelMag * VELOCITY_DRAG;
        const dragForce = vec3.scale(vec3.negate(e.linearVelocity), velDrag);
        // console.log(
        //   `sail: ${vec3Dbg(vec3.scale(sailAccel, 100))}\n` +
        //     `drag: ${vec3Dbg(vec3.scale(dragForce, 100))}`
        // );
        const accel = vec3.add(sailAccel, dragForce);
        vec3.add(e.linearVelocity, accel, e.linearVelocity);
        // vec3.scale(e.linearVelocity, VELOCITY_DECAY, e.linearVelocity);
        //console.log(`ship speed is ${vec3.length(e.linearVelocity)}`);
        if (vec3.length(e.linearVelocity) > MAX_SPEED) {
          vec3.normalize(e.linearVelocity, e.linearVelocity);
          vec3.scale(e.linearVelocity, MAX_SPEED, e.linearVelocity);
        }
        if (vec3.length(e.linearVelocity) < MIN_SPEED) {
          // TODO: make this better
          const sail = e.hasMast.mast.mast.sail.sail;
          if (sail.unfurledAmount > sail.minFurl) {
            vec3.scale(vec3.FWD, MIN_SPEED, e.linearVelocity);
          } else {
            vec3.set(0, 0, 0, e.linearVelocity);
          }
        }
      }
    }
  );
});
