import { vec3, mat4 } from "../ext/gl-matrix.js";

/*============= Creating a canvas ======================*/
let canvas = document.getElementById('sample-canvas') as HTMLCanvasElement;
let gl = canvas.getContext('webgl') as WebGLRenderingContext; // TODO: use webgl2
let canv = gl.canvas as HTMLCanvasElement

let vertCode = `
uniform mat4 u_worldViewProjection;
uniform vec3 u_lightWorldPos;
uniform mat4 u_world;
uniform mat4 u_viewInverse;
uniform mat4 u_worldInverseTranspose;

attribute vec4 a_position;
attribute vec3 a_normal;

varying vec4 v_position;
varying vec3 v_normal;
varying vec3 v_surfaceToLight;
varying vec3 v_surfaceToView;

void main() {
  v_position = (u_worldViewProjection * a_position);
  v_normal = (u_worldInverseTranspose * vec4(a_normal, 0)).xyz;
  v_surfaceToLight = u_lightWorldPos - (u_world * a_position).xyz;
  v_surfaceToView = (u_viewInverse[3] - (u_world * a_position)).xyz;
  gl_Position = v_position;
}
`

let fragCode = `
precision mediump float;

varying vec4 v_position;
varying vec3 v_normal;
varying vec3 v_surfaceToLight;
varying vec3 v_surfaceToView;

uniform vec4 u_lightColor;
uniform vec4 u_ambient;
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_specularFactor;

vec4 lit(float l ,float h, float m) {
  return vec4(1.0,
              max(l, 0.0),
              (l > 0.0) ? pow(max(0.0, h), m) : 0.0,
              1.0);
}

void main() {
  vec4 diffuseColor = vec4(0.8, 0.1, 0.1, 1.0);
  vec3 a_normal = normalize(v_normal);
  vec3 surfaceToLight = normalize(v_surfaceToLight);
  vec3 surfaceToView = normalize(v_surfaceToView);
  vec3 halfVector = normalize(surfaceToLight + surfaceToView);
  vec4 litR = lit(dot(a_normal, surfaceToLight),
                    dot(a_normal, halfVector), u_shininess);
  vec4 outColor = vec4((
  u_lightColor * (diffuseColor * litR.y + diffuseColor * u_ambient +
                u_specular * litR.z * u_specularFactor)).rgb,
      diffuseColor.a);
  gl_FragColor = outColor;
}`

let vertShader = gl.createShader(gl.VERTEX_SHADER)!;
gl.shaderSource(vertShader, vertCode);
gl.compileShader(vertShader);

let fragShader = gl.createShader(gl.FRAGMENT_SHADER)!;
gl.shaderSource(fragShader, fragCode);
gl.compileShader(fragShader);

let program = gl.createProgram()!;
gl.attachShader(program, vertShader);
gl.attachShader(program, fragShader);
gl.linkProgram(program);

const u_lightWorldPosLoc = gl.getUniformLocation(program, "u_lightWorldPos");
const u_lightColorLoc = gl.getUniformLocation(program, "u_lightColor");
const u_ambientLoc = gl.getUniformLocation(program, "u_ambient");
const u_specularLoc = gl.getUniformLocation(program, "u_specular");
const u_shininessLoc = gl.getUniformLocation(program, "u_shininess");
const u_specularFactorLoc = gl.getUniformLocation(program, "u_specularFactor");
const u_diffuseLoc = gl.getUniformLocation(program, "u_diffuse");
const u_worldLoc = gl.getUniformLocation(program, "u_world");
const u_worldInverseTransposeLoc = gl.getUniformLocation(program, "u_worldInverseTranspose");
const u_worldViewProjectionLoc = gl.getUniformLocation(program, "u_worldViewProjection");
const u_viewInverseLoc = gl.getUniformLocation(program, "u_viewInverse");

const positionLoc = gl.getAttribLocation(program, "a_position");
const normalLoc = gl.getAttribLocation(program, "a_normal");

