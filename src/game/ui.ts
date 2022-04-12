import { EM, EntityManager } from "../entity-manager.js";

export const TextDef = EM.defineComponent("text", () => {
  return {
    setText: (s: string) => {},
  };
});

export function registerUISystems(em: EntityManager) {
  const txt = em.addSingletonComponent(TextDef);

  const titleDiv = document.getElementById("title-div") as HTMLDivElement;

  txt.setText = (s: string) => {
    titleDiv.firstChild!.nodeValue = s;
  };
}
