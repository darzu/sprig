export interface Inputs {
  mouseX: number;
  mouseY: number;
  lclick: boolean;
  rclick: boolean;
  keyClicks: { [key: string]: number };
  keyDowns: { [key: string]: boolean };
  keyTimes: { [key: string]: number };
}

export function createInputsReader(canvas: HTMLCanvasElement): () => Inputs {
  // track which keys are pressed for use in the game loop
  const keyDowns: { [keycode: string]: boolean } = {};
  const accumulatedKeyClicks: { [keycode: string]: number } = {};
  const accumulatedKeyTimes: { [keycode: string]: number } = {};
  const keyDownTimes: { [keycode: string]: number } = {};
  window.addEventListener(
    "keydown",
    (ev) => {
      const k = ev.key.toLowerCase();
      if (!keyDowns[k])
        accumulatedKeyClicks[k] = (accumulatedKeyClicks[k] ?? 0) + 1;
      keyDowns[k] = true;
      if (!keyDownTimes[k]) {
        keyDownTimes[k] = performance.now();
      }
      if (k == " ") {
        console.log("space down");
      }
    },
    false
  );
  window.addEventListener(
    "keyup",
    (ev) => {
      let k = ev.key.toLowerCase();
      keyDowns[k] = false;
      accumulatedKeyTimes[k] = performance.now() - keyDownTimes[k];
      delete keyDownTimes[k];
      if (k == " ") {
        console.log("space up");
        console.log(performance.now() - keyDownTimes[k]);
      }
    },
    false
  );
  const _resultKeyClicks: { [keycode: string]: number } = {};
  function takeAccumulatedKeyClicks(): { [keycode: string]: number } {
    for (let k in accumulatedKeyClicks) {
      _resultKeyClicks[k] = accumulatedKeyClicks[k];
      accumulatedKeyClicks[k] = 0;
    }
    return _resultKeyClicks;
  }

  const _resultKeyTimes: { [keycode: string]: number } = {};
  function takeAccumulatedKeyTimes(): { [keycode: string]: number } {
    for (let k in accumulatedKeyTimes) {
      _resultKeyTimes[k] = accumulatedKeyTimes[k];
      accumulatedKeyTimes[k] = 0;
    }
    return _resultKeyTimes;
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
    const keyTimes = takeAccumulatedKeyTimes();
    let inputs: Inputs = {
      mouseX,
      mouseY,
      lclick: lClicks > 0,
      rclick: rClicks > 0,
      keyDowns,
      keyClicks,
      keyTimes,
    };
    return inputs;
  }
  return takeInputs;
}
