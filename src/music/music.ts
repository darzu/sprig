console.log("music time!")

// goals:
// sequencer, play i-vi cords, play melody notes

let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
let canvasCtx = canvasRef.getContext('2d')!;
canvasCtx.fillStyle = "#ddd";
canvasCtx.fillRect(0, 0, canvasRef.width, canvasRef.height);

// create web audio api context
const audioCtx = new AudioContext();

// create Oscillator node
let oscillator: OscillatorNode | null;

const MAX_VOLUME = 0.2;

function playFreq(freq: number, durSec: number, offset: number) {
    const startTime = offset;
    const stopTime = offset + durSec;

    const o = audioCtx.createOscillator();

    const g = audioCtx.createGain()
    o.connect(g)
    g.connect(audioCtx.destination)

    g.gain.exponentialRampToValueAtTime(
        MAX_VOLUME, startTime
    )

    g.gain.exponentialRampToValueAtTime(
        0.00001, stopTime + 1.0
    )

    // "custom" | "sawtooth" | "sine" | "square" | "triangle";
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, startTime);

    // o.connect(audioCtx.destination);

    o.start(startTime)
    // o.stop(stopTime + 0.1)
}

function playNote(n: Note, durSec: number = 0.25, offset: number | null = null) {
    if (!offset)
        offset = audioCtx.currentTime;

    const ROOT = 440;
    const f = ROOT * (2 ** (n / 12));

    playFreq(f, durSec, offset);
}

// returns notes
function constructMajorScale(startNote: number): Note[] {
    // major scale: whole whole half whole whole whole half
    const scale = [2, 2, 1, 2, 2, 2].reduce((p, n) => [...p, p[p.length - 1] + n], [startNote])
    return scale;
}

type Note = number;
interface Scale {
    notes: Note[],
}
interface Cord {
    noteIndices: number[],
}
function isMinor(c: Cord, s: Scale): boolean {
    throw 'TODO'
}
function isMajor(c: Cord, s: Scale): boolean {
    throw 'TODO'
}
function getPentatonicScale(s: Scale): Scale {
    throw `TODO`
}
function shiftOctave(n: Note, octaveOffset: number): Note {
    return n + octaveOffset * 12; // TODO(@darzu): verify
}

// cord, "triad": 1st, 3rd, 5th,
//      root can be moved so it's any other note from the scale
//  in major, it's a gap of 4-3
//  with a 3-4, it is a minor chord
// minor scale: shift major scale down 3
// from a scale (1-6), get all the triads, clasify them as major or minor
// for major scale: major, minor, minor, major, major, minor
//                  I, ii, iii, IV, V, vi
// form inversions: cycle the notes in a chord
//      use inversions to preserve most of the quality but shift the progression to a more consistent range
//      reinforce subtle flavor change: play the lowest notes of the cord in a lower octave
// melodies:
//  usually played above the chords
//  string together notes that are in the key
//  stability: use notes in the chords your playing
//  considered interesting to use notes that aren't in the chord, typically in passing (between two notes that are in the chord)
//  typically end with a note that is within a chord
// major pantatonic scale:
//  starting from a major scale, remove 4th and 7th degrees
//  play notes from that pantatonic scale (1,2,3,5,6) over chords from the full scale will typically sound pretty good

function playScale(idx: number, scale: number[], durSec: number = 0.25, offset: number | null = null) {
    const note = scale[idx]
    playNote(note, durSec, offset)
}

function playCord(c: number, durSec: number = 0.25, offset: number | null = null) {

}

function canvasClick() {
    console.log('click!')
    // canvasRef.removeEventListener('click', doLockMouse)

    const start = audioCtx.currentTime;

    const scale = constructMajorScale(0);
    console.dir({ scale })

    playScale(0, scale, 0.25, start + 0.0);
    playScale(1, scale, 0.25, start + 0.25);
    playScale(2, scale, 0.25, start + 0.5);

    // playNote(7, 0.25, start + 0.0);
    // playNote(4, 0.25, start + 0.0);
    // playNote(0, 0.25, start + 0.0);
    // playNote(4, 0.25, start + 0.0);
    // playNote(0, 0.25, start + 0.5);
    // playNote(7, 0.25, start + 0.75);

}
canvasRef.addEventListener('click', canvasClick)

