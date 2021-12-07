import { Component, EM, EntityManager } from "./entity-manager.js";

export const CanvasDef = EM.defineComponent(
  "htmlCanvas",
  (canvas: HTMLCanvasElement) => {
    return {
      canvas,
    };
  }
);
export type Canvas = Component<typeof CanvasDef>;

export function registerInitCanvasSystem(em: EntityManager) {
  em.registerSystem([], [], () => {
    if (!!em.findSingletonComponent(CanvasDef)) return;
    const canvas = init();
    em.addSingletonComponent(CanvasDef, canvas);
  });
}

let _imgPixelatedTimeoutHandle = 0;
function init(): HTMLCanvasElement {
  const canvasOpt = document.getElementById("sample-canvas");
  if (!canvasOpt) throw `can't find HTML canvas to attach to`;
  const canvas = canvasOpt as HTMLCanvasElement;
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

  // TODO(@darzu): this should probably be managed elsewhere
  // TODO(@darzu): re-enable
  // function doLockMouse() {
  //   if (document.pointerLockElement !== canvas) {
  //     canvas.requestPointerLock();
  //   }
  // }
  // canvas.addEventListener("click", doLockMouse);

  return canvas;
}
