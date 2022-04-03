// // goals:
// // sequencer, play i-vi Chords, play melody notes

import { CanvasDef } from "./canvas.js";
import { Component, EM, EntityManager } from "./entity-manager.js";
import { range } from "./util.js";

// let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
// let canvasCtx = canvasRef.getContext('2d')!;
// canvasCtx.fillStyle = "#ddd";
// canvasCtx.fillRect(0, 0, canvasRef.width, canvasRef.height);

// TODO(@darzu): create this somewhere as a proper resource
// create web audio api context
const audioCtx = new AudioContext();

// create Oscillator node
let oscillator: OscillatorNode | null;

const MAX_VOLUME = 0.02;

function playFreq(freq: number, durSec: number, offset: number) {
  const startTime = offset;
  const stopTime = offset + durSec;

  const o = audioCtx.createOscillator();

  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);

  g.gain.exponentialRampToValueAtTime(MAX_VOLUME, startTime);

  g.gain.exponentialRampToValueAtTime(0.00001, stopTime + 1.0);

  // "custom" | "sawtooth" | "sine" | "square" | "triangle";
  o.type = "sine";
  // o.type = "sawtooth";
  o.frequency.setValueAtTime(freq, startTime);

  // o.connect(audioCtx.destination);

  o.start(startTime);
  // o.stop(stopTime + 0.1)
}

function playNote(
  n: Note,
  durSec: number = 0.25,
  offset: number | null = null
) {
  if (!offset) offset = audioCtx.currentTime;

  const ROOT = 440;
  const f = ROOT * 2 ** (n / 12);

  playFreq(f, durSec, offset);
}

function mkMajorScale(root: Note): Scale {
  return {
    root,
    // major scale: whole whole half whole whole whole half
    offsets: [2, 2, 1, 2, 2, 2, 1].reduce(
      (p, n) => [...p, p[p.length - 1] + n],
      [0]
    ),
  };
}
function mkMinorScale(root: Note): Scale {
  return {
    root,
    // minor scale: whole half whole whole whole half whole
    offsets: [2, 1, 2, 2, 2, 1, 2].reduce(
      (p, n) => [...p, p[p.length - 1] + n],
      [0]
    ),
  };
}
function getNotesForScale(s: Scale): Note[] {
  const notes = s.offsets.map((o) => s.root + o);
  return notes;
}

type Note = number;
interface Scale {
  root: Note;
  offsets: number[];
  // notes: Note[],
}
interface Chord {
  octave: number;
  offsets: number[];
}
// interface ChordProgression {
//     chordIndices: number[],
// }
function isMinor(c: Chord, s: Scale): boolean {
  // in minor, it's a gap of 3-4
  if (c.offsets.length !== 3) return false;
  const ns = getNotesForChord(c, s);
  return ns[1] - ns[0] === 3 && ns[2] - ns[1] === 4;
}
function isMajor(c: Chord, s: Scale): boolean {
  // in major, it's a gap of 4-3
  if (c.offsets.length !== 3) return false;
  const ns = getNotesForChord(c, s);
  return ns[1] - ns[0] === 4 && ns[2] - ns[1] === 3;
}
function mkPentatonicScale(s: Scale): Scale {
  throw `TODO`;
}
function mkStandardChords(s: Scale, octave: number): Chord[] {
  const chords = [0, 1, 2, 3, 4, 5].map((i) => {
    const c: Chord = {
      octave,
      offsets: [0, 2, 4].map((n) => n + i),
    };
    return c;
  });
  return chords;
}
// function rotate<T>(ts: T[]): T[] {
//     return [ts[ts.length - 1], ...ts.slice(0, ts.length - 1)]
// }
function rotate<T>(ts: T[], shift: number): T[] {
  if (shift > 0)
    return [
      ...ts.slice(ts.length - shift, ts.length),
      ...ts.slice(0, ts.length - shift),
    ];
  else if (shift < 0)
    return [...ts.slice(-shift, ts.length), ...ts.slice(0, -shift)];
  else return [...ts];
  // test cases:
  // console.dir({ ts: [0, 1, 2, 3], ts2: rotate([0, 1, 2, 3], 2) });
  // console.dir({ ts: [0, 1, 2, 3], tsN2: rotate([0, 1, 2, 3], -2) });
  // console.dir({ ts: [0, 1, 2, 3], ts0: rotate([0, 1, 2, 3], 0) });
}
function rotateChord(c: Chord, s: Scale, shift: number): Chord {
  // TODO(@darzu): this doesn't properly handle shifts larger than an octave
  if (shift > 0)
    return {
      ...c,
      offsets: rotate(c.offsets, -shift).map((o, i) =>
        c.offsets.length - shift <= i ? o + s.offsets.length - 1 : o
      ),
    };
  else if (shift < 0)
    return {
      ...c,
      offsets: rotate(c.offsets, -shift).map((o, i) =>
        i < -shift ? o - s.offsets.length + 1 : o
      ),
    };
  else return c;
}
function lowNote(c: Chord): Chord {
  return { octave: c.octave - 1, offsets: [c.offsets[0]] };
}

