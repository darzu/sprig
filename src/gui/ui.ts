import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";

/*
Early UI use cases:
  scene picker, pipeline numbers, gpu texture viewer, game controls, game instructions,

UI needed:
text, button, check box, radio, sliders, text input?

In-engine text rendering:
  As 3D models?
  As SDF-based font?

[ ] As 2D triangles, can be extruded to 3D
[ ] Pick a font
[ ] Triangulate to 2D
[ ] Render to texture, JFA
[ ] Extrude to 3D
[ ] Expand letters to triangles on GPU?
[ ] Sensible first step: render font texture to plane, alpha clipping

[ ] font editor: scrible brush for rough shape
[ ] font editor: triangle editor to triangulate
[ ] font editor: html reference fonts overlay
*/

export const TextDef = EM.defineResource(
  "text",
  (
    upperDiv?: HTMLDivElement,
    debugDiv?: HTMLDivElement,
    lowerDiv?: HTMLDivElement,
    helpDiv?: HTMLDivElement
  ) => {
    return {
      upperText: "",
      lowerText: "",
      debugText: "",
      helpText: "",
      upperDiv,
      debugDiv,
      lowerDiv,
      helpDiv,
    };
  }
);

export function initHtmlUI() {
  const upperDiv = (document.getElementById("title-div") ?? undefined) as
    | HTMLDivElement
    | undefined;
  const debugDiv = (document.getElementById("debug-div") ?? undefined) as
    | HTMLDivElement
    | undefined;
  const lowerDiv = (document.getElementById("lower-div") ?? undefined) as
    | HTMLDivElement
    | undefined;
  const helpDiv = (document.getElementById("help-div") ?? undefined) as
    | HTMLDivElement
    | undefined;

  EM.addResource(TextDef, upperDiv, debugDiv, lowerDiv, helpDiv);

  EM.addSystem("uiText", Phase.RENDER_DRAW, null, [TextDef], (_, res) => {
    // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
    //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
    //    means we'll need to do more work to get line breaks.
    if (res.text.upperText && upperDiv)
      upperDiv.firstChild!.nodeValue = res.text.upperText;
    if (res.text.debugText && debugDiv)
      debugDiv.firstChild!.nodeValue = res.text.debugText;
    if (res.text.lowerText && lowerDiv)
      lowerDiv.firstChild!.nodeValue = res.text.lowerText;
    if (res.text.helpText && helpDiv)
      helpDiv.firstChild!.nodeValue = res.text.helpText;
  });
}
