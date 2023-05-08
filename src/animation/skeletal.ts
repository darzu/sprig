// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?

import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { PositionDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { EaseFn, EASE_LINEAR } from "../utils/util-ease.js";
import { RiggedRenderableDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";

interface QueuedAnimation {
  pose: number;
  t: number;
}

export const PoseDef = EM.defineComponent("pose", (current?: number) => ({
  t: 0,
  current: current || 0,
  queue: [] as QueuedAnimation[],
  repeat: [] as QueuedAnimation[],
}));

onInit(() => {
  EM.registerSystem(
    [PoseDef, RiggedRenderableDef],
    [TimeDef],
    (es, res) => {
      for (let e of es) {
        const rigging = e.riggedRenderable.rigging;
        let poseRot: quat[];
        if (e.pose.queue.length > 0 && e.pose.t >= e.pose.queue[0].t) {
          e.pose.current = e.pose.queue[0].pose;
          e.pose.t = 0;
          e.pose.queue.shift();
        }
        if (e.pose.repeat && e.pose.queue.length == 0) {
          for (let qa of e.pose.repeat) {
            e.pose.queue.push(qa);
          }
        }
        if (e.pose.queue.length == 0) {
          poseRot = rigging.poseRot[e.pose.current];
        } else {
          poseRot = [];
          // TODO: avoid using all these temps
          const current = rigging.poseRot[e.pose.current];
          const next = rigging.poseRot[e.pose.queue[0].pose];
          const r = e.pose.t / e.pose.queue[0].t;
          for (let j = 0; j < rigging.parents.length; j++) {
            poseRot.push(quat.slerp(current[j], next[j], r));
          }
          e.pose.t += res.time.dt;
        }
        const mats = e.riggedRenderable.jointMatrices;
        // first, compute a global transform for each joint
        for (let j = 0; j < rigging.parents.length; j++) {
          assert(rigging.parents[j] <= j, "Non-topo-sorted parents list");
          mat4.fromRotationTranslationScale(
            poseRot[j],
            rigging.jointPos[j],
            rigging.jointScale[j],
            mats[j]
          );
          if (rigging.parents[j] < j) {
            mat4.mul(mats[rigging.parents[j]], mats[j], mats[j]);
          }
        }
        // now, multiply by the inverse bind matrices
        for (let j = 0; j < rigging.parents.length; j++) {
          mat4.mul(mats[j], rigging.inverseBindMatrices[j], mats[j]);
        }
      }
    },
    "pose"
  );
  EM.requireSystem("pose");
});
