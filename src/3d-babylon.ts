// TODO: use babylon via ES6 modules (probably needs webpack)
//  docs: https://doc.babylonjs.com/divingDeeper/developWithBjs/treeShaking
//  example: https://github.com/RaananW/babylonjs-webpack-es6
// import * as BABYLON from "babylonjs";

/* tutorial:
https://doc.babylonjs.com/start/chap1/first_scene

*/

/// <reference path="./ext/babylonjs.materials.d.ts"/>
/// <reference path="./ext/babylon.d.ts"/>

export default 0;

let canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

let createDefaultEngine = () =>
    new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: true });
const createScene = () => {
    const scene = new BABYLON.Scene(engine);



    return scene;
}

const engine = createDefaultEngine();
if (!engine) throw 'engine should not be null.';
const scene = createScene();

const sceneToRender = scene
engine.runRenderLoop(function () {
    if (sceneToRender && sceneToRender.activeCamera) {
        sceneToRender.render();
    }
});

// Resize
window.addEventListener("resize", function () {
    engine.resize();
});

// CAMERA
const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 3, new BABYLON.Vector3(0, 0, 0), scene);
camera.position = new BABYLON.Vector3(10, 10, -10)
camera.attachControl(canvas, true);

// LIGHT
// const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
const light1 = new BABYLON.DirectionalLight("DirectionalLight", new BABYLON.Vector3(-1, -1, -1), scene);
const light2 = new BABYLON.DirectionalLight("DirectionalLight", new BABYLON.Vector3(1, -1, -1), scene);
const light3 = new BABYLON.DirectionalLight("DirectionalLight", new BABYLON.Vector3(1, 1, 1), scene);
[light1, light2, light3].forEach(l => {
    l.intensity = 0.6
})

// scene.ambientColor = new BABYLON.Color3(1, 0, 1);

// "GROUND"
// const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 10, height: 10 });

// MATERIAL
// TODO: StandardMaterial needs import
const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
groundMat.diffuseColor = new BABYLON.Color3(0, 0, 0.5);
groundMat.wireframe = true;

// HEIGHTMAP
let ground2 = BABYLON.MeshBuilder.CreateGround("groundPlan2", { width: 20, height: 20, subdivisions: 10 })
ground2.material = groundMat
let poses = ground2.getVerticesData(BABYLON.VertexBuffer.PositionKind)! as Float32Array
poses = poses.map((v, i, a) => {
    const x = a[i - 1] || 0
    const z = a[i + 1] || 0
    if (i % 3 === 1)
        return -((x + z) * 0.1);
    return v
})
ground2.setVerticesData(BABYLON.VertexBuffer.PositionKind, poses)
// TODO: this is how I should set a height map


// MESH
const box = BABYLON.MeshBuilder.CreateBox("box", {});
// box.scaling.x = -2;
// box.scaling.y = 1.5;
// box.scaling.z = 3;
box.position.x = -2;
box.position.y = 0.5;  //box created with default size so height is 1
// box.rotation.y = Math.PI / 4;
// box.rotation.y = BABYLON.Tools.ToRadians(45);

const roof = BABYLON.MeshBuilder.CreateCylinder("roof", { diameter: 1.3, height: 1.2, tessellation: 3 });
roof.scaling.x = 0.75;
roof.position.x = -2;
roof.rotation.z = Math.PI / 2;
roof.position.y = 1.22;

var myMaterial = new BABYLON.StandardMaterial("myMaterial", scene);
myMaterial.diffuseColor = new BABYLON.Color3(1, 0, 1);
myMaterial.specularColor = new BABYLON.Color3(0.5, 0.6, 0.87);
// myMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
myMaterial.ambientColor = new BABYLON.Color3(0.23, 0.98, 0.53);
// myMaterial.alpha = 0.9;
roof.material = myMaterial;

// MESH IMPORT
// BABYLON.SceneLoader.ImportMeshAsync("", "/relative path/", "myFile").then((result) => {
//     result.meshes[1].position.x = 20;
//     const myMesh_1 = scene.getMeshByName("myMesh_1");
//     myMesh1.rotation.y = Math.PI / 2;
// });

// SOUND
// const sound = new BABYLON.Sound("sound", "url to sound file", scene);
// //Leave time for the sound file to load before playing it
// sound.play();

