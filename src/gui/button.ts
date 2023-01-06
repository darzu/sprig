import { ColorDef } from "../color-ecs.js";
import { EM, EntityW } from "../entity-manager.js";
import { GameMesh, gameMeshFromMesh } from "../game/assets.js";
import { gameplaySystems } from "../game/game.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { importObj } from "../import_obj.js";
import { InputsDef } from "../inputs.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { scaleMesh } from "../render/mesh.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { UICursorDef } from "../game/game-font.js";

// TODO(@darzu): this should really go in assets.ts to follow the current patern.
//    BUT I'm disatisfied with the current pattern. Subsystems should be able to
//    own their own asset stuff. TODO: decentralize assets.ts?
const BTN_OBJ = `
# sprigland exported mesh (8 verts, 0 faces)
v 0.85 0.00 -4.00
v -4.00 0.00 -4.00
v -4.00 0.00 4.00
v 0.85 0.00 4.00
v 2.50 0.00 2.72
v 2.37 0.00 -2.97
v -5.64 0.00 -2.72
v -5.64 0.00 3.17
f 1// 2// 3// 4//
f 5// 6// 1// 4//
f 7// 8// 3// 2//
`;

// TODO(@darzu): seperate component? better, more general GUI way?
export interface ButtonColors {
  default: vec3;
  hover: vec3;
  down: vec3;
}

export const ButtonDef = EM.defineComponent(
  "button",
  (key: string, data?: number, colors?: ButtonColors) => ({
    key,
    // TODO(@darzu): better way to do this? Maybe typed "known" buttons ala assets
    data,
    colors,
  })
);

// TODO(@darzu): GUIStateDef ?
export const ButtonsStateDef = EM.defineComponent(
  "buttonsState",
  (gmesh: GameMesh) => ({
    // the number is the LAST data
    hover: {} as { [entId: number]: boolean },
    down: {} as { [entId: number]: boolean },
    click: {} as { [entId: number]: boolean },
    clickByKey: {} as { [key: string]: number | undefined },

    // TODO(@darzu): is this state right or necessary?
    // cursorId: 0,
    gmesh,
  })
);

EM.registerInit({
  requireRs: [RendererDef],
  provideRs: [ButtonsStateDef],
  provideLs: ["buttonStateUpdate", "buttonColors"],
  fn: initButtonGUI,
});

async function initButtonGUI(res: EntityW<[typeof RendererDef]>) {
  // init ButtonsStateDef
  {
    const btnMesh_ = importObj(BTN_OBJ);
    assert(
      typeof btnMesh_ !== "string" && btnMesh_.length === 1,
      `btn mesh failed import: ${btnMesh_}`
    );
    scaleMesh(btnMesh_[0], 0.2);
    const btnGMesh = gameMeshFromMesh(btnMesh_[0], res.renderer.renderer);
    // btnMesh.colors.forEach((c) => vec3.copy(c, ENDESGA16.lightGray));

    EM.addResource(ButtonsStateDef, btnGMesh);
  }

  EM.registerSystem(
    [ButtonDef],
    [PhysicsResultsDef, ButtonsStateDef, InputsDef, UICursorDef],
    (es, res) => {
      // reset by-key state
      for (let key of Object.keys(res.buttonsState.clickByKey))
        res.buttonsState.clickByKey[key] = undefined;

      for (let btn of es) {
        const colW = res.physicsResults.collidesWith.get(btn.id);
        const isHover = (colW ?? []).some(
          (oId) => oId === res.uiCursor.cursor.id
        );

        const wasHover = res.buttonsState.hover[btn.id];
        const wasDown = res.buttonsState.down[btn.id];

        // hover
        if (isHover) res.buttonsState.hover[btn.id] = true;
        else res.buttonsState.hover[btn.id] = false;

        // down
        // TODO(@darzu): drag from outside?
        if (isHover && res.inputs.ldown) res.buttonsState.down[btn.id] = true;
        else res.buttonsState.down[btn.id] = false;

        // click
        if (isHover && wasDown && !res.inputs.ldown) {
          res.buttonsState.click[btn.id] = true;
          res.buttonsState.clickByKey[btn.button.key] = btn.button.data;
        } else res.buttonsState.click[btn.id] = false;
      }
    },
    "buttonStateUpdate"
  );
  EM.requireGameplaySystem("buttonStateUpdate");

  EM.registerSystem(
    [ButtonDef, ColorDef],
    [ButtonsStateDef],
    (es, res) => {
      for (let btn of es) {
        const colors = btn.button.colors;
        if (!colors) continue;
        const isHover = res.buttonsState.hover[btn.id];
        const isDown = res.buttonsState.down[btn.id];
        const isClick = res.buttonsState.click[btn.id];

        vec3.copy(btn.color, colors.default);
        if (isHover) vec3.copy(btn.color, colors.hover);
        if (isDown) vec3.copy(btn.color, colors.down);
        // if (isClick) vec3.copy(btn.color, ENDESGA16.red);

        // if (isClick) {
        //   console.log(`click! ${btn.button.key}`);
        // }
      }
    },
    "buttonColors"
  );
  EM.requireGameplaySystem("buttonColors");
}
