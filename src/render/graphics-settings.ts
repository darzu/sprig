import { EM } from "../ecs/entity-manager.js";
import { CanvasDef } from "./canvas.js";
import { RendererDef } from "./renderer-ecs.js";

export const GraphicsSettingsDef = EM.defineResource(
  "graphicsSettings",
  () => ({
    useHighGraphics: false,
    onGraphicsChange: [] as ((useHighGraphics: boolean) => void)[],
  })
);

EM.addEagerInit([], [RendererDef, CanvasDef], [GraphicsSettingsDef], (res) => {
  const settings = EM.addResource(GraphicsSettingsDef);

  // graphics settings
  const graphicsCheckbox = document.getElementById(
    "graphics-check"
  ) as HTMLInputElement;

  if (!graphicsCheckbox) {
    console.error("No graphics checkbox!");
    return;
  }

  function changeGraphicsSetting(val: boolean) {
    // update checkbox
    graphicsCheckbox.checked = val;
    // update internal state
    settings.useHighGraphics = val;
    // update renderer
    res.renderer.renderer.highGraphics = val;
    // update canvas
    // TODO(@darzu): kinda hacky to have pixel ratio logic here
    res.htmlCanvas.pixelRatio = val ? window.devicePixelRatio : 1;
    res.htmlCanvas.forceWindowResize();
    // update local storage
    if (val) localStorage.setItem("useHighGraphics", "true");
    else localStorage.removeItem("useHighGraphics");
    // callbacks
    for (let handler of settings.onGraphicsChange) handler(val);
  }

  const stored_useHighGraphics = !!localStorage.getItem("useHighGraphics");
  changeGraphicsSetting(stored_useHighGraphics);

  graphicsCheckbox.onchange = (e) => {
    changeGraphicsSetting(graphicsCheckbox.checked);
  };
});
