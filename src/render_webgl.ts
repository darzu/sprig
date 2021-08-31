import { pitch } from "./3d-util.js";
import { vec3, mat4 } from "./gl-matrix.js";
import { createMeshPoolBuilder_WebGL, MeshPoolOpts, SceneUniform } from "./mesh-pool.js";
import { GameObject } from "./state.js";
// TODO(@darzu): this is a bad dependency:
import { MeshObj, Renderer, setupCamera, setupScene } from "./render_webgpu.js";

// REFERENCE:
// cameraViewProjMatrix : mat4x4<f32>;
// lightViewProjMatrix : mat4x4<f32>;
// lightDir : vec3<f32>;
// time : f32;
// playerPos: vec2<f32>;
// cameraPos : vec3<f32>;

// [[location(0)]] position : vec3<f32>,
// [[location(1)]] color : vec3<f32>,
// [[location(2)]] normal : vec3<f32>,

// [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
// [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
// [[builtin(position)]] position : vec4<f32>;

//     transform: mat4x4<f32>;
//     aabbMin: vec3<f32>;
//     aabbMax: vec3<f32>;

const vertCode = `
precision mediump float;

// scene
uniform mat4 u_cameraViewProjMatrix;
uniform mat4 u_lightViewProjMatrix;
uniform vec3 u_lightDir;
uniform float u_time;
uniform vec2 u_playerPos;
uniform vec3 u_cameraPos;

// model
uniform mat4 u_transform;

// vertex
attribute vec3 a_position;
attribute vec3 a_color;
attribute vec3 a_normal;

// vertex out / fragment in
varying vec3 v_normal;
varying vec3 v_color;
varying vec4 v_position;

void main() {
  v_position = u_cameraViewProjMatrix * u_transform * vec4(a_position, 1.0);
  v_normal = normalize(u_transform * vec4(a_normal, 0.0)).xyz;
  v_color = a_color;
  gl_Position = v_position;
}
`

const fragCode = `
precision mediump float;

// scene
uniform mat4 u_cameraViewProjMatrix;
uniform mat4 u_lightViewProjMatrix;
uniform vec3 u_lightDir;
uniform float u_time;
uniform vec2 u_playerPos;
uniform vec3 u_cameraPos;

// vertex out / fragment in
varying vec3 v_normal;
varying vec3 v_color;
varying vec4 v_position;

void main() {
  float sunLight = clamp(dot(-u_lightDir, v_normal), 0.0, 1.0);
  vec3 resultColor = v_color * (sunLight * 2.0 + 0.2);
  vec3 gammaCorrected = pow(resultColor, vec3(1.0/2.2));
  gl_FragColor = vec4(gammaCorrected, 1.0);
}
`

// TODO(@darzu): 
// export interface Renderer {
//   finishInit(): void;
//   addObject(o: GameObject): MeshObj;
//   renderFrame(viewMatrix: mat4): void;
// }

