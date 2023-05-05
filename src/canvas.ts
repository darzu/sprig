import { Component, EM, EntityManager } from "./entity-manager.js";

export const CanvasDef = EM.defineComponent(
  "htmlCanvas",
  (canvas: HTMLCanvasElement) => {
    return {
      canvas,
      shouldLockMouseOnClick: true,
      unlockMouse: () => {},
      hasFirstInteraction: false,
      hasMouseLock: () => document.pointerLockElement === canvas,
    };
  }
);
export type Canvas = Component<typeof CanvasDef>;

export function registerInitCanvasSystem(em: EntityManager) {
  em.registerSystem(
    [],
    [],
    () => {
      if (!!em.getResource(CanvasDef)) return;
      const canvas = init();

      const comp = em.addResource(CanvasDef, canvas);

      comp.unlockMouse = () => {
        comp.shouldLockMouseOnClick = false;
        document.exitPointerLock();
      };

      // TODO(@darzu): this should probably be managed elsewhere
      // TODO(@darzu): re-enable
      function tryMouseLock() {
        comp.hasFirstInteraction = true;
        if (
          comp.shouldLockMouseOnClick &&
          document.pointerLockElement !== canvas
        ) {
          canvas.requestPointerLock();
        }
      }
      canvas.addEventListener("click", tryMouseLock);
    },
    "canvas"
  );
}

let _imgPixelatedTimeoutHandle = 0;
// let pixelRatio = 2.0;
// let pixelRatio = window.devicePixelRatio || 1;
let pixelRatio = 1.0;
// pixelRatio = 0.5;
function init(): HTMLCanvasElement {
  console.log(
    `preferred device pixel ratio: ${window.devicePixelRatio} vs ours: ${pixelRatio}`
  );
  console.log(
    `initial canvas size: ${window.innerWidth * pixelRatio} x ${
      window.innerHeight * pixelRatio
    }\n${
      (window.innerWidth * pixelRatio * window.innerHeight * pixelRatio) / 1024
    }kpx`
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
