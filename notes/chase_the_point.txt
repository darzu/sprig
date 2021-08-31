/*
Create player
Move player with buttons
Spawn pizza at random location
Start 3 sec timer
on timer elapsed:
    game over
on collide with pizza:
    Spawn pizza at random location
    Start 3 sec timer
*/
    // implicitly, all objects start at ground level, the camera is moved to watch the whole ground
    // the camera tries to keep all objects in view, the last ground created is special, or maybe the union of all grounds
    // camera implicitly exists, when new cameras are created, the last one is used as the focal
    // set player to (new cube (size (5), color (white), kind (player) [+]))
    // set player to (new cube ({width: 5, height: 5, depth: 5, color: white, kind: player}))

export default 0;

/*
ECS:

Components: Geometry, Position, Material, (user defined ones)

Systems:
    MoveWithControls
    collision detection
    timers

Other relations:
    Timers: (remaining)
*/

function OnStart() {
    let ground = CreateGround(100, 100);
    let player = CreateBox({ size: 5, color: "white", kind: "player" });
    MoveWithControls(player);
    function movePizza() {
        let pizza = CreateSphere({ size: 3, color: "red", kind: "pizza" });
        pizza.x = Random(-ground.width / 2, ground.width / 2);
        pizza.z = Random(-ground.height / 2, ground.height / 2);
        StartTimer(3)
    }
    movePizza()
    /*
    When(query, cb => {
    })
    */
    // When({relation: "Timers", remaining: 0}, 
    OnTimerElapsed(() => {
        GameOver("lose")
    })

    // let Colliding: { e1: GameObj, e2: GameObj }[]  = []
    // Colliding.filter(({e1, e2}) => e1 === x && e2 === y)
    // function foo(x: GameObj, y: GameObj) {
    //     let o = Colliding.filter(({e1, e2}) => e1 === x && e2 === y)
    // }
    /*
        When((x,y) => ([
            {relation: "Colliding", e1: x, e2: y},
            {relation: "Player", e: x},
            {relation: "Pizza", e: y},
            {relation: "Position", e: y},
        ]), (x: any, y: any) => {

        });
    */
    OnOverlap("player", "pizza", (player, pizza) => {
        Destory(pizza);
        ChangeScore(1);
        movePizza();
    })

    // When([
    //     ["Colliding", { e1: "x", e2: "y" }],
    //     ["Player", { e: "x" }],
    //     ["Pizza", { e: "y" }],
    //     ["Position", { e: "y" }],
    // ], (x: any, y: any) => {

    // });

}

///////
/////// Abstraction
///////
interface Ground {
    width: number,
    height: number,
}
function CreateGround(width: number, height: number): Ground {
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width, height });

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = BABYLON.Color3.Gray();
    ground.material = groundMat

    const g = { width, height }
    return g
}
type Color = "white" | "red"
type ObjProps = { size: number, color: Color, kind: string }
interface GameObj {
    x: number,
    z: number,
    kind: string
}
class _GameObj implements GameObj {
    // TODO(@darzu): don't like classes..
    get x() {
        return this.mesh.position.x;
    }
    set x(v: number) {
        this.mesh.position.x = v;
    }
    get z() {
        return this.mesh.position.z;
    }
    set z(v: number) {
        this.mesh.position.z = v;
    }
    kind: string;
    constructor(opts: GameObj, public mesh: BABYLON.Mesh) {
        this.x = opts.x;
        this.z = opts.z;
        this.kind = opts.kind;
    }
}
const ents: _GameObj[] = [];
function CreateBox(opts: ObjProps): GameObj {
    const mesh = BABYLON.MeshBuilder.CreateBox("box", { size: opts.size });

    const mat = new BABYLON.StandardMaterial("boxMat", scene);
    // TODO(@darzu): white just disappears
    mat.diffuseColor = opts.color === "white" ? BABYLON.Color3.Green() : BABYLON.Color3.Red();
    mesh.material = mat
    mesh.position.y = (opts.size / 2)

    const g = new _GameObj({
        x: 0,
        z: 0,
        kind: opts.kind
    }, mesh)

    ents.push(g)

    return g;
}
function CreateSphere(opts: ObjProps): GameObj {
    const mesh = BABYLON.MeshBuilder.CreateIcoSphere("sphere", { radius: opts.size / 2 });

    const mat = new BABYLON.StandardMaterial("sphereMat", scene);
    // TODO(@darzu): white just disappears
    mat.diffuseColor = opts.color === "white" ? BABYLON.Color3.Green() : BABYLON.Color3.Red();
    mesh.material = mat
    mesh.position.y = (opts.size / 2)

    const g = new _GameObj({
        x: 0,
        z: 0,
        kind: opts.kind
    }, mesh)

    ents.push(g)

    return g;
}
function Random(from: number, to: number) {
    return (Math.random() * (to - from) + from) | 0
}

