import { ColorDef } from "../../color-ecs.js";
import { createRef, defineNetEntityHelper } from "../../em_helpers.js";
import { EM, EntityManager, EntityW } from "../../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../../sprig-matrix.js";
import { onInit } from "../../init.js";
import { InputsDef } from "../../inputs.js";
import { clamp } from "../../math.js";
import { AuthorityDef, MeDef } from "../../net/components.js";
import { ColliderDef } from "../../physics/collider.js";
import { WorldFrameDef } from "../../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../../physics/transform.js";
import { MeshHandle } from "../../render/mesh-pool.js";
import { cloneMesh, mapMeshPositions } from "../../render/mesh.js";
import {
  FLAG_UNLIT,
  RenderDataStdDef,
} from "../../render/pipelines/std-scene.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../../render/renderer-ecs.js";
import { tempMat4, tempQuat, tempVec2, tempVec3 } from "../../temp-pool.js";
import { range } from "../../util.js";
import {
  signedAreaOfTriangle,
  positionAndTargetToOrthoViewProjMatrix,
  vec3Dbg,
} from "../../utils-3d.js";
import { YawPitchDef, yawpitchToQuat } from "../../yawpitch.js";
import { AssetsDef } from "../../assets.js";
import { DarkStarPropsDef, STAR1_COLOR, STAR2_COLOR } from "./darkstar.js";
import { HyperspaceGameState, GameStateDef } from "./hyperspace-gamestate.js";
import {
  BOAT_COLOR,
  PlayerShipLocalDef,
  PlayerShipPropsDef,
} from "./player-ship.js";
import { UVShipDef } from "./uv-ship.js";
import { constructNetTurret, TurretDef } from "../turret.js";
import {
  DEFAULT_SAIL_COLOR,
  getSailMeshArea,
  sailForceAndSignedArea,
} from "./ribsail.js";

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
  (color?: vec3) => color ?? vec3.create()
);

// TODO: we need warnings if you forget to call the buildProps system!
export const { HypMastPropsDef, HypMastLocalDef, createHypMastNow } =
  defineNetEntityHelper(EM, {
    name: "hypMast",
    defaultProps: (shipId?: number) => ({
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
    buildResources: [AssetsDef, MeDef],
    build: (mast, res) => {
      const em: EntityManager = EM;

      em.ensureComponentOn(mast, PositionDef, V(0, 0, 0));

      em.ensureComponentOn(mast, RenderableConstructDef, res.assets.mast.mesh);
      em.ensureComponentOn(mast, PhysicsParentDef, mast.hypMastProps.shipId);
      em.ensureComponentOn(mast, ColorDef, BOAT_COLOR);
      vec3.scale(mast.color, 0.5, mast.color);

      // createRib(mast.id, BOOM_HEIGHT)
      // mast.hypMastLocal.boom1 = createSail();
      // mast.hypMastLocal.boom2 = createSail();

      // const sail1 = TODO; // TODO(@darzu):

      // const sail2 = em.new();
      // em.ensureComponentOn(sail2, PositionDef, V(0, BOOM_HEIGHT, 0));
      // em.ensureComponentOn(
      //   sail2,
      //   RenderableConstructDef,
      //   cloneMesh(res.assets.sail.mesh)
      // );
      // //em.ensureComponentOn(sail2, ScaleDef, [12, 12, 12]);
      // em.ensureComponentOn(sail2, RotationDef);
      // em.ensureComponentOn(sail2, SailColorDef, STAR2_COLOR);
      // em.ensureComponentOn(sail2, ColorDef, DEFAULT_SAIL_COLOR);
      // em.ensureComponentOn(sail2, PhysicsParentDef, mast.id);
      // em.whenEntityHas(
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
      const interactBox = em.new();
      em.ensureComponentOn(
        interactBox,
        PhysicsParentDef,
        mast.hypMastProps.shipId
      );
      em.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
      em.ensureComponentOn(interactBox, ColliderDef, {
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

onInit((em) => {
  em.registerSystem(
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
    },
    "updateMastBoom"
  );

  em.registerSystem(
    [PlayerShipPropsDef, UVShipDef, WorldFrameDef, AuthorityDef],
    [MeDef, GameStateDef],
    (es, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) {
        return;
      }
      for (let ship of es) {
        if (ship.authority.pid !== res.me.pid) continue;
        const stars = em.filterEntities([
          DarkStarPropsDef,
          WorldFrameDef,
          ColorDef,
        ]);
        const sails = [
          ship.playerShipProps.mast()!.hypMastLocal.sail1()!,
          ship.playerShipProps.mast()!.hypMastLocal.sail2()!,
        ];
        for (let sail of sails) {
          const star = stars.find((s) => vec3.equals(s.color, sail.sailColor));
          if (!star) {
            console.warn(
              `No matching star for sail with color ${vec3Dbg(sail.sailColor)}`
            );
            continue;
          }
          //console.log(`Sail force is ${vec3Dbg(sailForce)}`);
          //console.log(`Area of sail from star is ${area}`);

          const shipDirection = V(0, 0, -1);
          vec3.transformQuat(shipDirection, ship.world.rotation, shipDirection);
          const [force, area] = sailForceAndSignedArea(
            sail,
            star.world.position
          );
          const accel = vec3.dot(shipDirection, force);

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
          vec3.lerp(
            DEFAULT_SAIL_COLOR,
            vec3.normalize(star.color),
            clamp((accel / realArea) * 5000, 0, 1),
            sail.color
          );

          ship.uvship.speed += accel * 0.0001;
          //console.log(`Speed is ${ship.ship.speed}`);
        }
      }
    },
    "sail"
  );
});
