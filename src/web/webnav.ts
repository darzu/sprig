import { defineResourceWithInit } from "../ecs/em-helpers.js";

export const WebNavDef = defineResourceWithInit("webNav", [], () => {
  let _hash: string = _readHash();

  function _readHash() {
    return window.location.hash.toLowerCase().trim().slice(1);
  }

  window.addEventListener("hashchange", function (e) {
    _hash = _readHash();
  });

  return {
    getHash: () => _hash,
  };
});
