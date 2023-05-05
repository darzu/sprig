import { EntityManager } from "./ecs/entity-manager.js";
import { assert } from "./util.js";

let hasInitPassed = false;
const onInitFns: ((em: EntityManager) => void)[] = [];
// TODO(@darzu): convert all uses of onInit into em.registerInit ?
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
