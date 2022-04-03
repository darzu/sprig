import { EM } from "./entity-manager.js";
export const CanvasDef = EM.defineComponent("htmlCanvas", (canvas) => {
    return {
        canvas,
        shouldLockMouse: true,
        unlockMouse: () => { },
        hasInteraction: false,
    };
});
export function registerInitCanvasSystem(em) {
    em.registerSystem([], [], () => {
        if (!!em.findSingletonComponent(CanvasDef))
            return;
        const canvas = init();
        const comp = em.addSingletonComponent(CanvasDef, canvas);
        comp.unlockMouse = () => {
            comp.shouldLockMouse = false;
            document.exitPointerLock();
        };
        // TODO(@darzu): this should probably be managed elsewhere
        // TODO(@darzu): re-enable
        function tryMouseLock() {
            comp.hasInteraction = true;
            if (comp.shouldLockMouse && document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
            }
        }
        canvas.addEventListener("click", tryMouseLock);
    }, "canvas");
}
let _imgPixelatedTimeoutHandle = 0;
function init() {
    const canvasOpt = document.getElementById("sample-canvas");
    if (!canvasOpt)
        throw `can't find HTML canvas to attach to`;
    const canvas = canvasOpt;
    function onWindowResize() {
        canvas.width = window.innerWidth;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.height = window.innerHeight;
        canvas.style.height = `${window.innerHeight}px`;
    }
    window.onresize = function () {
        onWindowResize();
    };
    onWindowResize();
    // This tells Chrome that the canvas should be pixelated instead of blurred.
    //    this looks better in lower resolution games and gives us full control over
    //    resolution and blur.
    // HACK: for some odd reason, setting this on a timeout is the only way I can get
    //    Chrome to accept this property. Otherwise it'll only apply after the canvas
    //    is resized by the user.
    //    (Last tested on Version 94.0.4604.0 (Official Build) canary (arm64))
    clearTimeout(_imgPixelatedTimeoutHandle);
    _imgPixelatedTimeoutHandle = setTimeout(() => {
        canvas.style.imageRendering = `pixelated`;
    }, 50);
    return canvas;
}
