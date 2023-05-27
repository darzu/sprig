import { HasAudioDef } from "./audio.js";
import { EM } from "../ecs/entity-manager.js";
import { VERBOSE_LOG } from "../flags.js";
import { assert } from "../utils/util.js";

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

EM.registerInit({
  provideRs: [SoundLoaderDef, SoundSetDef],
  requireRs: [HasAudioDef],
  fn: async (res) => {
    const soundLoader = EM.addResource(SoundLoaderDef);

    if (VERBOSE_LOG) console.log("have audio");
    // start loading of sounds

    assert(!soundLoader.promise, "somehow we're double loading sounds");

    const soundsPromise = loadSoundsData();
    soundLoader.promise = soundsPromise;
    const result = await soundsPromise;
    EM.addResource(SoundSetDef, result);
  },
});