function getNotesForChord(c: Chord, s: Scale): Note[] {
  const offsets = c.offsets.map((ci) => {
    let octaveShift = c.octave;
    // e.g. -1 goes to 6 but one octave down
    while (ci < 0) {
      ci += s.offsets.length;
      octaveShift -= 1;
    }
    // e.g. 8 goes to 2 but one octave up
    while (ci >= s.offsets.length) {
      ci -= s.offsets.length;
      octaveShift += 1;
    }
    return s.offsets[ci] + octaveShift * 12;
  });
  return getNotesForScale({
    root: s.root,
    offsets,
  });
}

function playFromScale(
  idx: number,
  scale: Scale,
  durSec: number = 0.25,
  offset: number | null = null
) {
  const scaleNotes = getNotesForScale(scale); // TODO(@darzu): don't convert every time
  const note = scaleNotes[idx];
  playNote(note, durSec, offset);
}

function playChord(
  c: Chord,
  s: Scale,
  durSec: number = 0.25,
  offset: number | null = null
) {
  const notes = getNotesForChord(c, s);
  // console.log(
  //   `playing: (${c.offsets.map((o) => (o % 7) + 1).join(",")}) [${notes.join(
  //     ","
  //   )}]`
  // );
  for (let n of notes) playNote(n, durSec, offset);
}

function playChords(
  chordIds: number[],
  majorMinor: "major" | "minor",
  noteSpace = 0.3,
  noteLen = 0.7,
  octave = 0
) {
  // console.log("click!");
  // canvasRef.removeEventListener('click', doLockMouse)

  const start = audioCtx.currentTime;

  const scale = majorMinor === "major" ? mkMajorScale(0) : mkMinorScale(0);
  const stdChords = mkStandardChords(scale, octave);

  // const noteSpace = 0.3;
  // const noteLen = 0.7;

  const chords = chordIds.map((i) => stdChords[i]);

  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const notes = getNotesForChord(c, scale);
    const maxN = Math.max(...notes);
    const minN = Math.min(...notes);
    const c2 = rotateChord(chords[i], scale, -Math.floor(minN / 2));
    playChord(c2, scale, noteLen, start + noteSpace * i);
    playChord(lowNote(c2), scale, noteLen, start + noteSpace * i);
  }
}

export const MusicDef = EM.defineComponent("music", () => {
  return {
    playChords,
  };
});
export type Music = Component<typeof MusicDef>;

export function registerMusicSystems(em: EntityManager) {
  em.addSingletonComponent(MusicDef);

  let once = true;
  em.registerSystem(
    null,
    [MusicDef, CanvasDef],
    (_, res) => {
      if (once && res.htmlCanvas.hasInteraction) {
        // play opening music
        // const THEME_LENGTH = 100;
        // const randChordId = () => Math.floor(Math.random() * 6);
        // const theme = range(100).map((_) => randChordId());
        // // const theme = [0, 1, 2, 3, 4, 5];
        // console.log("playing music");
        // res.music.playChords(theme, "major", 2.0, 2.0, -2);

        once = false;
      }
    },
    "musicStart"
  );
}
