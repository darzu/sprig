import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, V2 } from "../matrix/sprig-matrix.js";
import { dbgOnce, dbgLogOnce } from "../utils/util.js";

export const GamepadDef = EM.defineResource("gamepad", () => {
  return {
    leftStick: V(0, 0),
    rightStick: V(0, 0),
    btnClicks: {} as { [key: string]: number },
    btnDowns: {} as { [key: string]: boolean },
  };
});

// TODO(@darzu): support other layouts!
export const xboxLayout = [
  "a",
  "b",
  "x",
  "y",
  "lb",
  "rb",
  "lt",
  "rt",
  "?0",
  "?1",
  "?8",
  "?9",
  "up",
  "down",
  "left",
  "right",
];

EM.addLazyInit(
  [],
  [GamepadDef],
  () => {
    const gamepad = EM.addResource(GamepadDef);

    // https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API

    const gamepads = navigator.getGamepads();
    console.log("gamepads");
    console.dir(gamepads);

    window.addEventListener("gamepadconnected", (e) => {
      console.log(
        "Gamepad connected at index %d: %s. %d buttons, %d axes.",
        e.gamepad.index,
        e.gamepad.id,
        e.gamepad.buttons.length,
        e.gamepad.axes.length
      );
    });

    window.addEventListener("gamepaddisconnected", (e) => {
      console.log(
        "Gamepad disconnected from index %d: %s",
        e.gamepad.index,
        e.gamepad.id
      );
    });

    {
      // init xbox layout
      for (let name of xboxLayout) {
        gamepad.btnClicks[name] = 0;
        gamepad.btnDowns[name] = false;
      }
    }

    EM.addSystem(
      "gamepad",
      Phase.READ_INPUTS,
      null,
      [GamepadDef],
      (_, { gamepad }) => {
        const rawGamepads = navigator.getGamepads().filter((g) => !!g);
        const rawPad = rawGamepads[0];
        if (!rawPad) {
          // console.log("no valid pad");
          // console.dir(navigator.getGamepads());
          return;
        }

        if (dbgOnce("gamepad")) console.dir(rawPad);

        if (rawPad.axes.length !== 4) {
          dbgLogOnce("gamepadAxes", `gamepad needs 4 axis`, true);
          return;
        }

        if (rawPad.buttons.length < xboxLayout.length) {
          dbgLogOnce(
            "gamepadButtons",
            `assuming xbox layout, number of buttons: ${rawPad.buttons.length} vs. xbox num: ${xboxLayout.length}`,
            true
          );
          return;
        }

        gamepad.leftStick[0] = rawPad.axes[0];
        gamepad.leftStick[1] = -rawPad.axes[1];
        const lLen = V2.len(gamepad.leftStick);
        if (lLen > 1.0)
          V2.scale(gamepad.leftStick, 1 / lLen, gamepad.leftStick);

        // V2.norm(gamepad.leftStick, gamepad.leftStick);
        gamepad.rightStick[0] = rawPad.axes[2];
        gamepad.rightStick[1] = -rawPad.axes[3];
        const rLen = V2.len(gamepad.rightStick);
        if (rLen > 1.0)
          V2.scale(gamepad.rightStick, 1 / rLen, gamepad.rightStick);
        // V2.norm(gamepad.rightStick, gamepad.rightStick);

        // console.log(
        //   `l: ${vec2Dbg(res.gamepad.leftStick)}, r: ${vec2Dbg(
        //     res.gamepad.rightStick
        //   )}`
        // );

        // reset clicks
        for (let name of xboxLayout) {
          gamepad.btnClicks[name] = 0;
        }

        // check clicks and down
        for (let i = 0; i < rawPad.buttons.length; i++) {
          const btn = rawPad.buttons[i];

          const name = xboxLayout[i]; // TODO(@darzu): different layouts

          const wasPressed = gamepad.btnDowns[name];

          if (wasPressed && !btn.pressed) {
            gamepad.btnClicks[name] += 1;
            console.log(`click "${name}"`);
          }

          gamepad.btnDowns[name] = btn.pressed;
        }
      }
    );
  },
  "initGamepad"
);
