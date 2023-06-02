import { AllMeshesDef } from "../meshes/meshes";
import { ColorDef } from "../color/color-ecs.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import {
  PositionDef,
  ScaleDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { quat, V, vec2, vec3 } from "../matrix/sprig-matrix.js";
import { range } from "../utils/util.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { MeDef } from "../net/components.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { cloneMesh, mapMeshPositions } from "../meshes/mesh.js";
import { RenderDataStdDef, FLAG_UNLIT } from "../render/pipelines/std-scene.js";
import { tempQuat, tempMat4 } from "../matrix/temp-pool.js";
import {
  signedAreaOfTriangle,
  positionAndTargetToOrthoViewProjMatrix,
} from "../utils/utils-3d.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys-phase.js";

const RIB_COUNT = 6;
export const DEFAULT_SAIL_COLOR = V(0.05, 0.05, 0.05);

const BOOM_LENGTH = 20;
// const MAST_LENGTH = 40;
// const BOOM_HEIGHT = MAST_LENGTH - BOOM_LENGTH - 2;

export const { RibSailPropsDef, RibSailLocalDef, createRibSailNow } =
  defineNetEntityHelper({
    name: "ribSail",
    defaultProps: () => ({
      // pitch: Math.PI / 2,
    }),
    serializeProps: (o, buf) => {
      // buf.writeFloat32(o.pitch);
    },
    deserializeProps: (o, buf) => {
      // o.pitch = buf.readFloat32();
    },
    defaultLocal: () => ({
      // TODO(@darzu): move the ribs into the sail mesh?
      pitch: Math.PI / 2,
      _lastPitch: NaN,

      ribs: range(RIB_COUNT).map(() => createRef(0, [RotationDef])),
      // sail: createRef(0, [
      //   RenderableDef,
      //   WorldFrameDef,
      //   // SailColorDef,
      //   ColorDef,
      // ]),
    }),
    dynamicComponents: [RotationDef /*, BoomPitchesDef*/],
    buildResources: [AllMeshesDef, MeDef],
    build: (sail, res) => {
      // const sail = EM.new();

      EM.ensureComponentOn(sail, PositionDef, V(0, 0, 0));
      // EM.ensureComponentOn(sail, PositionDef, V(0, 0, 0));
      EM.ensureComponentOn(
        sail,
        RenderableConstructDef,
        cloneMesh(res.assets.sail.mesh)
      );
      //EM.ensureComponentOn(sail1, ScaleDef, [12, 12, 12]);
      EM.ensureComponentOn(sail, RotationDef);
      // EM.ensureComponentOn(sail, SailColorDef, STAR1_COLOR);
      EM.ensureComponentOn(sail, ColorDef, DEFAULT_SAIL_COLOR);
      // EM.ensureComponentOn(sail, PhysicsParentDef, mast.id);
      EM.whenEntityHas(
        sail,
        RenderDataStdDef
        // RenderableDef,
        // WorldFrameDef,
        // SailColorDef,
        // ColorDef
      ).then((sail1) => {
        sail1.renderDataStd.flags |= FLAG_UNLIT;
        // mast.hypMastLocal.sail1 = createRef(sail1);
      });

      const mast = EM.new();

      EM.ensureComponentOn(mast, PositionDef, V(0, -20, 0));
      EM.ensureComponentOn(mast, ScaleDef, V(0.5, 1.0, 0.5));
      EM.ensureComponentOn(mast, RenderableConstructDef, res.assets.mast.mesh);
      EM.ensureComponentOn(mast, PhysicsParentDef, sail.id);
      EM.ensureComponentOn(mast, ColorDef, ENDESGA16.lightBrown);
      vec3.scale(mast.color, 0.5, mast.color);

      sail.ribSailLocal.ribs = range(RIB_COUNT).map((i) => {
        const isEnd = i === 0;
        const width = isEnd ? 1 : 0.7;
        return createRef(createRib(width));
      });

      function createRib(width: number) {
        const rib = EM.new();
        EM.ensureComponentOn(rib, PositionDef);
        EM.ensureComponentOn(rib, RenderableConstructDef, res.assets.mast.mesh);
        EM.ensureComponentOn(rib, ScaleDef, V(0.5 * width, 0.5, 0.5 * width));
        EM.ensureComponentOn(rib, RotationDef);
        EM.ensureComponentOn(rib, ColorDef, ENDESGA16.lightBrown);
        vec3.scale(rib.color, 0.7, rib.color);
        EM.ensureComponentOn(rib, PhysicsParentDef, sail.id);
        return rib;
      }

      return sail;
    },
  });
