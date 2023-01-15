import { Component, EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import { assert } from "../util.js";
import { getBytes } from "../webget.js";

const DEFAULT_MAP_PATH = "assets/ld52_maps/";

export const MapPaths = [
  "map1",
  "map2",
  "map3",
  "map4",
  "map_maze",
  "map_narrow",
] as const;

export type MapName = typeof MapPaths[number];

export interface Map {
  bytes: Uint8ClampedArray;
}

export type MapSet = { [P in MapName]: Map };

const MapLoaderDef = EM.defineComponent("mapLoader", () => {
  return {
    promise: null as Promise<MapSet> | null,
  };
});

export const MapsDef = EM.defineComponent("maps", (maps: MapSet) => maps);
export type Maps = Component<typeof MapsDef>;

async function loadMaps(): Promise<MapSet> {
  const mapPromises = MapPaths.map(async (name) => {
    const path = `${DEFAULT_MAP_PATH}${name}.png`;
    // return getBytes(path);

    return new Promise<Uint8ClampedArray>((resolve, reject) => {
      const img = new Image();
      img.src = path;
      img.onload = function (e) {
        // TODO(@darzu): move to webget.ts
        // create in-memory canvas to grab the image data (wierd)
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        const imgData = context.getImageData(0, 0, img.width, img.height);
        resolve(imgData.data);
      };
    });
  });

  const maps = await Promise.all(mapPromises);

  const set: Partial<MapSet> = {};

  for (let i = 0; i < MapPaths.length; i++) {
    set[MapPaths[i]] = {
      bytes: maps[i],
    };
  }

  return set as MapSet;
}

onInit(async (em) => {
  em.addResource(MapLoaderDef);

  // start loading of maps
  const { mapLoader } = await em.whenResources(MapLoaderDef);

  assert(!mapLoader.promise, "somehow we're double loading maps");

  const mapsPromise = loadMaps();
  mapLoader.promise = mapsPromise;
  mapsPromise.then(
    (result) => {
      em.addResource(MapsDef, result);
    },
    (failureReason) => {
      // TODO(@darzu): fail more gracefully
      throw `Failed to load maps: ${failureReason}`;
    }
  );
});
