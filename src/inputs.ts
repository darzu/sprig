import { EM, EntityManager } from "./entity-manager.js";
import { Component } from "./renderer.js";

export const InputsDef = EM.defineComponent("inputs", () => {
  return {
    mouseX: 0,
    mouseY: 0,
    lclick: false,
    rclick: false,
    keyClicks: {} as { [key: string]: number },
    keyDowns: {} as { [key: string]: boolean },
  };
});

export type Inputs = Component<typeof InputsDef>;

export function registerInputsSystem(canvas: HTMLCanvasElement): void {
  // TODO(@darzu): should this creation be part of a one-shot system?
  const inputsReader = createInputsReader(canvas);

  EM.registerSystem(null, [InputsDef], (_: [], { inputs }) => {
    // TODO(@darzu): handle pause and menus?
    Object.assign(inputs, inputsReader());
  });
}

function createInputsReader(canvas: HTMLCanvasElement): () => Inputs {
  // track which keys are pressed for use in the game loop
  const keyDowns: { [keycode: string]: boolean } = {};
  const accumulated_keyClicks: { [keycode: string]: number } = {};
  window.addEventListener(
    "keydown",
    (ev) => {
      const k = ev.key.toLowerCase();
      if (!keyDowns[k])
        accumulated_keyClicks[k] = (accumulated_keyClicks[k] ?? 0) + 1;
      keyDowns[k] = true;
    },
    false
  );
  window.addEventListener(
    "keyup",
    (ev) => {
      keyDowns[ev.key.toLowerCase()] = false;
    },
    false
  );
  const _result_keyClicks: { [keycode: string]: number } = {};
  function takeAccumulatedKeyClicks(): { [keycode: string]: number } {
    for (let k in accumulated_keyClicks) {
      _result_keyClicks[k] = accumulated_keyClicks[k];
      accumulated_keyClicks[k] = 0;
    }
    return _result_keyClicks;
  }

  // track mouse movement for use in the game loop
  let accumulated_mouseX = 0;
  let accumulated_mouseY = 0;
  window.addEventListener(
    "mousemove",
    (ev) => {
      accumulated_mouseX += ev.movementX;
      accumulated_mouseY += ev.movementY;
    },
    false
  );
  function takeAccumulatedMouseMovement(): { x: number; y: number } {
    const result = { x: accumulated_mouseX, y: accumulated_mouseY };
    accumulated_mouseX = 0; // reset accumulators
    accumulated_mouseY = 0;
    return result;
  }

  // track mouse buttons
  let accumulated_lClicks = 0;
  let accumulated_rClicks = 0;
  let isLMouseDown = false;
  let isRMouseDown = false;
  window.addEventListener("mousedown", (ev) => {
    if (document.pointerLockElement === canvas) {
      if (ev.button === 0) {
        if (!isLMouseDown) accumulated_lClicks += 1;
        isLMouseDown = true;
      } else {
        if (!isRMouseDown) accumulated_rClicks += 1;
        isRMouseDown = true;
      }
    }
    return false;
  });
  window.addEventListener("mouseup", (ev) => {
    if (document.pointerLockElement === canvas) {
      if (ev.button === 0) {
        isLMouseDown = false;
      } else {
        isRMouseDown = false;
      }
    }
    return false;
  });

  function takeAccumulatedMouseClicks(): { lClicks: number; rClicks: number } {
    const result = {
      lClicks: accumulated_lClicks,
      rClicks: accumulated_rClicks,
    };
    accumulated_lClicks = 0; // reset accumulators
    accumulated_rClicks = 0;
    return result;
  }

  function takeInputs(): Inputs {
    const { x: mouseX, y: mouseY } = takeAccumulatedMouseMovement();
    const { lClicks, rClicks } = takeAccumulatedMouseClicks();
    const keyClicks = takeAccumulatedKeyClicks();
    let inputs: Inputs = {
      mouseX,
      mouseY,
      lclick: lClicks > 0,
      rclick: rClicks > 0,
      keyDowns,
      keyClicks,
    };
    return inputs;
  }
  return takeInputs;
}
