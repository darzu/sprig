import { Component, EM, EntityManager } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_LOG } from "../flags.js";

export const CanvasDef = EM.defineComponent(
  "htmlCanvas",
  (canvas: HTMLCanvasElement) => {
    return {
      canvas,
      shouldLockMouseOnClick: true,
      unlockMouse: () => {},
      _hasFirstInteractionDef: false,
      hasMouseLock: () => document.pointerLockElement === canvas,
    };
  }
);
export type Canvas = Component<typeof CanvasDef>;

export const HasFirstInteractionDef = EM.defineComponent(
  "hasFirstInteraction",
  () => true
);

EM.addLazyInit([], [CanvasDef], async () => {
  const canvas = init();

  const comp = EM.addResource(CanvasDef, canvas);

  comp.unlockMouse = () => {
    comp.shouldLockMouseOnClick = false;
    document.exitPointerLock();
  };

  // TODO(@darzu): this should probably be managed elsewhere
  // TODO(@darzu): re-enable
  function tryMouseLock() {
    if (!comp._hasFirstInteractionDef) {
      comp._hasFirstInteractionDef = true;
      EM.addResource(HasFirstInteractionDef);
    }
    if (comp.shouldLockMouseOnClick && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  }
  canvas.addEventListener("click", tryMouseLock);
});

let _imgPixelatedTimeoutHandle = 0;
// let pixelRatio = 2.0;
// let pixelRatio = window.devicePixelRatio || 1;
let pixelRatio = 1.0; // TODO(@darzu): NEED CONFIGURABLE RESOLUTION
// pixelRatio = 0.5;
function init(): HTMLCanvasElement {
  if (VERBOSE_LOG)
    console.log(
      `preferred device pixel ratio: ${window.devicePixelRatio} vs ours: ${pixelRatio}`
    );
  console.log(
    `initial canvas size: ${window.innerWidth * pixelRatio} x ${
      window.innerHeight * pixelRatio
    }\n${(
      (window.innerWidth * pixelRatio * window.innerHeight * pixelRatio) /
      1_000_000
    ).toFixed(1)}MP`
  );
  const canvasOpt = document.getElementById("sample-canvas");
  if (!canvasOpt) throw `can't find HTML canvas to attach to`;
  const canvas = canvasOpt as HTMLCanvasElement;
  function onWindowResize() {
    // TODO(@darzu): should this be done differently?
    //  https://web.dev/device-pixel-content-box/
    canvas.width = window.innerWidth * pixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.height = window.innerHeight * pixelRatio;
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
