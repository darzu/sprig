import { EM, EntityW } from "../ecs/entity-manager.js";
import { ComponentDef } from "../ecs/em-components.js";
import { Mesh } from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererWorldFrameDef,
} from "../render/renderer-ecs.js";
import {
  PositionDef,
  updateFrameFromPosRotScale,
} from "../physics/transform.js";
import { BallMesh } from "../meshes/mesh-list.js";
import { ColorDef } from "../color/color-ecs.js";
import { assert } from "../utils/util.js";
import { CameraComputedDef } from "../camera/camera.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { RayHit } from "../physics/broadphase.js";
import { createRef, Ref } from "../ecs/em-helpers.js";
import { screenPosToRay } from "../utils/utils-game.js";
import { Phase } from "../ecs/sys-phase.js";

// TODO(@darzu): does global 3d cursor stuff still work??

export const GlobalCursor3dDef = EM.defineResource("globalCursor3d", () => {
  return {
    cursor: createRef(0, [Cursor3dDef, WorldFrameDef, RenderableDef]),
  };
});

export const Cursor3dDef = EM.defineComponent("cursor3d", () => ({
  hitId: 0,
  maxDistance: 100,
}));

EM.addLazyInit([BallMesh.def], [GlobalCursor3dDef], async (res) => {
  {
    console.log(`init global cursor`);
    const cursor = EM.mk();
    EM.set(cursor, Cursor3dDef);
    EM.set(cursor, PositionDef);
    // TODO(@darzu): support wireframe
    // const wireframe: Mesh = { ...res.allMeshes.ball.mesh, tri: [] };
    const wireframe: Mesh = res.mesh_ball.mesh;
    EM.set(cursor, RenderableConstructDef, wireframe, false);
    EM.set(cursor, ColorDef, V(0, 1, 1));
    const builtCursor = await EM.whenEntityHas(
      cursor,
      Cursor3dDef,
      WorldFrameDef,
      RenderableDef
    );
    const globalCursor = EM.addResource(GlobalCursor3dDef);
    globalCursor.cursor = createRef(builtCursor);
  }

  EM.addSystem(
    "placeCursorAtScreenCenter",
    Phase.PRE_READ_INPUT,
    [Cursor3dDef, PositionDef, ColorDef],
    [CameraComputedDef, PhysicsResultsDef],
    (cs, res) => {
      if (!cs.length) return;
      const c = cs[0];
      assert(cs.length === 1, "we only support one cursor right now");

      // shoot a ray from screen center to figure out where to put the cursor
      const screenMid: V2 = V2.clone([
        res.cameraComputed.width * 0.5,
        res.cameraComputed.height * 0.4,
      ]);
      const r = screenPosToRay(screenMid, res.cameraComputed);
      let cursorDistance = c.cursor3d.maxDistance;

      // if we hit something with that ray, put the cursor there
      const hits = res.physicsResults.checkRay(r);
      let nearestHit: RayHit = { dist: c.cursor3d.maxDistance, id: -1 };
      if (hits.length) {
        nearestHit = hits.reduce(
          (p, n) => (n.dist < p.dist ? n : p),
          nearestHit
        );
      }
      if (nearestHit.dist < c.cursor3d.maxDistance) {
        cursorDistance = nearestHit.dist;
        V3.copy(c.color, [0, 1, 0]);

        // remember what we hit
        c.cursor3d.hitId = nearestHit.id;
      } else {
        V3.copy(c.color, [0, 1, 1]);
        c.cursor3d.hitId = 0;
      }

      // place the cursor
      // place the cursor
      V3.add(r.org, V3.scale(r.dir, cursorDistance), c.position);

      // NOTE/HACK: since the cursor is updated after the render view is updated, we need
      //    to update it's world frame ourselves
      if (RendererWorldFrameDef.isOn(c)) {
        V3.copy(c.rendererWorldFrame.position, c.position);
        updateFrameFromPosRotScale(c.rendererWorldFrame);
      }
    }
  );
});
