export interface Inputs {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  mouseX: number;
  mouseY: number;
  lclick: boolean;
  rclick: boolean;
  accel: boolean;
  keyClicks: { [key: string]: number };
}

export function createInputsReader(canvas: HTMLCanvasElement): () => Inputs {
  // track which keys are pressed for use in the game loop
  const pressedKeys: { [keycode: string]: boolean } = {};
  const accumulated_keyClicks: { [keycode: string]: number } = {};
  window.addEventListener(
    "keydown",
    (ev) => {
      const k = ev.key.toLowerCase();
      if (!pressedKeys[k])
        accumulated_keyClicks[k] = (accumulated_keyClicks[k] ?? 0) + 1;
      pressedKeys[k] = true;
    },
    false
  );
  window.addEventListener(
    "keyup",
    (ev) => {
      pressedKeys[ev.key.toLowerCase()] = false;
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

  // TODO(@darzu): Ideally mouse clicks would trigger on mouse down not up for more responsive actions
  let accumulated_lClicks = 0;
  let accumulated_rClicks = 0;
  window.addEventListener("mouseup", (ev) => {
    if (document.pointerLockElement === canvas) {
      if (ev.button === 0) {
        accumulated_lClicks += 1;
      } else {
        accumulated_rClicks += 1;
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
    let inputs = {
      forward: pressedKeys["w"],
      back: pressedKeys["s"],
      left: pressedKeys["a"],
      right: pressedKeys["d"],
      up: pressedKeys["shift"],
      down: pressedKeys["c"],
      accel: pressedKeys[" "],
      mouseX,
      mouseY,
      lclick: lClicks > 0,
      rclick: rClicks > 0,
      keyClicks,
    };
    return inputs;
  }
  return takeInputs;
}
