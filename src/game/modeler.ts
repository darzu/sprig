import { CanvasDef } from "../canvas.js";
import { EM, EntityManager } from "../entity-manager.js";
import { mat4, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { mathMap } from "../math.js";
import { Ray, RayHit } from "../phys_broadphase.js";
import { PhysicsResultsDef } from "../phys_esc.js";
import { CameraViewDef, RenderableDef } from "../renderer.js";
import { tempVec } from "../temp-pool.js";
import { vec3Dbg } from "../utils-3d.js";
import { ColorDef } from "./game.js";
import { drawLine } from "./player.js";

export const ModelerDef = EM.defineComponent("modeler", () => {
  return {
    enabled: false,
  };
});

export const CursorDef = EM.defineComponent("cursor3d", () => {
  return true;
});

export function registerModeler(em: EntityManager) {
  // create our modeler
  em.addSingletonComponent(ModelerDef);

  // create our cursor
  {
    const cursor = em.newEntity();
    em.addComponent(cursor.id, CursorDef);
    // em.addComponent(cursor.id, RenderableDef
    // TODO(@darzu): IMPLEMENT 3D CURSOR
  }

  // listen for modeler on/off
  em.registerSystem(
    [],
    [ModelerDef, InputsDef, CanvasDef],
    (_, res) => {
      if (res.inputs.keyClicks["m"]) {
        res.modeler.enabled = !res.modeler.enabled;
        if (res.modeler.enabled) {
          res.htmlCanvas.unlockMouse();
        } else {
          res.htmlCanvas.shouldLockMouse = true;
        }
      }
    },
    "modelerOnOff"
  );

  // look for object clicks
  em.registerSystem(
    [],
    [ModelerDef, CameraViewDef, InputsDef, PhysicsResultsDef],
    (_, res) => {
      if (!res.modeler.enabled) return;

      if (res.inputs.lclick) {
        const invViewProj = mat4.invert(
          mat4.create(),
          res.cameraView.viewProjMat
        );
        // TODO(@darzu): positions need to be moved to 0-1
        const mouseViewX = mathMap(
          res.inputs.mousePosX,
          0,
          res.cameraView.width,
          -1,
          1
        );
        const mouseViewY =
          mathMap(res.inputs.mousePosY, 0, res.cameraView.height, -1, 1) * -1;
        const mousePos0: vec3 = [mouseViewX, mouseViewY, 0];
        const mousePos1: vec3 = [mouseViewX, mouseViewY, 0.5];

        console.log(vec3Dbg(mousePos0));

        const ray0 = vec3.transformMat4(vec3.create(), mousePos0, invViewProj);
        const ray1 = vec3.transformMat4(vec3.create(), mousePos1, invViewProj);

        const dir: vec3 = vec3.sub(vec3.create(), ray1, ray0);
        vec3.normalize(dir, dir);

        const r: Ray = {
          org: ray0,
          dir,
        };

        // check for hits
        const hits = res.physicsResults.checkRay(r);

        hits.sort((a, b) => a.dist - b.dist);
        const firstHit: RayHit | undefined = hits[0];
        if (firstHit) {
          // TODO(@darzu): this seems pretty hacky and cross cutting
          // increase green
          const e = EM.findEntity(firstHit.id, [ColorDef]);
          if (e) {
            e.color[1] += 0.1;
          }
        }

        // draw our ray
        const rayDist = firstHit?.dist || 1000;
        const color: vec3 = firstHit ? [0, 1, 0] : [1, 0, 0];
        const endPoint = vec3.add(
          vec3.create(),
          r.org,
          vec3.scale(tempVec(), r.dir, rayDist)
        );
        drawLine(EM, r.org, endPoint, color);
      }
    },
    "modelerClicks"
  );
}