type RibSail = ReturnType<typeof createRibSailNow>;

export function registerRibSailSystems() {
  EM.addSystem(
    `updateRibSail`,
    Phase.GAME_WORLD,
    [RibSailLocalDef, RenderableDef],
    [RendererDef],
    (cs, res) => {
      for (let sail of cs) {
        if (sail.ribSailLocal.pitch === sail.ribSailLocal._lastPitch) continue;

        sail.ribSailLocal.ribs.forEach((ribRef, i) => {
          const rib = ribRef()!;
          quat.rotateX(
            quat.IDENTITY,
            sail.ribSailLocal.pitch * (1 - i / RIB_COUNT),
            rib.rotation
          );
        });

        const rotations = sail.ribSailLocal.ribs.map((b) => b()!.rotation);

        rotations.push(quat.identity(tempQuat()));
        mapMeshPositions(sail.renderable.meshHandle.mesh!, (pos, i) => {
          const ribIndex = Math.floor(i / 3);
          const ribRotationBot = rotations[ribIndex];
          const ribRotationTop = rotations[ribIndex + 1];
          if (i % 3 == 1) {
            vec3.transformQuat([0, BOOM_LENGTH * 0.9, 0], ribRotationTop, pos);
          } else if (i % 3 == 2) {
            vec3.transformQuat([0, BOOM_LENGTH * 0.99, 0], ribRotationBot, pos);
          }
          return pos;
        });
        res.renderer.renderer.stdPool.updateMeshVertices(
          sail.renderable.meshHandle,
          sail.renderable.meshHandle.mesh!
        );

        sail.ribSailLocal._lastPitch = sail.ribSailLocal.pitch;
      }
    }
  );
  // TODO(@darzu): only require this if one exists?
}

// HACK: ASSUMES MESH IS assets.sail.mesh
export function getSailMeshArea(verts: vec3[]) {
  // TODO(@darzu): generalize this for different mesh? Or create the mesh and type it?
  return (
    signedAreaOfTriangle(
      vec2.fromValues(verts[0][1], verts[0][2]),
      vec2.fromValues(verts[1][1], verts[1][2]),
      vec2.fromValues(verts[2][1], verts[2][2])
    ) * RIB_COUNT
  );
}

export function sailForceAndSignedArea(
  sail: EntityW<[typeof RenderableDef, typeof WorldFrameDef]>,
  starPos: vec3
): [vec3, number] {
  const viewProjMatrix = positionAndTargetToOrthoViewProjMatrix(
    tempMat4(),
    starPos,
    sail.world.position
  );

  const localVerts = sail.renderable.meshHandle.mesh!.pos;

  const worldVerts = localVerts.map((pos) => {
    return vec3.transformMat4(pos, sail.world.transform);
  });

  const starViewVerts = worldVerts.map((pos) => {
    return vec3.transformMat4(pos, viewProjMatrix);
  });

  const area = getSailMeshArea(starViewVerts);

  const sailNormal = vec3.cross(
    vec3.sub(worldVerts[1], worldVerts[0]),
    vec3.sub(worldVerts[2], worldVerts[0])
  );

  vec3.normalize(sailNormal, sailNormal);
  return [vec3.scale(sailNormal, area, sailNormal), area];
}
