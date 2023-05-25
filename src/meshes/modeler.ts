import { CanvasDef } from "../render/canvas.js";
import { EM, EntityManager, EntityW } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { mathMap } from "../utils/math.js";
import { Ray, RayHit } from "../physics/broadphase.js";
import { AABB, aabbListToStr } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsBroadCollidersDef,
  PhysicsResultsDef,
  PhysicsStateDef,
} from "../physics/nonintersection.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { vec3Dbg, vec3Dbg2 } from "../utils/utils-3d.js";
import { AssetsDef } from "./assets.js";
import { ColorDef, TintsDef } from "../color/color-ecs.js";
import { drawLine, screenPosToRay } from "../utils/utils-game.js";
import { CameraView, CameraComputedDef } from "../camera/camera.js";
import { Phase } from "../ecs/sys_phase.js";

const ENABLED = true;

export const ModelerDef = EM.defineComponent("modeler", () => {
  return {
    clickerEnabled: false,
    currentBoxes: [] as number[],
    latestBoxId: -1,
    mode: "" as "" | "move" | "scale",
  };
});

export const ModelBoxDef = EM.defineComponent("modelBox", () => {
  return true;
});

function registerObjClicker(em: EntityManager) {
  // listen for modeler on/off
  em.registerSystem(
    "modelerOnOff",
    Phase.GAME_PLAYERS,
    null,
    [ModelerDef, InputsDef, CanvasDef],
    (_, res) => {
      if (ENABLED && res.inputs.keyClicks["m"]) {
        res.modeler.clickerEnabled = !res.modeler.clickerEnabled;
        if (res.modeler.clickerEnabled) {
          res.htmlCanvas.unlockMouse();
        } else {
          res.htmlCanvas.shouldLockMouseOnClick = true;
        }
      }
    }
  );

  // look for object clicks
  em.registerSystem(
    "modelerClicks",
    Phase.GAME_PLAYERS,
    null,
    [ModelerDef, CameraComputedDef, InputsDef, PhysicsResultsDef],
    (_, res) => {
      if (!res.modeler.clickerEnabled) return;

      if (res.inputs.lclick) {
        const screenPos: vec2 = res.inputs.mousePos;

        const r = screenPosToRay(screenPos, res.cameraComputed);

        // check for hits
        const hits = res.physicsResults.checkRay(r);

        // TODO(@darzu): this doesn't work
        // console.dir({ screenPos, hits });

        hits.sort((a, b) => a.dist - b.dist);
        const firstHit: RayHit | undefined = hits[0];
        if (firstHit) {
          // TODO(@darzu): this seems pretty hacky and cross cutting
          // increase green
          const e = EM.findEntity(firstHit.id, [ColorDef]);
          if (e) {
            EM.ensureComponentOn(e, TintsDef);
            e.tints.set("select", V(0, 0.2, 0));
            // e.color[1] += 0.1;
          }
        }

        // draw our ray
        const rayDist = firstHit?.dist || 1000;
        const color: vec3 = firstHit ? V(0, 1, 0) : V(1, 0, 0);
        const endPoint = vec3.add(
          r.org,
          vec3.scale(r.dir, rayDist),
          vec3.create()
        );
        drawLine(r.org, endPoint, color);
      }
    }
  );
}

export function registerModeler(em: EntityManager) {
  // create our modeler
  em.addResource(ModelerDef);

  registerObjClicker(em);
  registerAABBBuilder(em);
}

function registerAABBBuilder(em: EntityManager) {
  em.registerSystem(
    "aabbBuilder",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, ModelerDef, AssetsDef],
    (_, res) => {
      // create a new box
      if (res.inputs.keyClicks["b"]) {
        if (res.inputs.keyDowns["shift"]) {
          // export
          const bs = res.modeler.currentBoxes.map((id) => {
            const b = em.findEntity(id, [
              PhysicsStateDef,
              ColliderDef,
              ColorDef,
            ]);
            if (!b) throw `Invalid modeler state`;
            return b;
          });
          const aabbs = bs.map((b) => b._phys.colliders[0].aabb);
          console.log(aabbListToStr(aabbs));
          for (let b of bs) {
            vec3.copy(b.color, [0.3, 0.1, 0.2]);
            b.collider.solid = true;
          }
        } else {
          // create new box
          const b = em.new();
          const lastB = em.findEntity(res.modeler.latestBoxId, [
            PositionDef,
            ScaleDef,
          ]);

          em.ensureComponentOn(b, ModelBoxDef);
          if (lastB) {
            em.ensureComponentOn(
              b,
              ScaleDef,
              vec3.copy(vec3.create(), lastB.scale)
            );
            em.ensureComponentOn(
              b,
              PositionDef,
              vec3.copy(vec3.create(), lastB.position)
            );
          } else {
            em.ensureComponentOn(b, ScaleDef, V(2, 1, 1));
            em.ensureComponentOn(b, PositionDef, V(0, 0, 0));
          }
          em.ensureComponentOn(b, ColorDef, V(0.1, 0.3, 0.2));
          em.ensureComponentOn(
            b,
            RenderableConstructDef,
            res.assets.cube.proto
          );
          em.ensureComponentOn(b, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: res.assets.cube.aabb,
          });

          res.modeler.latestBoxId = b.id;
          res.modeler.currentBoxes.push(b.id);
        }
      }

      // check for mov / scale mode
      if (
        res.inputs.keyDowns["x"] ||
        res.inputs.keyDowns["z"] ||
        res.inputs.keyDowns["y"]
      )
        if (res.inputs.keyDowns["shift"]) res.modeler.mode = "scale";
        else res.modeler.mode = "move";
      else res.modeler.mode = "";

      if (res.modeler.mode === "move" || res.modeler.mode === "scale") {
        const delta = res.inputs.mouseMov[0];
        const dim = res.inputs.keyDowns["x"]
          ? 0
          : res.inputs.keyDowns["y"]
          ? 1
          : 2;

        // do move
        if (res.modeler.mode === "move") {
          const b = em.findEntity(res.modeler.latestBoxId, [PositionDef]);
          if (b) {
            b.position[dim] += delta * 0.1;
          }
        }

        // do scale
        if (res.modeler.mode === "scale") {
          const b = em.findEntity(res.modeler.latestBoxId, [ScaleDef]);
          if (b) {
            const currentSize = b.scale[dim] * 2;
            const newSize = currentSize + delta * 0.1;
            const newScale = newSize / 2;
            b.scale[dim] = newScale;
          }
        }
      }
    }
  );
}
