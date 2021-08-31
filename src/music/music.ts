console.log("music time!")

let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
let canvasCtx = canvasRef.getContext('2d')!;
canvasCtx.fillStyle = "#ddd";
canvasCtx.fillRect(0, 0, canvasRef.width, canvasRef.height);

// create web audio api context
const audioCtx = new AudioContext();

// create Oscillator node
const oscillator = audioCtx.createOscillator();

oscillator.type = 'square';
oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // value in hertz
oscillator.connect(audioCtx.destination);

let playing = false;

// oscillator.start();

function canvasClick() {
    // canvasRef.removeEventListener('click', doLockMouse)

    if (playing)
        oscillator.stop()
    else
        oscillator.start()

    playing = !playing;
}
canvasRef.addEventListener('click', canvasClick)