import { ColorDef } from "../color.js";
import { createRef, defineNetEntityHelper } from "../em_helpers.js";
import { EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { InputsDef } from "../inputs.js";
import { clamp } from "../math.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { mapMeshPositions } from "../render/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { YawPitchDef, yawpitchToQuat } from "../yawpitch.js";
import { AssetsDef } from "./assets.js";
import { BOAT_COLOR } from "./player-ship.js";
import { constructNetTurret, TurretDef } from "./turret.js";

const BoomPitchesDef = EM.defineComponent(
  "boomPitches",
  () => [Math.PI / 4] as [number]
);
EM.registerSerializerPair(
  BoomPitchesDef,
  (c, writer) => {
    writer.writeFloat32(c[0]);
  },
  (c, reader) => {
    c[0] = reader.readFloat32();
  }
);

export const { MastPropsDef, MastLocalDef, createMastNow } =
  defineNetEntityHelper(EM, {
    name: "mast",
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
      boom: createRef(0, [RotationDef]),
      sail: createRef(0, [RenderableDef]),
    }),
    dynamicComponents: [RotationDef, BoomPitchesDef],
    buildResources: [AssetsDef, MeDef],
    build: (mast, res) => {
      const em: EntityManager = EM;

      em.ensureComponentOn(mast, PositionDef, [0, 0, 0]);

      em.ensureComponentOn(mast, RenderableConstructDef, res.assets.mast.mesh);
      em.ensureComponentOn(mast, PhysicsParentDef, mast.mastProps.shipId);
      em.ensureComponentOn(mast, ColorDef, vec3.clone(BOAT_COLOR));
      vec3.scale(mast.color, mast.color, 0.5);

      const boom = em.newEntity();
      em.ensureComponentOn(boom, PositionDef, [0, 12, 0]);
      em.ensureComponentOn(boom, RenderableConstructDef, res.assets.mast.mesh);
      em.ensureComponentOn(boom, ScaleDef, [0.5, 0.5, 0.5]);
      em.ensureComponentOn(boom, RotationDef);
      em.ensureComponentOn(boom, ColorDef, vec3.clone(BOAT_COLOR));
      vec3.scale(boom.color, boom.color, 0.7);
      em.ensureComponentOn(boom, PhysicsParentDef, mast.id);
      mast.mastLocal.boom = createRef(boom);

      const sail = em.newEntity();
      em.ensureComponentOn(sail, PositionDef, [0, 12, 0]);
      em.ensureComponentOn(sail, RenderableConstructDef, res.assets.sail.mesh);
      //em.ensureComponentOn(sail, ScaleDef, [12, 12, 12]);
      em.ensureComponentOn(sail, RotationDef);
      em.ensureComponentOn(sail, ColorDef, [0.99, 0.99, 0.99]);
      em.ensureComponentOn(sail, PhysicsParentDef, mast.id);
      em.whenEntityHas(sail, RenderableDef).then((sail) => {
        mast.mastLocal.sail = createRef(sail);
      });

      // create seperate hitbox for interacting with the mast
      const interactBox = em.newEntity();
      em.ensureComponentOn(
        interactBox,
        PhysicsParentDef,
        mast.mastProps.shipId
      );
      em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
      em.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: {
          min: vec3.fromValues(-1, -1, -1),
          max: vec3.fromValues(1, 1, 1),
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
        [0, 20, 50]
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
    [MastPropsDef, MastLocalDef, TurretDef, BoomPitchesDef],
    [InputsDef, RendererDef],
    (masts, res) => {
      for (let mast of masts) {
        const boom = mast.mastLocal.boom()!;
        if (mast.turret.mannedId) {
          if (res.inputs.keyDowns["a"]) {
            mast.boomPitches[0] -= Math.PI * 0.005;
          }
          if (res.inputs.keyDowns["d"]) {
            mast.boomPitches[0] += Math.PI * 0.005;
          }
          mast.boomPitches[0] = clamp(
            mast.boomPitches[0],
            Math.PI * 0.03,
            Math.PI / 2
          );
        }
        quat.rotateX(boom.rotation, quat.IDENTITY, mast.boomPitches[0]);

        // update sail
        const sail = mast.mastLocal.sail();
        if (sail) {
          // TODO: "read only mesh," eh? not so much
          mapMeshPositions(
            sail.renderable.meshHandle.readonlyMesh!,
            (pos, i) => {
              if (i == 1) {
                pos[1] = 12;
              } else if (i == 2) {
                vec3.transformQuat(pos, [0, 12, 0], boom.rotation);
              }
              return pos;
            }
          );
          res.renderer.renderer.updateMesh(
            sail.renderable.meshHandle,
            sail.renderable.meshHandle.readonlyMesh!
          );
        }
      }
    },
    "updateMastBoom"
  );
});
