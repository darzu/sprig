import { defineResourceWithInit } from "../ecs/em-helpers.js";

export function getWebLocationHash() {
  return window.location.hash.toLowerCase().trim().slice(1);
}

export const WebNavDef = defineResourceWithInit("webNav", [], () => {
  let _hash: string = getWebLocationHash();

  window.addEventListener("hashchange", function (e) {
    _hash = getWebLocationHash();
  });

  return {
    getHash: () => _hash,
  };
});
