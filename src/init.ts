import { EntityManager } from "./entity-manager.js";
import { assert } from "./test.js";

let hasInitPassed = false;
const onInitFns: ((em: EntityManager) => void)[] = [];
export function onInit(fn: (em: EntityManager) => void) {
  assert(
    !hasInitPassed,
    `trying to add an init fn but init has already happened!`
  );
  onInitFns.push(fn);
}
export function callInitFns(em: EntityManager) {
  assert(!hasInitPassed, "double init");
  hasInitPassed = true;
  onInitFns.forEach((fn) => fn(em));
}
