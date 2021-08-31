console.log("music time!")

let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
let canvasCtx = canvasRef.getContext('2d')!;
canvasCtx.fillStyle = "#ddd";
canvasCtx.fillRect(0, 0, canvasRef.width, canvasRef.height);

// create web audio api context
const audioCtx = new AudioContext();

// create Oscillator node
let oscillator: OscillatorNode | null;

function createNote(): OscillatorNode {
    const oscillator = audioCtx.createOscillator();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // value in hertz
    oscillator.connect(audioCtx.destination);

    return oscillator;
}

function playFreq(freq: number, durSec: number, offset: number) {
    const oscillator = audioCtx.createOscillator();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, offset);
    oscillator.connect(audioCtx.destination);

    oscillator.start(offset)
    oscillator.stop(offset + durSec)
}

function noteFreq(n: number): number {
    const root = 440;
    const f = root * (2 ** (n / 12));
    return f;
}

function playNote(n: number, durSec: number = 0.25, offset: number | null = null) {
    if (!offset)
        offset = audioCtx.currentTime;

    const f = noteFreq(n);
    playFreq(f, durSec, offset);
}

function canvasClick() {
    // canvasRef.removeEventListener('click', doLockMouse)

    const start = audioCtx.currentTime;

    playNote(0, 0.25, start + 0);
    playNote(4, 0.25, start + 0.25);
    playNote(7, 0.25, start + 0.5);

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