// LATHE
const fountainProfile = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(10, 0, 0),
    new BABYLON.Vector3(10, 4, 0),
    new BABYLON.Vector3(8, 4, 0),
    new BABYLON.Vector3(8, 1, 0),
    new BABYLON.Vector3(1, 2, 0),
    new BABYLON.Vector3(1, 15, 0),
    new BABYLON.Vector3(3, 17, 0)
];
const fountain = BABYLON.MeshBuilder.CreateLathe("fountain", { shape: fountainProfile, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
fountain.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1)
fountain.position.x = 3;

// PARTICLES
const particleSystem = new BABYLON.ParticleSystem("particles", 5000, scene);
// https://playground.babylonjs.com/textures/flare.png
particleSystem.particleTexture = new BABYLON.Texture("./assets/flare.png", scene);
// particleSystem.startPositionFunction = () => fountain.position
// particleSystem.emitter = new BABYLON.Vector3(-4, 0.8, -6); // the point at the top of the fountain
particleSystem.emitter = BABYLON.Vector3.Zero().add(fountain.position)
particleSystem.emitter.y += +2;
particleSystem.minEmitBox = new BABYLON.Vector3(-0.01, 0, -0.01); // minimum box dimensions
particleSystem.maxEmitBox = new BABYLON.Vector3(0.01, 0, 0.01); // maximum box dimensions
particleSystem.color1 = new BABYLON.Color4(0.7, 0.8, 1.0, 1.0);
particleSystem.color2 = new BABYLON.Color4(0.2, 0.5, 1.0, 1.0);
particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
particleSystem.minSize = 0.01;
particleSystem.maxSize = 0.05;
particleSystem.minLifeTime = 0.3;
particleSystem.maxLifeTime = 1.5;
particleSystem.emitRate = 1500;
particleSystem.direction1 = new BABYLON.Vector3(-1, 8, 1);
particleSystem.direction2 = new BABYLON.Vector3(1, 8, -1);
particleSystem.minEmitPower = 0.2;
particleSystem.maxEmitPower = 0.6;
particleSystem.updateSpeed = 0.01;
particleSystem.gravity = new BABYLON.Vector3(0, -9.81, 0);
particleSystem.start();

// EDGE GLOW
var hl = new BABYLON.HighlightLayer("hl1", scene);
hl.addMesh(box, BABYLON.Color3.Green());

// GLOW
var gl = new BABYLON.GlowLayer("glow", scene);
gl.customEmissiveColorSelector = function (mesh, subMesh, material, result) {
    if (mesh.name === "fountain") {
        result.set(1, 0, 1, 1);
    } else {
        result.set(0, 0, 0, 0);
    }
}

// EDGE HIGHLIGHT
roof.enableEdgesRendering();
roof.edgesWidth = 4.0;
roof.edgesColor = new BABYLON.Color4(0, 0, 1, 1);

// GIZMOS
var gizmoManager = new BABYLON.GizmoManager(scene);
gizmoManager.positionGizmoEnabled = true;
gizmoManager.rotationGizmoEnabled = true;
gizmoManager.scaleGizmoEnabled = true;
gizmoManager.boundingBoxGizmoEnabled = true;

gizmoManager.gizmos.positionGizmo!.xGizmo.dragBehavior.onDragStartObservable.add(() => {
    console.log("Position gizmo's x axis started to be dragged");
})
gizmoManager.gizmos.positionGizmo!.xGizmo.dragBehavior.onDragEndObservable.add(() => {
    console.log("Position gizmo's x axis drag was ended");
})

// MORPH
var scrambleUp = function (data: BABYLON.FloatArray) {
    for (let index = 0; index < data.length; index++) {
        data[index] += 0.4 * Math.random();
    }
}
var manager = new BABYLON.MorphTargetManager();
box.morphTargetManager = manager
const boxTarget = BABYLON.MeshBuilder.CreateBox("box_target", {});
boxTarget.setEnabled(false)
boxTarget.updateMeshPositions(scrambleUp)
var target = BABYLON.MorphTarget.FromMesh(boxTarget, "target", 0.25);
target.influence = 0.5
manager.addTarget(target)

// EXPLODE (doesn't work?)
// scene.executeWhenReady(function () {
//     let newExplosion = new BABYLON.MeshExploder([roof], roof);
//     newExplosion.explode(20);        //Explodes meshes away from center. Default 1.0.
// });

// SHADERS
// var myShaderMaterial = new BABYLON.ShaderMaterial("shader", scene, {
//     vertexSource: vertCode,
//     fragmentSource: fragCode,
// }, {
//     attributes: ["a_position", "a_normal", "a_texcoord"],
//     uniforms: ["u_lightColor", "u_ambient", "u_diffuse", "u_specular", "u_shininess", "u_specularFactor"],
//     // defines: ["MyDefine"],
//     // needAlphaBlending: true,
//     // needAlphaTesting: true
// });
// roof.material = myShaderMaterial;

