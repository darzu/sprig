import { CanvasDef } from "../render/canvas.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { remap } from "../utils/math.js";
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
import { vec3Dbg, vec3Dbg2 } from "../utils/utils-3d.js";
import { AllMeshesDef } from "./mesh-list.js";
import { ColorDef, TintsDef } from "../color/color-ecs.js";
import { drawLine, screenPosToRay } from "../utils/utils-game.js";
import { CameraView, CameraComputedDef } from "../camera/camera.js";
import { Phase } from "../ecs/sys-phase.js";

const ENABLED = true;

export const ModelerDef = EM.defineResource("modeler", () => {
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

function registerObjClicker() {
  // listen for modeler on/off
  EM.addSystem(
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
  EM.addSystem(
    "modelerClicks",
    Phase.GAME_PLAYERS,
    null,
    [ModelerDef, CameraComputedDef, InputsDef, PhysicsResultsDef],
    (_, res) => {
      if (!res.modeler.clickerEnabled) return;

      if (res.inputs.lclick) {
        const screenPos: V2 = res.inputs.mousePos;

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
            EM.set(e, TintsDef);
            e.tints.set("select", V(0, 0.2, 0));
            // e.color[1] += 0.1;
          }
        }

        // draw our ray
        const rayDist = firstHit?.dist || 1000;
        const color: V3 = firstHit ? V(0, 1, 0) : V(1, 0, 0);
        const endPoint = V3.add(r.org, V3.scale(r.dir, rayDist), V3.mk());
        drawLine(r.org, endPoint, color);
      }
    }
  );
}

export function init3DModeler() {
  // create our modeler
  EM.addResource(ModelerDef);

  registerObjClicker();
  registerAABBBuilder();
}

function registerAABBBuilder() {
  EM.addSystem(
    "aabbBuilder",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, ModelerDef, AllMeshesDef],
    (_, res) => {
      // create a new box
      if (res.inputs.keyClicks["b"]) {
        if (res.inputs.keyDowns["shift"]) {
          // export
          const bs = res.modeler.currentBoxes.map((id) => {
            const b = EM.findEntity(id, [
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
            V3.copy(b.color, [0.3, 0.1, 0.2]);
            b.collider.solid = true;
          }
        } else {
          // create new box
          const b = EM.mk();
          const lastB = EM.findEntity(res.modeler.latestBoxId, [
            PositionDef,
            ScaleDef,
          ]);

          EM.set(b, ModelBoxDef);
          if (lastB) {
            EM.set(b, ScaleDef, V3.copy(V3.mk(), lastB.scale));
            EM.set(b, PositionDef, V3.copy(V3.mk(), lastB.position));
          } else {
            EM.set(b, ScaleDef, V(2, 1, 1));
            EM.set(b, PositionDef, V(0, 0, 0));
          }
          EM.set(b, ColorDef, V(0.1, 0.3, 0.2));
          EM.set(b, RenderableConstructDef, res.allMeshes.cube.proto);
          EM.set(b, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: res.allMeshes.cube.aabb,
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
          const b = EM.findEntity(res.modeler.latestBoxId, [PositionDef]);
          if (b) {
            b.position[dim] += delta * 0.1;
          }
        }

        // do scale
        if (res.modeler.mode === "scale") {
          const b = EM.findEntity(res.modeler.latestBoxId, [ScaleDef]);
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
