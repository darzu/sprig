import { HasAudioDef } from "./audio.js";
import { Component, EM } from "../ecs/entity-manager.js";
import { VERBOSE_LOG } from "../flags.js";
import { onInit } from "../init.js";
import { assert } from "../utils/util.js";
import { getBytes } from "../webget.js";

const DEFAULT_SOUND_PATH = "assets/sounds/";

export const SoundPaths = [
  "cannonS.mp3",
  "cannonL.mp3",
  "stonebreak.wav",
  "woodbreak.mp3",
] as const;

export type SoundName = (typeof SoundPaths)[number];

export type SoundSet = { [P in SoundName]: AudioBuffer };

const SoundLoaderDef = EM.defineComponent("soundLoader", () => {
  return {
    promise: null as Promise<SoundSet> | null,
  };
});

export const SoundSetDef = EM.defineComponent(
  "soundSet",
  (soundSet: SoundSet) => soundSet
);

async function loadSoundsData(): Promise<SoundSet> {
  console.log("loading sound data");
  // TODO(@darzu): PERF. Load on demand instead of all at once
  const soundPromises = SoundPaths.map(async (name) => {
    const path = `${DEFAULT_SOUND_PATH}${name}`;
    // return getBytes(path);

    // Decode asynchronously
    return new Promise<AudioBuffer>((resolve, _) => {
      var request = new XMLHttpRequest();
      request.open("GET", path, true);
      request.responseType = "arraybuffer";
      request.onload = function () {
        new AudioContext().decodeAudioData(request.response, function (buffer) {
          resolve(buffer);
        });
      };
      request.send();
    });
  });

  const sounds = await Promise.all(soundPromises);
  const set: Partial<SoundSet> = {};

  for (let i = 0; i < SoundPaths.length; i++) {
    set[SoundPaths[i]] = sounds[i];
  }
  return set as SoundSet;
}

// TODO(@darzu): use registerInit so this only runs if needed
onInit(async (em) => {
  em.addResource(SoundLoaderDef);

  if (VERBOSE_LOG) console.log("awaiting has audio");
  await em.whenResources(HasAudioDef);
  if (VERBOSE_LOG) console.log("have audio");
  // start loading of sounds
  const { soundLoader } = await em.whenResources(SoundLoaderDef);

  assert(!soundLoader.promise, "somehow we're double loading sounds");

  const soundsPromise = loadSoundsData();
  soundLoader.promise = soundsPromise;
  soundsPromise.then(
    (result) => {
      em.addResource(SoundSetDef, result);
    },
    (failureReason) => {
      // TODO(@darzu): fail more gracefully
      throw `Failed to load sounds: ${failureReason}`;
    }
  );
});
