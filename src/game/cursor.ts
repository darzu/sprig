import { ComponentDef, EM, EntityManager, EntityW } from "../entity-manager.js";
import { Mesh } from "../render/mesh-pool.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import { PositionDef } from "../physics/transform.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "../color.js";
import { assert } from "../test.js";
import { CameraViewDef } from "../camera.js";
import { vec2, vec3 } from "../gl-matrix.js";
import { screenPosToRay } from "./modeler.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { RayHit } from "../physics/broadphase.js";
import { tempVec } from "../temp-pool.js";
import { createRef, Ref } from "../em_helpers.js";

export const GlobalCursor3dDef = EM.defineComponent("globalCursor3d", () => {
  return {
    cursor: createRef(0, [Cursor3dDef, WorldFrameDef]),
  };
});

export const Cursor3dDef = EM.defineComponent("cursor3d", () => ({
  hitId: 0,
}));

export function registerCursorSystems(em: EntityManager) {
  em.addSingletonComponent(GlobalCursor3dDef);

  em.registerSystem(
    null,
    [GlobalCursor3dDef, AssetsDef],
    (_, res) => {
      if (res.globalCursor3d.cursor.id === 0) {
        const cursor = em.newEntity();
        const id = cursor.id;
        em.addComponent(id, Cursor3dDef);
        em.addComponent(id, PositionDef);
        const wireframe: Mesh = { ...res.assets.ball.mesh, tri: [] };
        em.addComponent(
          id,
          RenderableConstructDef,
          wireframe,
          true,
          undefined,
          [0, 1, 1]
        );
        res.globalCursor3d.cursor = createRef(id, [Cursor3dDef, WorldFrameDef]);
      }
    },
    "buildCursor"
  );

  em.registerSystem(
    [Cursor3dDef, PositionDef, RenderableDef],
    [CameraViewDef, PhysicsResultsDef],
    (cs, res) => {
      if (!cs.length) return;
      const c = cs[0];
      assert(cs.length === 1, "we only support one cursor right now");

      // shoot a ray from screen center to figure out where to put the cursor
      const screenMid: vec2 = [
        res.cameraView.width * 0.5,
        res.cameraView.height * 0.4,
      ];
      const r = screenPosToRay(screenMid, res.cameraView);
      let cursorDistance = 100;

      // if we hit something with that ray, put the cursor there
      const hits = res.physicsResults.checkRay(r);
      let nearestHit: RayHit = { dist: Infinity, id: -1 };
      if (hits.length) {
        nearestHit = hits.reduce(
          (p, n) => (n.dist < p.dist ? n : p),
          nearestHit
        );
        cursorDistance = nearestHit.dist;
        vec3.copy(c.renderable.lineColor, [0, 1, 0]);

        // remember what we hit
        c.cursor3d.hitId = nearestHit.id;
      } else {
        vec3.copy(c.renderable.lineColor, [0, 1, 1]);
        c.cursor3d.hitId = 0;
      }

      // place the cursor
      vec3.add(c.position, r.org, vec3.scale(tempVec(), r.dir, cursorDistance));
    },
    "placeCursorAtScreenCenter"
  );
}
