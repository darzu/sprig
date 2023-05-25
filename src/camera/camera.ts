import { CanvasDef } from "../render/canvas.js";
import {
  Component,
  EM,
  EntityManager,
  EntityW,
  WithComponent,
} from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { max } from "../utils/math.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { RendererWorldFrameDef } from "../render/renderer-ecs.js";
import { computeNewError, reduceError } from "../utils/smoothing.js";
import { tempQuat, tempVec3 } from "../matrix/temp-pool.js";
import { TimeDef } from "../time/time.js";
import { yawpitchToQuat } from "../turret/yawpitch.js";
import { createAABB } from "../physics/aabb.js";
import { assert, dbgDirOnce, resizeArray } from "../utils/util.js";
import { Phase } from "../ecs/sys_phase.js";

export type PerspectiveMode = "perspective" | "ortho";
export type CameraMode = "thirdPerson" | "thirdPersonOverShoulder";

export const CameraDef = EM.defineComponent("camera", () => {
  return {
    perspectiveMode: "perspective" as PerspectiveMode,
    fov: (2 * Math.PI) / 5,
    nearClipDist: 1,
    viewDist: 1000,
    // TODO(@darzu): what r good cascade numbers here?
    // shadowCascades: [1 / 2, 1],
    shadowCascades: [1 / 24, 1],
    targetId: 0,
    maxWorldAABB: createAABB(
      V(-Infinity, -Infinity, -Infinity),
      V(Infinity, Infinity, Infinity)
    ),
    positionOffset: vec3.create(),
    rotationOffset: quat.create(),
    // smoothing:
    prevTargetId: 0,
    lastRotation: quat.create(),
    lastPosition: vec3.create(),
    rotationError: quat.identity(quat.create()),
    targetPositionError: vec3.create(),
    cameraPositionError: vec3.create(),
  };
});
export type CameraProps = Component<typeof CameraDef>;

// TODO(@darzu): maybe make a shortcut for this; "registerTrivialInit" ?
EM.registerInit({
  requireRs: [],
  provideRs: [CameraDef],
  // provideLs: [],
  fn: async () => {
    EM.addResource(CameraDef);
  },
});

export type ShadowCascade = {
  near: number;
  far: number;
  farZ: number;
  // TODO(@darzu): this should probably be renamed so we know this is viewProj from the camera not the light perspective!
  viewProj: mat4;
  invViewProj: mat4;
};

// NOTE: cameraComputed should only have derived values based on properties in camera
// TODO(@darzu): CameraDef also has computed stuff..
export const CameraComputedDef = EM.defineComponent("cameraComputed", () => {
  return {
    aspectRatio: 1,
    width: 100,
    height: 100,
    proj: mat4.create(),
    viewProj: mat4.create(),
    invViewProj: mat4.create(),
    location: vec3.create(),
    shadowCascadeMats: [] as ShadowCascade[],
  };
});
export type CameraView = Component<typeof CameraComputedDef>;

export const CameraFollowDef = EM.defineComponent(
  "cameraFollow",
  (priority = 0) => ({
    positionOffset: vec3.create(),
    yawOffset: 0,
    pitchOffset: 0,
    priority,
  })
);

export const CAMERA_OFFSETS = {
  thirdPerson: V(0, 0, 10),
  // thirdPersonOverShoulder: [1, 3, 2],
  thirdPersonOverShoulder: V(2, 2, 4),
  firstPerson: V(0, 0, 0),
} as const;

export function setCameraFollowPosition(
  c: EntityW<[typeof CameraFollowDef]>,
  mode: keyof typeof CAMERA_OFFSETS
) {
  vec3.copy(c.cameraFollow.positionOffset, CAMERA_OFFSETS[mode]);
}