// var context = new AudioContext()
// var o = context.createOscillator()
// var g = context.createGain()
// o.connect(g)
// g.connect(context.destination)
// o.start(0)

// g.gain.exponentialRampToValueAtTime(
//     0.00001, context.currentTime + 0.04
// )

// g.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + X)

// C	C#	D	Eb	E	F	F#	G	G#	A	Bb	B
// 0	16.35	17.32	18.35	19.45	20.60	21.83	23.12	24.50	25.96	27.50	29.14	30.87
// 1	32.70	34.65	36.71	38.89	41.20	43.65	46.25	49.00	51.91	55.00	58.27	61.74
// 2	65.41	69.30	73.42	77.78	82.41	87.31	92.50	98.00	103.8	110.0	116.5	123.5
// 3	130.8	138.6	146.8	155.6	164.8	174.6	185.0	196.0	207.7	220.0	233.1	246.9
// 4	261.6	277.2	293.7	311.1	329.6	349.2	370.0	392.0	415.3	440.0	466.2	493.9
// 5	523.3	554.4	587.3	622.3	659.3	698.5	740.0	784.0	830.6	880.0	932.3	987.8
// 6	1047	1109	1175	1245	1319	1397	1480	1568	1661	1760	1865	1976
// 7	2093	2217	2349	2489	2637	2794	2960	3136	3322	3520	3729	3951
// 8	4186	4435	4699	4978	5274	5588	5920	6272	6645	7040	7459	7902

// var frequency = 440.0
// o.frequency.value = frequency

/// https://github.com/mdn/webaudio-examples

// for cross browser
// const AudioContext = window.AudioContext || window.webkitAudioContext;
// let audioCtx;

// // load some sound
// const audioElement = document.querySelector('audio');
// let track;

// const playButton = document.querySelector('.tape-controls-play');

// // play pause audio
// playButton.addEventListener('click', function() {
//   if(!audioCtx) {
// 		init();
// 	}

// 	// check if context is in suspended state (autoplay policy)
// 	if (audioCtx.state === 'suspended') {
// 		audioCtx.resume();
// 	}

// 	if (this.dataset.playing === 'false') {
// 		audioElement.play();
// 		this.dataset.playing = 'true';
// 	// if track is playing pause it
// 	} else if (this.dataset.playing === 'true') {
// 		audioElement.pause();
// 		this.dataset.playing = 'false';
// 	}

// 	let state = this.getAttribute('aria-checked') === "true" ? true : false;
// 	this.setAttribute( 'aria-checked', state ? "false" : "true" );

// }, false);

// // if track ends
// audioElement.addEventListener('ended', () => {
// 	playButton.dataset.playing = 'false';
// 	playButton.setAttribute( "aria-checked", "false" );
// }, false);

// function init() {

// 	audioCtx = new AudioContext();
// 	track = audioCtx.createMediaElementSource(audioElement);

// 	// volume
// 	const gainNode = audioCtx.createGain();

// 	const volumeControl = document.querySelector('[data-action="volume"]');
// 	volumeControl.addEventListener('input', function() {
// 		gainNode.gain.value = this.value;
// 	}, false);

// 	// panning
// 	const pannerOptions = { pan: 0 };
// 	const panner = new StereoPannerNode(audioCtx, pannerOptions);

// 	const pannerControl = document.querySelector('[data-action="panner"]');
// 	pannerControl.addEventListener('input', function() {
// 		panner.pan.value = this.value;
// 	}, false);

// 	// connect our graph
// 	track.connect(gainNode).connect(panner).connect(audioCtx.destination);
// }

