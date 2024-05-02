import { defineResourceWithInit } from "../ecs/em-helpers.js";

export const WebNavDef = defineResourceWithInit("webNav", [], () => {
  let _hash = window.location.hash;

  window.addEventListener("hashchange", function (e) {
    _hash = window.location.hash;
  });

  return {
    getHash: () => _hash,
  };
});
