import { CanvasDef } from "./canvas.js";
import { EM } from "./entity-manager.js";
const DEBUG_INPUTS = false;
const _seenKeyCodes = new Set();
export const InputsDef = EM.defineComponent("inputs", () => {
    return {
        mouseMovX: 0,
        mouseMovY: 0,
        mousePosX: 0,
        mousePosY: 0,
        lclick: false,
        rclick: false,
        keyClicks: {},
        keyDowns: {},
    };
});
export function registerInputsSystem(em) {
    let inputsReader = null;
    em.registerSystem(null, [InputsDef, CanvasDef], (_, { inputs, htmlCanvas }) => {
        if (!inputsReader)
            inputsReader = createInputsReader(htmlCanvas.canvas);
        // TODO(@darzu): handle pause and menus?
        Object.assign(inputs, inputsReader());
    }, "inputs");
}
function createInputsReader(canvas) {
    // track which keys are pressed for use in the game loop
    const keyDowns = {};
    const accumulated_keyClicks = {};
    window.addEventListener("keydown", (ev) => {
        var _a;
        const k = ev.key.toLowerCase();
        if (DEBUG_INPUTS) {
            if (!_seenKeyCodes.has(k)) {
                _seenKeyCodes.add(k);
                console.log("new key: " + k);
            }
        }
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
    let accumulated_mouseMovX = 0;
    let accumulated_mouseMovY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    window.addEventListener("mousemove", (ev) => {
        accumulated_mouseMovX += ev.movementX;
        accumulated_mouseMovY += ev.movementY;
        lastMouseX = ev.offsetX;
        lastMouseY = ev.offsetY;
    }, false);
    function takeAccumulatedMouseMovement() {
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
            if (!isLMouseDown)
                accumulated_lClicks += 1;
            isLMouseDown = true;
        }
        else {
            if (!isRMouseDown)
                accumulated_rClicks += 1;
            isRMouseDown = true;
        }
        // }
        return false;
    });
    window.addEventListener("mouseup", (ev) => {
        // if (document.pointerLockElement === canvas) {
        if (ev.button === 0) {
            isLMouseDown = false;
        }
        else {
            isRMouseDown = false;
        }
        // }
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
        const { x: mouseMovX, y: mouseMovY } = takeAccumulatedMouseMovement();
        const { lClicks, rClicks } = takeAccumulatedMouseClicks();
        const keyClicks = takeAccumulatedKeyClicks();
        let inputs = {
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
//# sourceMappingURL=inputs.js.map