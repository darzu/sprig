import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { Resource } from "../ecs/em-resources.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_LOG } from "../flags.js";
import { T, assert } from "../utils/util-no-import.js";
import { InputsDef } from "../input/inputs.js";
import { displayWebGPUError } from "./renderer-ecs.js";
import { toMap } from "../utils/util.js";
import { clamp } from "../utils/math.js";

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

// TODO(@darzu): CANVAS
export const CanvasDef = EM.defineResource(
  "htmlCanvas", // TODO(@darzu): rename to canvas ?
  T<{
    canvasNames: string[];
    setCanvas: (name: string) => void;
    getCanvasHtml: () => HTMLCanvasElement;
    getCanvasName: () => string;
    onCanvasChange: () => void; // TODO(@darzu): allow multiple?

    // mouse
    shouldLockMouseOnClick: boolean;
    unlockMouse: () => void;
    _hasFirstInteractionDef: boolean;
    hasMouseLock: () => boolean;

    // rendering
    pixelRatio: number;
    forceWindowResize: () => void; // TODO(@darzu): RENAME: forceUpdateCanvasSize
    resizeToWindow: boolean;
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

  // TODO(@darzu): PARENT element size
  // getBoundingClientRect()

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
  let _activeCanvasName = canvasNames[0];

  // heuristic: when there's only one canvas present, assume it's meant to be full screen
  // TODO(@darzu): allow change canvas to/from window size mid-game
  // const resizeToWindow = canvasNames.length === 1;
  const resizeCanvasToContainer = true;
  // const resizeCanvasToContainer = false;

  const comp = EM.addResource(CanvasDef, {
    canvasNames,
    getCanvasHtml: () => _activeCanvas,
    setCanvas,
    getCanvasName: () => _activeCanvasName,
    onCanvasChange: () => {},

    shouldLockMouseOnClick: true,
    unlockMouse: () => {},
    _hasFirstInteractionDef: false,
    hasMouseLock: () => document.pointerLockElement === _activeCanvas,
    pixelRatio: 1,
    forceWindowResize: () => {},

    resizeToWindow: resizeCanvasToContainer,
  });

  setCanvas(_activeCanvasName);

  function setCanvas(n: string) {
    console.log(`setting canvas to ${n}`);

    const el = canvasesByName.get(n);
    assert(el, `Unknown canvas name: ${n}`);

    _activeCanvas = el;
    _activeCanvasName = n;

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

    comp.onCanvasChange();
  }

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
    width = clamp(width, 10, 4096);
    height = clamp(height, 10, 4096);
    _activeCanvas.width = width * comp.pixelRatio;
    _activeCanvas.style.width = `${width}px`;
    _activeCanvas.height = height * comp.pixelRatio;
    _activeCanvas.style.height = `${height}px`;
  }

  function resizeCanvasToParent() {
    // TODO(@darzu): should this be done differently?
    //  https://web.dev/device-pixel-content-box/
    //  https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/devicePixelContentBoxSize
    const p = _activeCanvas.parentElement;
    assert(p, `canvas doesn't have .parentElement`);
    // const width = p.clientWidth;
    // const height = p.clientHeight;
    let { width, height } = p.getBoundingClientRect();
    width = Math.floor(width); // TODO(@darzu): do we want to round here?
    height = Math.floor(height);
    setActiveCanvasSize(width, height);
  }

  window.onresize = function () {
    if (comp.resizeToWindow) {
      resizeCanvasToParent();
    }
  };

  if (comp.resizeToWindow) {
    resizeCanvasToParent();
  }

  // TODO(@darzu): CANVAS. HACK.
  comp.forceWindowResize = () => {
    if (comp.resizeToWindow) {
      resizeCanvasToParent();
    } else {
      setActiveCanvasSize(_activeCanvas.width, _activeCanvas.height);
    }
  };

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
