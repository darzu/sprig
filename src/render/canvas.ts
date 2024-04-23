import { Component, EM, Resource } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_LOG } from "../flags.js";
import { T, assert } from "../utils/util-no-import.js";
import { InputsDef } from "../input/inputs.js";
import { displayWebGPUError } from "./renderer-ecs.js";
import { toMap } from "../utils/util.js";

/*
canvas users:

  mouse:
    hasMouseLock
    unlock mouse
    canvas get cursor position
    mouse move, createInputsReader(canvas)
    unlockMouse / shouldLockMouseOnClick
  text:
    upperText =
  rendering:
    active canvas width/height
    set pixelRatio
    canvas.getContext("webgpu")
    (!!!) createRenderer(canvas, context) 

TODO: canvas.getBoundingClientRect

https://ciechanow.ski/:
  const ctx = canvas.getContext("2d"); // every repaint!
*/

const RESIZE_TO_WINDOW = true;

// TODO(@darzu): CANVAS
export const CanvasDef = EM.defineResource(
  "htmlCanvas", // TODO(@darzu): rename to canvas ?
  T<{
    canvasNames: string[];
    setCanvas: (name: string) => void;
    getCanvasHtml: () => HTMLCanvasElement;

    // mouse
    shouldLockMouseOnClick: boolean;
    unlockMouse: () => void;
    _hasFirstInteractionDef: boolean;
    hasMouseLock: () => boolean;

    // rendering
    pixelRatio: number;
    forceWindowResize: () => void;
  }>()
);
export type Canvas = Resource<typeof CanvasDef>;

export const HasFirstInteractionDef = EM.defineResource(
  "hasFirstInteraction",
  () => true
);

let _imgPixelatedTimeoutHandle = 0;

EM.addLazyInit([], [CanvasDef], () => {
  // TODO(@darzu): CANVAS multi canvases

  const canvases = [...document.getElementsByTagName("canvas")];

  assert(canvases.length, `No <canvas>!`);

  const canvasNames = canvases.map((e) => {
    assert(e.id, `canvas missing "id" tag`);
    return e.id;
  });

  const canvasesByName = toMap(
    canvasNames,
    (n) => n,
    (_, i) => canvases[i]
  );

  let _activeCanvas = canvases[0];

  function setCanvas(n: string) {
    const el = canvasesByName.get(n);
    assert(el, `Unknown canvas name: ${n}`);

    throw "TODO setCanvas";
  }

  const comp = EM.addResource(CanvasDef, {
    canvasNames,
    getCanvasHtml: () => _activeCanvas,
    setCanvas,

    shouldLockMouseOnClick: true,
    unlockMouse: () => {},
    _hasFirstInteractionDef: false,
    hasMouseLock: () => document.pointerLockElement === _activeCanvas,
    pixelRatio: 1,
    forceWindowResize: () => {},
  });

  comp.pixelRatio = 1;

  if (VERBOSE_LOG)
    console.log(
      `preferred device pixel ratio: ${window.devicePixelRatio} vs ours: ${comp.pixelRatio}`
    );
  console.log(
    `initial canvas size: ${window.innerWidth * comp.pixelRatio} x ${
      window.innerHeight * comp.pixelRatio
    }\n${(
      (window.innerWidth *
        comp.pixelRatio *
        window.innerHeight *
        comp.pixelRatio) /
      1_000_000
    ).toFixed(1)}MP`
  );

  function setActiveCanvasSize(width: number, height: number) {
    _activeCanvas.width = width * comp.pixelRatio;
    _activeCanvas.style.width = `${width}px`;
    _activeCanvas.height = height * comp.pixelRatio;
    _activeCanvas.style.height = `${height}px`;
  }

  function resizeCanvasToWindow() {
    // TODO(@darzu): should this be done differently?
    //  https://web.dev/device-pixel-content-box/
    setActiveCanvasSize(window.innerWidth, window.innerHeight);
  }

  if (RESIZE_TO_WINDOW) {
    window.onresize = function () {
      resizeCanvasToWindow();
    };
    resizeCanvasToWindow();
    comp.forceWindowResize = resizeCanvasToWindow;
  } else {
    // TODO(@darzu): CANVAS. HACK.
    comp.forceWindowResize = () => {
      setActiveCanvasSize(_activeCanvas.width, _activeCanvas.height);
    };
  }

  // This tells Chrome that the canvas should be pixelated instead of blurred.
  //    this looks better in lower resolution games and gives us full control over
  //    resolution and blur.
  // HACK: for some odd reason, setting this on a timeout is the only way I can get
  //    Chrome to accept this property. Otherwise it'll only apply after the canvas
  //    is resized by the user.
  //    (Last tested on Version 94.0.4604.0 (Official Build) canary (arm64))
  clearTimeout(_imgPixelatedTimeoutHandle);
  _imgPixelatedTimeoutHandle = setTimeout(() => {
    _activeCanvas.style.imageRendering = `pixelated`;
  }, 50);

  // TODO(@darzu): CANVAS. mouse lock stuff update on canvas switch

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
    if (
      comp.shouldLockMouseOnClick &&
      document.pointerLockElement !== _activeCanvas
    ) {
      _activeCanvas.requestPointerLock();
    }
  }
  _activeCanvas.addEventListener("click", tryMouseLock);

  // TODO(@darzu): if we need to unlock manually, do this:
  // EM.addSystem(
  //   "unlockMouseOnEsc",
  //   Phase.POST_READ_INPUT,
  //   null,
  //   [CanvasDef, InputsDef],
  //   (_, res) => {
  //     if (res.inputs.keyClicks["the escape key" /*not real*/]) {
  //       res.htmlCanvas.unlockMouse();
  //     }
  //   }
  // );
});

// let pixelRatio = 2.0;
// let pixelRatio = window.devicePixelRatio || 1;
// let pixelRatio = 1.0; // TODO(@darzu): NEED CONFIGURABLE RESOLUTION
// pixelRatio = 0.5;