export function registerCameraSystems(em: EntityManager) {
  em.registerSystem(
    "smoothCamera",
    Phase.PRE_RENDER,
    null,
    [CameraDef, TimeDef],
    function (_, res) {
      reduceError(res.camera.rotationError, res.time.dt);
      reduceError(res.camera.targetPositionError, res.time.dt);
      reduceError(res.camera.cameraPositionError, res.time.dt);
    }
  );

  em.registerSystem(
    "cameraFollowTarget",
    Phase.RENDER,
    [CameraFollowDef],
    [CameraDef],
    (cs, res) => {
      const target = cs.reduce(
        (p, n) =>
          !p || n.cameraFollow.priority > p.cameraFollow.priority ? n : p,
        null as EntityW<[typeof CameraFollowDef]> | null
      );
      if (target) {
        res.camera.targetId = target.id;
        vec3.copy(
          res.camera.positionOffset,
          target.cameraFollow.positionOffset
        );
        yawpitchToQuat(res.camera.rotationOffset, {
          yaw: target.cameraFollow.yawOffset,
          pitch: target.cameraFollow.pitchOffset,
        });
      } else {
        res.camera.targetId = 0;
        vec3.zero(res.camera.positionOffset);
        quat.identity(res.camera.rotationOffset);
      }
    }
  );

  em.registerSystem(
    "retargetCamera",
    Phase.RENDER,
    null,
    [CameraDef],
    function ([], res) {
      if (res.camera.prevTargetId === res.camera.targetId) {
        quat.copy(res.camera.lastRotation, res.camera.rotationOffset);
        vec3.copy(res.camera.lastPosition, res.camera.positionOffset);
        return;
      }
      const prevTarget = em.findEntity(res.camera.prevTargetId, [
        WorldFrameDef,
      ]);
      const newTarget = em.findEntity(res.camera.targetId, [WorldFrameDef])!;
      if (prevTarget && newTarget) {
        computeNewError(
          prevTarget.world.position,
          newTarget.world.position,
          res.camera.targetPositionError
        );
        computeNewError(
          res.camera.lastPosition,
          res.camera.positionOffset,
          res.camera.cameraPositionError
        );

        const computedRotation = quat.mul(
          prevTarget.world.rotation,
          res.camera.lastRotation
        );
        const newComputedRotation = quat.mul(
          newTarget.world.rotation,
          res.camera.rotationOffset
        );

        computeNewError(
          computedRotation,
          newComputedRotation,
          res.camera.rotationError
        );
      }

      res.camera.prevTargetId = res.camera.targetId;
    }
  );

  em.addResource(CameraComputedDef);
  em.registerSystem(
    "updateCameraView",
    Phase.RENDER,
    null,
    [CameraComputedDef, CameraDef, MeDef, CanvasDef],
    (_, resources) => {
      const { cameraComputed, camera, me, htmlCanvas } = resources;

      let targetEnt = em.findEntity(camera.targetId, [RendererWorldFrameDef]);

      if (!targetEnt) return;

      const frame = targetEnt.rendererWorldFrame;

      // update aspect ratio and size
      cameraComputed.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraComputed.width = htmlCanvas.canvas.clientWidth;
      cameraComputed.height = htmlCanvas.canvas.clientHeight;

      let viewMatrix = mat4.tmp();
      if (targetEnt) {
        const computedTranslation = vec3.add(
          frame.position,
          camera.targetPositionError
        );
        mat4.fromRotationTranslationScale(
          frame.rotation,
          computedTranslation,
          frame.scale,
          viewMatrix
        );
        vec3.copy(cameraComputed.location, computedTranslation);
      }

      const computedCameraRotation = quat.mul(
        camera.rotationOffset,
        camera.rotationError
      );

      mat4.mul(
        viewMatrix,
        mat4.fromQuat(computedCameraRotation, mat4.tmp()),
        viewMatrix
      );

      const computedCameraTranslation = vec3.add(
        camera.positionOffset,
        camera.cameraPositionError
      );

      mat4.translate(viewMatrix, computedCameraTranslation, viewMatrix);
      mat4.invert(viewMatrix, viewMatrix);

      if (camera.perspectiveMode === "ortho") {
        const ORTHO_SIZE = 10;
        mat4.ortho(
          -ORTHO_SIZE,
          ORTHO_SIZE,
          -ORTHO_SIZE,
          ORTHO_SIZE,
          -400,
          100,
          cameraComputed.proj
        );
      } else {
        mat4.perspective(
          camera.fov,
          cameraComputed.aspectRatio,
          camera.nearClipDist,
          camera.viewDist,
          cameraComputed.proj
        );
      }
      mat4.mul(cameraComputed.proj, viewMatrix, cameraComputed.viewProj);
      mat4.invert(cameraComputed.viewProj, cameraComputed.invViewProj);

      // compute shadow cascade viewProj matrices
      // TODO(@darzu): properly support ortho?
      resizeArray(
        cameraComputed.shadowCascadeMats,
        camera.shadowCascades.length,
        () => ({
          near: NaN,
          far: NaN,
          farZ: NaN,
          viewProj: mat4.create(),
          invViewProj: mat4.create(),
        })
      );
      let shadowNearFrac = camera.nearClipDist / camera.viewDist;
      for (let i = 0; i < camera.shadowCascades.length; i++) {
        const shadowFarFrac = camera.shadowCascades[i];
        assert(shadowFarFrac <= 1.0);
        const cascade = cameraComputed.shadowCascadeMats[i];
        cascade.near = camera.viewDist * shadowNearFrac;
        cascade.far = camera.viewDist * shadowFarFrac;
        cascade.farZ = vec3.transformMat4(
          [0, 0, -cascade.far],
          cameraComputed.proj
        )[2];

        mat4.perspective(
          camera.fov,
          cameraComputed.aspectRatio,
          cascade.near,
          cascade.far,
          cascade.viewProj
        );
        mat4.mul(cascade.viewProj, viewMatrix, cascade.viewProj);
        mat4.invert(cascade.viewProj, cascade.invViewProj);

        shadowNearFrac = shadowFarFrac;
      }
      // dbgDirOnce(
      //   "cameraComputed.shadowCascadeMats",
      //   cameraComputed.shadowCascadeMats
      // );
    }
  );
  EM.addSystem("updateCameraView", Phase.RENDER);
}
