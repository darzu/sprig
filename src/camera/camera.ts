import { CanvasDef } from "../render/canvas.js";
import { Component, EM, EntityW, Resource } from "../ecs/entity-manager.js";
import { vec3, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { MeDef } from "../net/components.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { RendererWorldFrameDef } from "../render/renderer-ecs.js";
import { computeNewError, reduceError } from "../utils/smoothing.js";
import { TimeDef } from "../time/time.js";
import { createAABB } from "../physics/aabb.js";
import { assert, dbgLogOnce, resizeArray } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
import {
  transformCameraViewForWebGPUsNDC,
  transformYUpModelIntoZUp,
} from "./basis.js";
import { mat4Dbg, quatDbg, vec3Dbg } from "../utils/utils-3d.js";

const VERBOSE_CAMERA = false;

export type PerspectiveMode = "perspective" | "ortho";
export type CameraMode = "thirdPerson" | "thirdPersonOverShoulder";

export const CameraDef = EM.defineResource("camera", () => {
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
    positionOffset: vec3.mk(),
    rotationOffset: quat.create(),
    // smoothing:
    prevTargetId: 0,
    lastRotation: quat.create(),
    lastPosition: vec3.mk(),
    rotationError: quat.identity(quat.create()),
    targetPositionError: vec3.mk(),
    cameraPositionError: vec3.mk(),
  };
});
export type CameraProps = Component<typeof CameraDef>;

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
export const CameraComputedDef = EM.defineResource("cameraComputed", () => {
  return {
    aspectRatio: 1,
    width: 100,
    height: 100,
    proj: mat4.create(),
    viewProj: mat4.create(),
    invViewProj: mat4.create(),
    location: vec3.mk(),
    shadowCascadeMats: [] as ShadowCascade[],
  };
});
export type CameraView = Resource<typeof CameraComputedDef>;

// TODO(@darzu): it'd be great to have standard camera options like BallCam, etc

export const CameraFollowDef = EM.defineComponent(
  "cameraFollow",
  () => ({
    positionOffset: vec3.mk(),
    yawOffset: 0,
    pitchOffset: 0,
    priority: 0,
  }),
  (p, priority = 0) => {
    p.priority = priority;
    return p;
  }
);

export const CAMERA_OFFSETS = {
  thirdPerson: V(0, -10, 0),
  // thirdPersonOverShoulder: [1, 3, 2],
  thirdPersonOverShoulder: V(2, -4, 2),
  firstPerson: V(0, 0, 0),
} as const;

export function setCameraFollowPosition(
  c: EntityW<[typeof CameraFollowDef]>,
  mode: keyof typeof CAMERA_OFFSETS
) {
  vec3.copy(c.cameraFollow.positionOffset, CAMERA_OFFSETS[mode]);
}

// TODO(@darzu): maybe make a shortcut for this; "registerTrivialInit" ?
EM.addLazyInit([], [CameraDef], () => {
  EM.addResource(CameraDef);

  if (VERBOSE_CAMERA) {
    console.log("transformModelIntoZUp mat4:");
    console.log(mat4Dbg(transformYUpModelIntoZUp));
    console.log("transformCameraViewForWebGPUsNDC mat4:");
    console.log(mat4Dbg(transformCameraViewForWebGPUsNDC));
  }

  EM.addSystem(
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

  EM.addSystem(
    "cameraFollowTarget",
    Phase.PRE_RENDER,
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
        quat.fromYawPitchRoll(
          target.cameraFollow.yawOffset,
          target.cameraFollow.pitchOffset,
          0,
          res.camera.rotationOffset
        );
      } else {
        res.camera.targetId = 0;
        vec3.zero(res.camera.positionOffset);
        quat.identity(res.camera.rotationOffset);
      }
    }
  );

  EM.addSystem(
    "retargetCamera",
    Phase.PRE_RENDER,
    null,
    [CameraDef],
    function ([], res) {
      if (res.camera.prevTargetId === res.camera.targetId) {
        quat.copy(res.camera.lastRotation, res.camera.rotationOffset);
        vec3.copy(res.camera.lastPosition, res.camera.positionOffset);
        return;
      }
      if (VERBOSE_CAMERA) console.log(`new camera target`);
      const prevTarget = EM.findEntity(res.camera.prevTargetId, [
        WorldFrameDef,
      ]);
      const newTarget = EM.findEntity(res.camera.targetId, [WorldFrameDef])!;
      if (prevTarget && newTarget) {
        if (VERBOSE_CAMERA) console.log(`retargetting camera`);
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
});

EM.addLazyInit([], [CameraComputedDef], () => {
  EM.addResource(CameraComputedDef);
  EM.addSystem(
    "updateCameraView",
    Phase.RENDER_PRE_DRAW,
    null,
    [CameraComputedDef, CameraDef, MeDef, CanvasDef],
    (_, resources) => {
      const { cameraComputed, camera, me, htmlCanvas } = resources;

      let targetEnt = EM.findEntity(camera.targetId, [RendererWorldFrameDef]);

      if (!targetEnt) return;

      const frame = targetEnt.rendererWorldFrame;

      // update aspect ratio and size
      cameraComputed.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraComputed.width = htmlCanvas.canvas.clientWidth;
      cameraComputed.height = htmlCanvas.canvas.clientHeight;

      // compute the view matrix
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
      // const computedCameraTranslation = camera.positionOffset;
      mat4.translate(viewMatrix, computedCameraTranslation, viewMatrix);
      mat4.invert(viewMatrix, viewMatrix);

      if (VERBOSE_CAMERA) {
        dbgLogOnce(
          `computedCameraTranslation: ${vec3Dbg(computedCameraTranslation)}`
        );
        dbgLogOnce(
          `computedCameraRotation: ${quatDbg(computedCameraRotation)}`
        );
      }

      // view matrix is in Z-up right-handed, we need
      // to convert to Y-up right-handed for WebGPU's NDC
      mat4.mul(transformCameraViewForWebGPUsNDC, viewMatrix, viewMatrix);
      if (VERBOSE_CAMERA) {
        dbgLogOnce(mat4Dbg(viewMatrix));
      }

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
        // TODO(@darzu): break perspective transformation down into perspective + ortho like here:
        //    https://youtu.be/gQiD2Kd6xoE?t=3069
        //    Just cache the matrix for perf.
        /*
        perspective:
        n    0    0    0
        0    n    0    0
        0    0  n+f  -fn (perserve z = n -> z' = n, z = f -> z' = f)
        0    0    1    0
        ortho:
        2/   0    0   -(r+l)/
        r-l            (r-l)
        0    2/   0   -(t+b)/
             t-b       (t-b)
        0    0    2/  -(f+n)/
                  f-n  (f-n)
        0    0    0     1
        
        projM = O*P
        */
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
        // TODO(@darzu): Z_UP: transformations based on the projection?
        const shadowFarFrac = camera.shadowCascades[i];
        assert(shadowFarFrac <= 1.0);
        const cascade = cameraComputed.shadowCascadeMats[i];
        cascade.near = camera.viewDist * shadowNearFrac;
        cascade.far = camera.viewDist * shadowFarFrac;
        cascade.farZ = vec3.tMat4([0, 0, -cascade.far], cameraComputed.proj)[2];

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
});
