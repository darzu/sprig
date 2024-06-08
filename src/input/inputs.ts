import { Canvas, CanvasDef } from "../render/canvas.js";
import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { Resource } from "../ecs/em-resources.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { clamp } from "../utils/math.js";
import { DEBUG_INPUTS } from "../flags.js";
import { Phase } from "../ecs/sys-phase.js";

// Consider: https://www.reddit.com/r/gamedev/comments/w1dau6/input_buffering_action_canceling_and_also/
// TODO(@darzu): needs refactor to address: events, controller vs mouse+keyboard, keybindings

// TODO(@darzu): BUG. on window focus change, we should release all keys probably? Right now the "shift" key gets stuck when doing
//  a screen recording.

// TODO(@darzu): use pointer events instead of mouse: https://www.redblobgames.com/making-of/draggable/

const _seenKeyCodes: Set<string> = new Set();

export const InputsDef = EM.defineResource("inputs", () => {
  return {
    // TODO(@darzu): should we map mouse 2D pos to be Y up? Y down is annoying..
    mouseMov: V2.mk(),
    mousePos: V2.mk(),
    mouseWheel: 0,
    // TODO(@darzu): need rising edge vs falling edge distinction
    lclick: false,
    rclick: false,
    ldown: false,
    rdown: false,
    // TODO(@darzu): we might need a better way to track and think about events
    keyClicks: {} as { [key: string]: number },
    keyDowns: {} as { [key: string]: boolean },
  };
});

export type Inputs = Resource<typeof InputsDef>;

// TODO(@darzu): generalize to other input types e.g. controller, gyro
export const MouseDragDef = EM.defineResource("mousedrag", () => ({
  isDragging: false,
  isDragEnd: false,
  dragStart: V2.mk(),
  dragEnd: V2.mk(),
  dragMin: V2.mk(),
  dragMax: V2.mk(),
  dragMov: V2.mk(),
  dragLastEnd: V2.mk(),
}));

EM.addLazyInit([], [InputsDef, MouseDragDef], () => {
  let inputsReader: (() => Inputs) | null = null;

  EM.addResource(InputsDef);
  // const InputsSys =
  EM.addSystem(
    "inputs",
    Phase.READ_INPUTS,
    null,
    [InputsDef, CanvasDef],
    (_: [], { inputs, htmlCanvas }) => {
      if (!inputsReader) inputsReader = createInputsReader(htmlCanvas);
      // TODO(@darzu): handle pause and menus?
      Object.assign(inputs, inputsReader());
    }
  );

  EM.addResource(MouseDragDef);
  EM.addSystem(
    "mouseDrag",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, MouseDragDef],
    (_, { inputs, mousedrag }) => {
      // check drag state
      mousedrag.isDragEnd = false;
      if (inputs.ldown && !mousedrag.isDragging) {
        // drag start
        mousedrag.isDragging = true;
        V2.copy(mousedrag.dragStart, inputs.mousePos);
        V2.copy(mousedrag.dragEnd, inputs.mousePos);
      } else if (!inputs.ldown && mousedrag.isDragging) {
        // drag stop
        mousedrag.isDragging = false;
        mousedrag.isDragEnd = true;
      }

      // update min/max
      if (mousedrag.isDragging) {
        V2.copy(mousedrag.dragLastEnd, mousedrag.dragEnd);
        V2.copy(mousedrag.dragEnd, inputs.mousePos);
        V2.set(
          Math.min(mousedrag.dragStart[0], mousedrag.dragEnd[0]),
          Math.min(mousedrag.dragStart[1], mousedrag.dragEnd[1]),
          mousedrag.dragMin
        );
        V2.set(
          Math.max(mousedrag.dragStart[0], mousedrag.dragEnd[0]),
          Math.max(mousedrag.dragStart[1], mousedrag.dragEnd[1]),
          mousedrag.dragMax
        );
        V2.copy(mousedrag.dragMov, inputs.mouseMov);
      }
    }
  );
});

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
  let accumulated_mouseMov = V2.mk();
  let lastMouse: V2 = V2.mk();
  window.addEventListener(
    "pointermove",
    (ev) => {
      const html = canvas.getCanvasHtml();
      const rect = html.getBoundingClientRect();
      accumulated_mouseMov[0] += ev.movementX;
      accumulated_mouseMov[1] += ev.movementY;
      if (!canvas.hasMouseLock()) {
        // lastMouse[0] = ev.clientX;
        // lastMouse[1] = ev.clientY;
        lastMouse[0] = ev.clientX - rect.x;
        lastMouse[1] = ev.clientY - rect.y;
      } else {
        lastMouse[0] += ev.movementX;
        lastMouse[0] = clamp(lastMouse[0], 0, rect.width);
        lastMouse[1] += ev.movementY;
        lastMouse[1] = clamp(lastMouse[1], 0, rect.height);
      }
    },
    false
  );

  function takeAccumulatedMouseMovement(): V2 {
    const res = V2.clone(accumulated_mouseMov);
    V2.zero(accumulated_mouseMov); // reset accumulators
    return res;
  }

  // track mouse wheel
  let accumulated_mouseWheel = 0;
  window.addEventListener(
    "wheel",
    (ev) => {
      accumulated_mouseWheel += ev.deltaY;
    },
    false
  );
  function takeAccumulatedMouseWheel(): number {
    const res = accumulated_mouseWheel;
    accumulated_mouseWheel = 0;
    return res;
  }

  // track mouse buttons
  let accumulated_lClicks = 0;
  let accumulated_rClicks = 0;
  let isLMouseDown = false;
  let isRMouseDown = false;
  window.addEventListener("pointerdown", (ev) => {
    if (ev.button === 0) {
      if (!isLMouseDown) accumulated_lClicks += 1;
      isLMouseDown = true;
    } else {
      if (!isRMouseDown) accumulated_rClicks += 1;
      isRMouseDown = true;
    }
    canvas.getCanvasHtml().setPointerCapture(ev.pointerId);
    return false;
  });
  // TODO(@darzu): TEST MOBILE
  // window.addEventListener("touchstart", (e) => e.preventDefault());
  window.addEventListener("pointerup", (ev) => {
    if (ev.button === 0) {
      isLMouseDown = false;
    } else {
      isRMouseDown = false;
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
    const mouseMov = takeAccumulatedMouseMovement();
    const { lClicks, rClicks } = takeAccumulatedMouseClicks();
    const keyClicks = takeAccumulatedKeyClicks();
    let inputs: Inputs = {
      mouseMov,
      mousePos: V2.clone(lastMouse),
      mouseWheel: takeAccumulatedMouseWheel(),
      lclick: lClicks > 0,
      rclick: rClicks > 0,
      ldown: isLMouseDown,
      rdown: isRMouseDown,
      keyDowns,
      keyClicks,
    };
    return inputs;
  }
  return takeInputs;
}
