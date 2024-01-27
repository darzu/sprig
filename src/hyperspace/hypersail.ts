import { ColorDef } from "../color/color-ecs.js";
import { createRef, defineNetEntityHelper } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { V3, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { clamp } from "../utils/math.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { DarkStarPropsDef } from "./darkstar.js";
import { HyperspaceGameState, HSGameStateDef } from "./hyperspace-gamestate.js";
import { HsShipPropsDef } from "./hyperspace-ship.js";
import { UVShipDef } from "./uv-ship.js";
import { constructNetTurret, TurretDef } from "../turret/turret.js";
import {
  DEFAULT_SAIL_COLOR,
  getSailMeshArea,
  sailForceAndSignedArea,
} from "./ribsail.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys-phase.js";

// TODO(@darzu): refactor this so that our towers can use this

const BoomPitchesDef = EM.defineComponent("boomPitches", () => ({
  boom1: Math.PI / 4,
  boom2: Math.PI / 4,
}));
EM.registerSerializerPair(
  BoomPitchesDef,
  (c, writer) => {
    writer.writeFloat32(c.boom1);
    writer.writeFloat32(c.boom2);
  },
  (c, reader) => {
    c.boom1 = reader.readFloat32();
    c.boom2 = reader.readFloat32();
  }
);

const SailColorDef = EM.defineComponent(
  "sailColor",
  () => V3.mk(),
  (p, color?: V3) => (color ? V3.copy(p, color) : p)
);

// TODO: we need warnings if you forget to call the buildProps system!
export const { HypMastPropsDef, HypMastLocalDef, createHypMastNow } =
  defineNetEntityHelper({
    name: "hypMast",
    defaultProps: () => ({
      shipId: 0,
    }),
    updateProps: (p, shipId?: number) =>
      Object.assign(p, {
        shipId: shipId ?? 0,
      }),
    serializeProps: (o, buf) => {
      buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
      o.shipId = buf.readUint32();
    },
    defaultLocal: () => ({
      // boom1: createSailRefs(),
      // boom2: createSailRefs(),
      sail1: createRef(0, [
        RenderableDef,
        WorldFrameDef,
        SailColorDef,
        ColorDef,
      ]),
      sail2: createRef(0, [
        RenderableDef,
        WorldFrameDef,
        SailColorDef,
        ColorDef,
      ]),
    }),
    dynamicComponents: [RotationDef, BoomPitchesDef],
    buildResources: [AllMeshesDef, MeDef],
    build: (mast, res) => {
      EM.set(mast, PositionDef, V(0, 0, 0));

      EM.set(mast, RenderableConstructDef, res.allMeshes.mast.mesh);
      EM.set(mast, PhysicsParentDef, mast.hypMastProps.shipId);
      EM.set(mast, ColorDef, ENDESGA16.lightBrown);
      V3.scale(mast.color, 0.5, mast.color);

      // createRib(mast.id, BOOM_HEIGHT)
      // mast.hypMastLocal.boom1 = createSail();
      // mast.hypMastLocal.boom2 = createSail();

      // const sail1 = TODO; // TODO(@darzu):

      // const sail2 = EM.new();
      // EM.set(sail2, PositionDef, V(0, BOOM_HEIGHT, 0));
      // EM.set(
      //   sail2,
      //   RenderableConstructDef,
      //   cloneMesh(res.allMeshes.sail.mesh)
      // );
      // //EM.set(sail2, ScaleDef, [12, 12, 12]);
      // EM.set(sail2, RotationDef);
      // EM.set(sail2, SailColorDef, STAR2_COLOR);
      // EM.set(sail2, ColorDef, DEFAULT_SAIL_COLOR);
      // EM.set(sail2, PhysicsParentDef, mast.id);
      // EM.whenEntityHas(
      //   sail2,
      //   RenderDataStdDef,
      //   RenderableDef,
      //   WorldFrameDef,
      //   SailColorDef,
      //   ColorDef
      // ).then((sail2) => {
      //   sail2.renderDataStd.flags |= FLAG_UNLIT;
      //   mast.hypMastLocal.sail2 = createRef(sail2);
      // });

      // create seperate hitbox for interacting with the mast
      const interactBox = EM.new();
      EM.set(interactBox, PhysicsParentDef, mast.hypMastProps.shipId);
      EM.set(interactBox, PositionDef, V(0, 0, 0));
      EM.set(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: {
          min: V(-1, -1, -1),
          max: V(1, 1, 1),
        },
      });
      // TODO: setting the yawFactor to -1 is kind of hacky
      constructNetTurret(
        mast,
        0,
        0,
        interactBox,
        Math.PI,
        -Math.PI / 8,
        -1,
        V(0, 20, 50)
      );

      mast.turret.maxPitch = 0;
      mast.turret.minPitch = 0;
      mast.turret.maxYaw = Math.PI / 2;
      mast.turret.minYaw = -Math.PI / 2;

      return mast;
    },
  });

