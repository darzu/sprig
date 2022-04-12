import { EM, EntityManager } from "../entity-manager.js";

export const TextDef = EM.defineComponent("text", () => {
  return {
    upperText: "",
    lowerText: "",
    debugText: "",
  };
});

export function registerUISystems(em: EntityManager) {
  em.addSingletonComponent(TextDef);

  const titleDiv = document.getElementById("title-div") as HTMLDivElement;
  const debugDiv = document.getElementById("debug-div") as HTMLDivElement;
  const lowerDiv = document.getElementById("lower-div") as HTMLDivElement;

  em.registerSystem(
    null,
    [TextDef],
    (_, res) => {
      // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
      //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
      //    means we'll need to do more work to get line breaks.
      titleDiv.firstChild!.nodeValue = res.text.upperText;
      debugDiv.firstChild!.nodeValue = res.text.debugText;
      lowerDiv.firstChild!.nodeValue = res.text.lowerText;
    },
    "uiText"
  );
}
