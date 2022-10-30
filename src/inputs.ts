import { Canvas, CanvasDef } from "./canvas.js";
import { Component, EM, EntityManager } from "./entity-manager.js";
import { clamp } from "./math.js";

// Consider: https://www.reddit.com/r/gamedev/comments/w1dau6/input_buffering_action_canceling_and_also/

const DEBUG_INPUTS = false as const;
const _seenKeyCodes: Set<string> = new Set();

export const InputsDef = EM.defineComponent("inputs", () => {
  return {
    mouseMovX: 0,
    mouseMovY: 0,
    mousePosX: 0,
    mousePosY: 0,
    lclick: false,
    rclick: false,
    keyClicks: {} as { [key: string]: number },
    keyDowns: {} as { [key: string]: boolean },
  };
});

export type Inputs = Component<typeof InputsDef>;

export function registerInputsSystem(em: EntityManager): void {
  let inputsReader: (() => Inputs) | null = null;

  em.registerSystem(
    null,
    [InputsDef, CanvasDef],
    (_: [], { inputs, htmlCanvas }) => {
      if (!inputsReader) inputsReader = createInputsReader(htmlCanvas);
      // TODO(@darzu): handle pause and menus?
      Object.assign(inputs, inputsReader());
    },
    "inputs"
  );
}

function createInputsReader(canvas: Canvas): () => Inputs {
  // track which keys are pressed for use in the game loop
  const keyDowns: { [keycode: string]: boolean } = {};
  const accumulated_keyClicks: { [keycode: string]: number } = {};
  window.addEventListener(
    "keydown",
    (ev) => {
      const k = ev.key.toLowerCase();
      if (DEBUG_INPUTS) {
        if (!_seenKeyCodes.has(k)) {
          _seenKeyCodes.add(k);
          console.log("new key: " + k);
        }
      }
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
  let accumulated_mouseMovX = 0;
  let accumulated_mouseMovY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  window.addEventListener(
    "mousemove",
    (ev) => {
      accumulated_mouseMovX += ev.movementX;
      accumulated_mouseMovY += ev.movementY;
      if (!canvas.hasMouseLock()) {
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
      } else {
        lastMouseX += ev.movementX;
        lastMouseX = clamp(lastMouseX, 0, canvas.canvas.clientWidth);
        lastMouseY += ev.movementY;
        lastMouseY = clamp(lastMouseY, 0, canvas.canvas.clientHeight);
      }
    },
    false
  );
  function takeAccumulatedMouseMovement(): { x: number; y: number } {
    const result = { x: accumulated_mouseMovX, y: accumulated_mouseMovY };
    accumulated_mouseMovX = 0; // reset accumulators
    accumulated_mouseMovY = 0;
    return result;
  }

  // track mouse buttons
  let accumulated_lClicks = 0;
  let accumulated_rClicks = 0;
  let isLMouseDown = false;
  let isRMouseDown = false;
  window.addEventListener("mousedown", (ev) => {
    // if (document.pointerLockElement === canvas) {
    if (ev.button === 0) {
      if (!isLMouseDown) accumulated_lClicks += 1;
      isLMouseDown = true;
    } else {
      if (!isRMouseDown) accumulated_rClicks += 1;
      isRMouseDown = true;
    }
    // }
    return false;
  });
  window.addEventListener("mouseup", (ev) => {
    // if (document.pointerLockElement === canvas) {
    if (ev.button === 0) {
      isLMouseDown = false;
    } else {
      isRMouseDown = false;
    }
    // }
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
    const { x: mouseMovX, y: mouseMovY } = takeAccumulatedMouseMovement();
    const { lClicks, rClicks } = takeAccumulatedMouseClicks();
    const keyClicks = takeAccumulatedKeyClicks();
    let inputs: Inputs = {
      mouseMovX,
      mouseMovY,
      mousePosX: lastMouseX,
      mousePosY: lastMouseY,
      lclick: lClicks > 0,
      rclick: rClicks > 0,
      keyDowns,
      keyClicks,
    };
    return inputs;
  }
  return takeInputs;
}