export function registerHypersailSystems() {
  EM.addSystem(
    "updateMastBoom",
    Phase.GAME_PLAYERS,
    [HypMastPropsDef, HypMastLocalDef, TurretDef, BoomPitchesDef],
    [InputsDef, RendererDef],
    (masts, res) => {
      for (let mast of masts) {
        if (mast.turret.mannedId) {
          if (res.inputs.keyDowns["q"]) {
            mast.boomPitches.boom1 -= Math.PI * 0.005;
          }
          if (res.inputs.keyDowns["a"]) {
            mast.boomPitches.boom1 += Math.PI * 0.005;
          }
          if (res.inputs.keyDowns["w"]) {
            mast.boomPitches.boom2 -= Math.PI * 0.005;
          }
          if (res.inputs.keyDowns["s"]) {
            mast.boomPitches.boom2 += Math.PI * 0.005;
          }
          mast.boomPitches.boom1 = clamp(
            mast.boomPitches.boom1,
            0,
            (2 * Math.PI) / 3
          );
          mast.boomPitches.boom2 = clamp(
            mast.boomPitches.boom2,
            0,
            (2 * Math.PI) / 3
          );
        }

        // TODO(@darzu): IMPL
        // todo update ribs
        // mast.hypMastLocal.boom1.forEach((ribRef, i) => {
        //   const rib = ribRef()!;
        //   quat.rotateX(
        //     quat.IDENTITY,
        //     mast.boomPitches.boom1 * (1 - i / RIB_COUNT),
        //     rib.rotation
        //   );
        // });
        // mast.hypMastLocal.boom2.forEach((ribRef, i) => {
        //   const rib = ribRef()!;
        //   quat.rotateY(quat.IDENTITY, Math.PI, rib.rotation);
        //   quat.rotateX(
        //     rib.rotation,
        //     mast.boomPitches.boom2 * (1 - i / RIB_COUNT),
        //     rib.rotation
        //   );
        // });

        // update sails
        // TODO(@darzu): IMPL
        // todo update sails

        // const sail1 = mast.hypMastLocal.sail1();
        // if (sail1)
        //   adjustSailVertices(
        //     sail1.renderable.meshHandle,
        //     mast.hypMastLocal.boom1.map((b) => b()!.rotation)
        //   );
        // const sail2 = mast.hypMastLocal.sail2();
        // if (sail2)
        //   adjustSailVertices(
        //     sail2.renderable.meshHandle,
        //     mast.hypMastLocal.boom2.map((b) => b()!.rotation)
        //   );
      }
    }
  );

  EM.addSystem(
    "sail",
    Phase.GAME_PLAYERS,
    [HsShipPropsDef, UVShipDef, WorldFrameDef, AuthorityDef],
    [MeDef, HSGameStateDef],
    (es, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) {
        return;
      }
      for (let ship of es) {
        if (ship.authority.pid !== res.me.pid) continue;
        const stars = EM.filterEntities([
          DarkStarPropsDef,
          WorldFrameDef,
          ColorDef,
        ]);
        const sails = [
          ship.hsShipProps.mast()!.hypMastLocal.sail1()!,
          ship.hsShipProps.mast()!.hypMastLocal.sail2()!,
        ];
        for (let sail of sails) {
          const star = stars.find((s) => V3.equals(s.color, sail.sailColor));
          if (!star) {
            console.warn(
              `No matching star for sail with color ${vec3Dbg(sail.sailColor)}`
            );
            continue;
          }
          //console.log(`Sail force is ${vec3Dbg(sailForce)}`);
          //console.log(`Area of sail from star is ${area}`);

          const shipDirection = V(0, 0, -1);
          V3.tQuat(shipDirection, ship.world.rotation, shipDirection);
          const [force, area] = sailForceAndSignedArea(
            sail,
            star.world.position
          );
          const accel = V3.dot(shipDirection, force);

          const realArea = Math.abs(
            getSailMeshArea(sail.renderable.meshHandle.mesh!.pos)
          );

          // console.log(
          //   `Color lerp is ${
          //     accel / realArea
          //   }, realArea ${realArea}, accel ${accel}`
          // );

          // console.log(
          //   `Color lerp is ${
          //     accel / realArea
          //   }, realArea ${realArea}, accel ${accel}`
          // );
          V3.lerp(
            DEFAULT_SAIL_COLOR,
            V3.norm(star.color),
            clamp((accel / realArea) * 5000, 0, 1),
            sail.color
          );

          ship.uvship.speed += accel * 0.0001;
          //console.log(`Speed is ${ship.ship.speed}`);
        }
      }
    }
  );
}