const positions = [1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1];
const normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23];

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
const normalBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
const indicesBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

function render(time: number) {
  time *= 0.001;
  resizeCanvasToDisplaySize(canv);
  gl.viewport(0, 0, canv.width, canv.height);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const projection = mat4.perspective(mat4.create(), 30 * Math.PI / 180, canv.clientWidth / canv.clientHeight, 0.5, 10);
  const eye: vec3 = vec3.fromValues(1, 4, -6) as Float32Array;
  const target: vec3 = vec3.fromValues(0, 0, 0) as Float32Array;
  const up: vec3 = vec3.fromValues(0, 1, 0) as Float32Array;

  const camera = mat4.lookAt(mat4.create(), eye, target, up) as Float32Array;
  const view = camera;
  const viewProjection = mat4.multiply(mat4.create(), projection, view);
  const world = updatePos()

  gl.useProgram(program);

  gl.uniform3fv(u_lightWorldPosLoc, [1, 8, -10]);
  gl.uniform4fv(u_lightColorLoc, [1, 0.8, 0.8, 1]);
  gl.uniform4fv(u_ambientLoc, [0, 0, 0, 1]);
  gl.uniform4fv(u_specularLoc, [1, 1, 1, 1]);
  gl.uniform1f(u_shininessLoc, 50);
  gl.uniform1f(u_specularFactorLoc, 0.5);
  gl.uniform1i(u_diffuseLoc, 0);
  gl.uniformMatrix4fv(u_viewInverseLoc, false, camera);
  gl.uniformMatrix4fv(u_worldLoc, false, world);
  gl.uniformMatrix4fv(u_worldInverseTransposeLoc, false, mat4.transpose(mat4.create(), mat4.invert(mat4.create(), world)));
  gl.uniformMatrix4fv(u_worldViewProjectionLoc, false, mat4.multiply(mat4.create(), viewProjection, world));

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(normalLoc);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);

  gl.drawElements(gl.TRIANGLES, 6 * 6, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

//////////


/*================= Mouse events ======================*/
// positionLoc

let AMORTIZATION = 0.95;
let drag = false;
let old_x: number;
let old_y: number;
let dX = 0;
let dY = 0;
let THETA = 0;
let PHI = 0;

let mouseDown = function (e: MouseEvent) {
  drag = true;
  old_x = e.pageX, old_y = e.pageY;
  e.preventDefault();
  return false;
};

let mouseUp = function (e: MouseEvent) {
  drag = false;
};

let mouseMove = function (e: MouseEvent) {
  if (!drag) return false;
  dX = (e.pageX - old_x) * 2 * Math.PI / canvas.width,
    dY = (e.pageY - old_y) * 2 * Math.PI / canvas.height;
  THETA += dX;
  PHI -= dY;
  old_x = e.pageX, old_y = e.pageY;
  e.preventDefault();
  return;
};

function updatePos(): mat4 {
  let mo_matrix = mat4.create() // todo

  if (!drag) {
    dX *= AMORTIZATION, dY *= AMORTIZATION;
    THETA += dX, PHI += dY;
  }

  mat4.rotateY(mo_matrix, mo_matrix, THETA);
  mat4.rotateX(mo_matrix, mo_matrix, PHI);

  return mo_matrix
}

canvas.addEventListener("mousedown", mouseDown, false);
canvas.addEventListener("mouseup", mouseUp, false);
canvas.addEventListener("mouseout", mouseUp, false);
canvas.addEventListener("mousemove", mouseMove, false);

/*================= Mouse events ======================*/


/**
 * Resize a canvas to match the size it's displayed.
 * @param canvas The canvas to resize.
 * @param [multiplier] So you can pass in `window.devicePixelRatio` or other scale value if you want to.
 * @return true if the canvas was resized.
 */
function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, multiplier: number = 1) {
  multiplier = Math.max(0, multiplier);
  const width = canvas.clientWidth * multiplier | 0;
  const height = canvas.clientHeight * multiplier | 0;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}