let _glboalTimer = 0;
let _globalTimerCBs: (() => void)[] = []
function StartTimer(sec: number) {
    clearTimeout(_glboalTimer);
    _glboalTimer = setTimeout(() => {
        _globalTimerCBs.forEach(cb => cb())
    }, sec * 1000);
}
function OnTimerElapsed(cb: () => void) {
    _globalTimerCBs = [cb] // TODO(@darzu): support multiple ?
}
function GameOver(winlose: "lose" | "win") {
    if (winlose === "win") {
        SplashText("YOU WIN!")
    } else {
        SplashText("GAME OVER")
    }
    console.log(winlose)
}

type OnOverlapCB = (a: GameObj, b: GameObj) => void;
type OnOverlapReg = {
    kind1: string, kind2: string,
    cb: OnOverlapCB
}
let _onOverlapCBs: OnOverlapReg[] = []

function OnOverlap(kind1: string, kind2: string, cb: OnOverlapCB) {
    _onOverlapCBs = [{ kind1, kind2, cb }] // TODO: allow multiple
}
function MoveWithControls(g: GameObj) {
    // TODO: allow unregister
    OnLeftStick((dx, dy) => {
        g.x += dx
        g.z += dy
    })
}

enum Keys {
    Up = 38,
    Down = 40,
    Left = 37,
    Right = 39
}

function Destory(g: GameObj) {
    if (g instanceof _GameObj) {
        g.mesh.setEnabled(false) // TODO: delete from mem?
        scene.removeMesh(g.mesh)
        const index = ents.indexOf(g)
        if (index >= 0) {
            ents.splice(index, 1);
        }
    }
    // TODO: what to do in else?
}

let _score = 0;
function ChangeScore(n: number) {
    _score += n;
    console.log(_score) // TODO(@darzu): render
    _renderScore(_score)
}

///////
/////// implementation
///////

/// <reference path="./ext/babylonjs.materials.d.ts"/>
/// <reference path="./ext/babylon.d.ts"/>
/// <reference path="./ext/babylon.gui.d.ts"/>

let canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: true });
const scene = new BABYLON.Scene(engine);

engine.runRenderLoop(function () {
    if (scene && scene.activeCamera) {
        scene.render();
    }
});

window.addEventListener("resize", function () {
    engine.resize();
});

const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 3, new BABYLON.Vector3(0, 0, 0), scene);
camera.position = (new BABYLON.Vector3(-10, 100, -100)).scale(1.2)
// camera.attachControl(canvas, true);

const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
// scene.createDefaultLight();

