export function createInputsReader(canvas) {
    // track which keys are pressed for use in the game loop
    const keyDowns = {};
    const accumulated_keyClicks = {};
    window.addEventListener("keydown", (ev) => {
        var _a;
        const k = ev.key.toLowerCase();
        if (!keyDowns[k])
            accumulated_keyClicks[k] = ((_a = accumulated_keyClicks[k]) !== null && _a !== void 0 ? _a : 0) + 1;
        keyDowns[k] = true;
    }, false);
    window.addEventListener("keyup", (ev) => {
        keyDowns[ev.key.toLowerCase()] = false;
    }, false);
    const _result_keyClicks = {};
    function takeAccumulatedKeyClicks() {
        for (let k in accumulated_keyClicks) {
            _result_keyClicks[k] = accumulated_keyClicks[k];
            accumulated_keyClicks[k] = 0;
        }
        return _result_keyClicks;
    }
    // track mouse movement for use in the game loop
    let accumulated_mouseX = 0;
    let accumulated_mouseY = 0;
    window.addEventListener("mousemove", (ev) => {
        accumulated_mouseX += ev.movementX;
        accumulated_mouseY += ev.movementY;
    }, false);
    function takeAccumulatedMouseMovement() {
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
                if (!isLMouseDown)
                    accumulated_lClicks += 1;
                isLMouseDown = true;
            }
            else {
                if (!isRMouseDown)
                    accumulated_rClicks += 1;
                isRMouseDown = true;
            }
        }
        return false;
    });
    window.addEventListener("mouseup", (ev) => {
        if (document.pointerLockElement === canvas) {
            if (ev.button === 0) {
                isLMouseDown = false;
            }
            else {
                isRMouseDown = false;
            }
        }
        return false;
    });
    function takeAccumulatedMouseClicks() {
        const result = {
            lClicks: accumulated_lClicks,
            rClicks: accumulated_rClicks,
        };
        accumulated_lClicks = 0; // reset accumulators
        accumulated_rClicks = 0;
        return result;
    }
    function takeInputs() {
        const { x: mouseX, y: mouseY } = takeAccumulatedMouseMovement();
        const { lClicks, rClicks } = takeAccumulatedMouseClicks();
        const keyClicks = takeAccumulatedKeyClicks();
        let inputs = {
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
//# sourceMappingURL=inputs.js.map