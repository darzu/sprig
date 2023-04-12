import { AssetsDef } from "../../assets.js";
import { ColorDef } from "../../color-ecs.js";
import { createRef } from "../../em_helpers.js";
import { EM, EntityW } from "../../entity-manager.js";
import {
  PositionDef,
  ScaleDef,
  RotationDef,
  PhysicsParentDef,
} from "../../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  Renderer,
} from "../../render/renderer-ecs.js";
import { quat, V, vec2, vec3 } from "../../sprig-matrix.js";
import { range } from "../../util.js";
import { BOAT_COLOR } from "./player-ship.js";
import { defineNetEntityHelper } from "../../em_helpers.js";
import { MeDef } from "../../net/components.js";
import { WorldFrameDef } from "../../physics/nonintersection.js";
import { MeshHandle } from "../../render/mesh-pool.js";
import { cloneMesh, mapMeshPositions, RawMesh } from "../../render/mesh.js";
import {
  RenderDataStdDef,
  FLAG_UNLIT,
} from "../../render/pipelines/std-scene.js";
import { tempQuat, tempMat4 } from "../../temp-pool.js";
import {
  signedAreaOfTriangle,
  positionAndTargetToOrthoViewProjMatrix,
} from "../../utils-3d.js";
import { STAR1_COLOR, DarkStarPropsDef } from "./darkstar.js";

const RIB_COUNT = 6;
export const DEFAULT_SAIL_COLOR = V(0.05, 0.05, 0.05);

const BOOM_LENGTH = 20;
// const MAST_LENGTH = 40;
// const BOOM_HEIGHT = MAST_LENGTH - BOOM_LENGTH - 2;

export const { RibSailPropsDef, RibSailLocalDef, createRibSailNow } =
  defineNetEntityHelper(EM, {
    name: "ribSail",
    defaultProps: () => ({
      // shipId: shipId ?? 0,
    }),
    serializeProps: (o, buf) => {
      // buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
      // o.shipId = buf.readUint32();
    },
    defaultLocal: () => ({
      // TODO(@darzu): move the ribs into the sail mesh?
      ribs: range(RIB_COUNT).map(() => createRef(0, [RotationDef])),
      // sail: createRef(0, [
      //   RenderableDef,
      //   WorldFrameDef,
      //   // SailColorDef,
      //   ColorDef,
      // ]),
    }),
    dynamicComponents: [RotationDef /*, BoomPitchesDef*/],
    buildResources: [AssetsDef, MeDef],
    build: (sail, res) => {
      // const sail = EM.new();

      EM.ensureComponentOn(sail, PositionDef, V(0, 5, 0));
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
      EM.ensureComponentOn(mast, ColorDef, BOAT_COLOR);
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
        EM.ensureComponentOn(rib, ColorDef, BOAT_COLOR);
        vec3.scale(rib.color, 0.7, rib.color);
        EM.ensureComponentOn(rib, PhysicsParentDef, sail.id);
        return rib;
      }

      return sail;
    },
  });
type RibSail = ReturnType<typeof createRibSailNow>;

export function adjustSail(sail: RibSail, boom: number) {
  sail.ribSailLocal.ribs.forEach((ribRef, i) => {
    const rib = ribRef()!;
    quat.rotateX(quat.IDENTITY, boom * (1 - i / RIB_COUNT), rib.rotation);
  });
}

export function adjustSailVertices(
  renderer: Renderer,
  sailMeshHandle: MeshHandle,
  rotations: quat[]
) {
  rotations.push(quat.identity(tempQuat()));
  mapMeshPositions(sailMeshHandle.mesh!, (pos, i) => {
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
  renderer.stdPool.updateMeshVertices(sailMeshHandle, sailMeshHandle.mesh!);
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