let _keys: number[] = [];
let _onCanvasBlurObserver: BABYLON.Observer<BABYLON.Engine> | null = null;
let _onKeyboardObserver: BABYLON.Observer<BABYLON.KeyboardInfo> | null = null;
function attachControl(): void {
    _onCanvasBlurObserver = engine.onCanvasBlurObservable.add(() => {
        _keys = [];
    });
    _onKeyboardObserver = scene.onKeyboardObservable.add((info) => {
        let evt = info.event;
        if (!evt.metaKey) {
            if (info.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                // _ctrlPressed = evt.ctrlKey;
                // _altPressed = evt.altKey;

                var index = _keys.indexOf(evt.keyCode);
                if (index === -1) {
                    _keys.push(evt.keyCode);
                }
            } else {
                var index = _keys.indexOf(evt.keyCode);
                if (index >= 0) {
                    _keys.splice(index, 1);
                }
            }
        }
    });
}
function detachControl(): void {
    if (_onKeyboardObserver) {
        scene.onKeyboardObservable.remove(_onKeyboardObserver);
    }
    if (_onCanvasBlurObserver) {
        engine.onCanvasBlurObservable.remove(_onCanvasBlurObserver);
    }
    _onKeyboardObserver = null;
    _onCanvasBlurObserver = null;

    _keys = [];
}

function checkInputs(): void {
    if (_onKeyboardObserver) {
        let dx = 0;
        let dy = 0;
        for (var index = 0; index < _keys.length; index++) {
            var keyCode = _keys[index];
            if (Keys.Left === keyCode)
                dx -= 1.0;
            else if (Keys.Up === keyCode)
                dy += 1.0;
            else if (Keys.Right === keyCode)
                dx += 1.0;
            else if (Keys.Down === keyCode)
                dy -= 1.0;
        }
        _onLeftStickCBs.forEach(cb => cb(dx, dy))
    }
}

type OnStickCB = (dx: number, dy: number) => void;
let _onLeftStickCBs: OnStickCB[] = [];
function OnLeftStick(cb: OnStickCB) {
    _onLeftStickCBs = [cb] // TODO allow multiple
}

attachControl();

engine.runRenderLoop(() => {
    checkInputs();
})

// Check collision
engine.runRenderLoop(() => {
    // TODO(@darzu): this is stupid expensive
    // https://doc.babylonjs.com/divingDeeper/scene/optimizeOctrees
    for (let k1 of ents) {
        for (let k2 of ents) {
            if (k1 === k2) continue;
            if (k1.mesh.intersectsMesh(k2.mesh, false)) {
                _onOverlapCBs.forEach(({ kind1, kind2, cb }) => {
                    if (k1.kind === kind1 && k2.kind === kind2) {
                        cb(k1, k2)
                    }
                })
            }
       }
   }
})

// // GUI
var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

// var button1 = BABYLON.GUI.Button.CreateSimpleButton("but1", "Click Me");
// button1.width = "150px"
// button1.height = "40px";
// button1.color = "white";
// button1.cornerRadius = 20;
// button1.background = "green";
// button1.onPointerUpObservable.add(function () {
//     alert("you did it!");
// });

function SplashText(txt: string, durationSec = 0) {
    const textBlock = new BABYLON.GUI.TextBlock("splash_txt", txt);
    textBlock.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    textBlock.color = "white";
    textBlock.fontSize = "64px";
    advancedTexture.addControl(textBlock);

    if (durationSec) {
        setTimeout(() => {
            advancedTexture.removeControl(textBlock);
        }, durationSec * 1000)
    }
}


const textBlock = new BABYLON.GUI.TextBlock("score_txt", `score: 0`);
textBlock.color = "white";
textBlock.top = -200;
textBlock.fontSize = "24px";
advancedTexture.addControl(textBlock);
function _renderScore(val: number) {
    // textBlock.
    textBlock.text = `score: ${val}`;

}

_renderScore(0)

// TODO: can't figure out how to get dynamic size of textBlocks
// const rect = new BABYLON.GUI.Rectangle("txtRect");
// rect.color = "white";
// rect.cornerRadius = 5;
// rect.background = "#48AA";
// rect.width = textBlock.width
// rect.height = "40px";
// advancedTexture.addControl(rect);

// textBlock.onTextChangedObservable.add(() => {
//     rect.widthInPixels = textBlock.widthInPixels + 10;
//     rect.height = "40px";

// })



///
/// Start
///

OnStart();
