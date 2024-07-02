import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { toMap, toRecord } from "../utils/util.js";

export function getWebLocationHash() {
  return window.location.hash.toLowerCase().trim().slice(1);
}

export function getWebQueryString(): Map<string, string> {
  const query = new URLSearchParams(window.location.search);
  return toMap(
    [...query.entries()],
    ([key, _]) => key,
    ([_, val]) => val
  );
}

export function isTopLevelFrame(): boolean {
  return window.self === window.top;
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