export function attachToCanvas(canv: HTMLCanvasElement, maxMeshes: number, maxTrisPerMesh: number): Renderer {
  let gl = canv.getContext('webgl')!; // TODO: use webgl2

  let vertShader = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vertShader, vertCode);
  gl.compileShader(vertShader);
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(vertShader));
  }

  let fragShader = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fragShader, fragCode);
  gl.compileShader(fragShader);
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(fragShader));
  }

  console.log("made a program!")
  let program = gl.createProgram()!;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  console.log("linked a program!")

  // scene uniforms
  const u_loc_cameraViewProjMatrix = gl.getUniformLocation(program, "u_cameraViewProjMatrix")
  const u_loc_lightViewProjMatrix = gl.getUniformLocation(program, "u_lightViewProjMatrix")
  const u_loc_lightDir = gl.getUniformLocation(program, "u_lightDir")
  const u_loc_time = gl.getUniformLocation(program, "u_time")
  const u_loc_playerPos = gl.getUniformLocation(program, "u_playerPos")
  const u_loc_cameraPos = gl.getUniformLocation(program, "u_cameraPos")

  // model uniforms
  const u_loc_transform = gl.getUniformLocation(program, "u_transform");

  // vertex inputs
  const a_loc_position = gl.getAttribLocation(program, "a_position");
  const a_loc_normal = gl.getAttribLocation(program, "a_normal");
  const a_loc_color = gl.getAttribLocation(program, "a_color");

  const opts: MeshPoolOpts = {
    maxMeshes,
    maxTris: maxMeshes * maxTrisPerMesh,
    maxVerts: maxMeshes * maxTrisPerMesh * 3,
  }

  const builder = createMeshPoolBuilder_WebGL(gl, opts);
  const pool = builder.poolHandle;

  let initFinished = false;

  const meshObjs: MeshObj[] = [];

  const scene = setupScene();
  const cameraOffset = setupCamera();

  function finishInit() {
    console.log("finishInit")
    initFinished = true;

    // TODO(@darzu): DEBUG
    const positions = [1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1];
    const normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
    const colors = normals.map(_ => 0.5);
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23];

    gl.bindBuffer(gl.ARRAY_BUFFER, pool.positionsBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(positions));
    gl.bindBuffer(gl.ARRAY_BUFFER, pool.normalsBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(normals));
    gl.bindBuffer(gl.ARRAY_BUFFER, pool.colorsBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(colors));

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pool.indicesBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, new Uint16Array(indices));
  }

  function addObject(o: GameObject): MeshObj {
    console.log(`Adding object ${o.id}`);
    let m = o.mesh();
    // need to introduce a new variable to convince Typescript the mapping is non-null

    const handle = initFinished ? pool.addMesh(m) : builder.addMesh(m);

    const res = {
      obj: o,
      handle,
    }

    meshObjs.push(res);

    return res;
  }

  function renderFrame(viewMatrix: mat4) {
    let aspectRatio = Math.abs(canv.width / canv.height);
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspectRatio,
      1,
      10000.0 /*view distance*/
    );
    const viewProj = mat4.multiply(
      mat4.create(),
      projectionMatrix,
      viewMatrix
    ) as Float32Array;

    scene.cameraViewProjMatrix = viewProj;

    gl.viewport(0, 0, canv.width, canv.height);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    // update scene uniform
    gl.uniformMatrix4fv(u_loc_cameraViewProjMatrix, false, scene.cameraViewProjMatrix);
    gl.uniformMatrix4fv(u_loc_lightViewProjMatrix, false, scene.lightViewProjMatrix);
    gl.uniform3fv(u_loc_lightDir, scene.lightDir);
    gl.uniform1f(u_loc_time, scene.time);
    gl.uniform2fv(u_loc_playerPos, scene.playerPos);
    gl.uniform3fv(u_loc_cameraPos, scene.cameraPos);

    // bind vertex buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, pool.positionsBuffer);
    gl.vertexAttribPointer(a_loc_position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_loc_position);

    gl.bindBuffer(gl.ARRAY_BUFFER, pool.normalsBuffer);
    gl.vertexAttribPointer(a_loc_normal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_loc_normal);

    gl.bindBuffer(gl.ARRAY_BUFFER, pool.colorsBuffer);
    gl.vertexAttribPointer(a_loc_color, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_loc_color);

    // TODO(@darzu): need to draw update uniform: u_loc_transform

    // bind index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pool.indicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, builder.indicesMap, gl.DYNAMIC_DRAW);

    // TODO(@darzu): DEBUG
    gl.uniformMatrix4fv(u_loc_transform, false, mat4.create());
    gl.drawElements(gl.TRIANGLES, 6 * 6, gl.UNSIGNED_SHORT, 0);

    // for (let m of meshObjs) {
    //   // gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, m.handle.indicesNumOffset * 2);
    //   gl.uniformMatrix4fv(u_loc_transform, false, m.handle.transform);
    //   gl.drawElements(gl.TRIANGLES, m.handle.numTris * 3, gl.UNSIGNED_SHORT, m.handle.indicesNumOffset);
    //   // break; // TODO(@darzu): 
    // }

  }

  const renderer: Renderer = {
    addObject,
    renderFrame,
    finishInit,
  };

  return renderer;
}