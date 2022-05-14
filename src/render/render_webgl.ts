import { vec3, mat4 } from "../gl-matrix.js";
import { MeshHandle, MeshPool, MeshPoolOpts } from "./mesh-pool.js";
// TODO(@darzu): this is a bad dependency:
import { Renderer } from "./renderer.js";
import { Mesh } from "./mesh.js";
import {
  MeshHandleStd,
  MeshUniformStruct,
  setupScene,
  VertexStruct,
} from "./pipelines.js";

const vertCode = `#version 300 es
precision mediump float;

// scene
uniform mat4 u_cameraViewProjMatrix;
// uniform mat4 u_lightViewProjMatrix;
uniform vec3 u_light1Dir;
uniform vec3 u_light2Dir;
uniform vec3 u_light3Dir;
uniform float u_time;
uniform vec2 u_playerPos;
uniform vec3 u_cameraPos;

// model
uniform mat4 u_transform;
uniform vec3 u_tint;

// vertex
in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;

// vertex out / fragment in
flat out vec3 v_normal;
out vec3 v_color;
out vec4 v_worldPos;

void main() {
  v_worldPos = u_transform * vec4(a_position, 1.0);
  v_normal = normalize(u_transform * vec4(a_normal, 0.0)).xyz;
  v_color = a_color + u_tint;
  gl_Position = u_cameraViewProjMatrix * u_transform * vec4(a_position, 1.0);
}
`;

const fragCode = `#version 300 es
// #extension GL_EXT_shader_texture_lod : enable
// #extension GL_OES_standard_derivatives : enable

precision mediump float;

// scene
uniform mat4 u_cameraViewProjMatrix;
uniform mat4 u_lightViewProjMatrix;
uniform vec3 u_light1Dir;
uniform vec3 u_light2Dir;
uniform vec3 u_light3Dir;
uniform float u_time;
uniform vec2 u_playerPos;
uniform vec3 u_cameraPos;

// vertex out / fragment in
flat in vec3 v_normal;
in vec3 v_color;
in vec4 v_worldPos;
out vec4 fragColor;

void main() {
  // ANNOYING: flat interpolation isn't supported in webgl so let's just compute it
  // TODO: okay we have flat, but it isn't working?
  vec3 norm = -normalize(cross(dFdx(v_worldPos.xyz), -dFdy(v_worldPos.xyz)));
  // vec3 norm = v_normal;

  // TODO this isn't working right yet; lights move with camera??!
  float light1 = clamp(dot(-u_light1Dir, norm), 0.0, 1.0);
  float light2 = clamp(dot(-u_light2Dir, norm), 0.0, 1.0);
  float light3 = clamp(dot(-u_light3Dir, norm), 0.0, 1.0);
  vec3 resultColor = v_color 
    * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
  vec3 gammaCorrected = pow(resultColor, vec3(1.0/2.2));
  fragColor = vec4(gammaCorrected, 1.0);
}
`;

// TODO(@darzu):
// export interface Renderer {
//   finishInit(): void;
//   addObject(o: GameObject): MeshObj;
//   renderFrame(viewMatrix: mat4): void;
// }

export function attachToCanvas(
  canv: HTMLCanvasElement,
  maxMeshes: number,
  maxVertices: number
): Renderer {
  let gl = canv.getContext("webgl2")!;

  if (!gl) {
    throw `Browser doesnt support webgl2`;
  }

  // gl.getExtension("OES_standard_derivatives");
  // gl.getExtension("EXT_shader_texture_lod");

  let backgroundColor: vec3 = [0.55, 0.6, 0.8];

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

  console.log("made a program!");
  let program = gl.createProgram()!;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  console.log("linked a program!");

  // scene uniforms locations
  const u_loc_cameraViewProjMatrix = gl.getUniformLocation(
    program,
    "u_cameraViewProjMatrix"
  );
  // const u_loc_lightViewProjMatrix = gl.getUniformLocation(
  //   program,
  //   "u_lightViewProjMatrix"
  // );
  const u_loc_light1Dir = gl.getUniformLocation(program, "u_light1Dir");
  const u_loc_light2Dir = gl.getUniformLocation(program, "u_light2Dir");
  const u_loc_light3Dir = gl.getUniformLocation(program, "u_light3Dir");
  const u_loc_time = gl.getUniformLocation(program, "u_time");
  const u_loc_playerPos = gl.getUniformLocation(program, "u_playerPos");
  const u_loc_cameraPos = gl.getUniformLocation(program, "u_cameraPos");

  // model uniforms locations
  const u_loc_transform = gl.getUniformLocation(program, "u_transform");
  const u_loc_tint = gl.getUniformLocation(program, "u_tint");

  // vertex inputs locations
  const a_loc_position = gl.getAttribLocation(program, "a_position");
  const a_loc_normal = gl.getAttribLocation(program, "a_normal");
  const a_loc_color = gl.getAttribLocation(program, "a_color");

  // const opts: MeshPoolOpts = {
  //   maxMeshes,
  //   maxTris: maxVertices,
  //   maxVerts: maxVertices,
  //   maxLines: maxVertices * 2,
  //   shiftMeshIndices: true,
  // };

  const pool: MeshPool<
    typeof VertexStruct.desc,
    typeof MeshUniformStruct.desc
  > = null as any; // createMeshPool_WebGL(gl, opts);
  throw `TODO: re-enable webgl`;

  const scene = setupScene();

  // TODO(@darzu): debugging
  // console.log("will draw:")
  // for (let m of meshObjs) {
  //   console.log(`t: ${m.handle.transform.join(',')}`)
  //   console.log(`count: ${m.handle.numTris * 3} at ${m.handle.indicesNumOffset}`)
  // }

  // TODO(@darzu): DEBUG
  // const positions = [1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1];
  // const normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  // const colors = normals.map(_ => 0.5);
  // const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23];

  // gl.bindBuffer(gl.ARRAY_BUFFER, pool.positionsBuffer);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(positions));
  // gl.bindBuffer(gl.ARRAY_BUFFER, pool.normalsBuffer);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(normals));
  // gl.bindBuffer(gl.ARRAY_BUFFER, pool.colorsBuffer);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(colors));

  // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pool.triIndicesBuffer);
  // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, new Uint16Array(indices));

  function addMesh(m: Mesh): MeshHandleStd {
    // console.log(`Adding object ${o.id}`);
    // need to introduce a new variable to convince Typescript the mapping is non-null

    const handle = pool.addMesh(m);

    return handle;
  }
  function addMeshInstance(oldHandle: MeshHandleStd): MeshHandleStd {
    const d = MeshUniformStruct.clone(oldHandle.shaderData);

    const newHandle = pool.addMeshInstance(oldHandle, d);

    // TODO(@darzu):
    // meshObjs[o.id] = res;

    return newHandle;
  }
  function updateMesh(handle: MeshHandleStd, newMeshData: Mesh) {
    pool.updateMeshVertices(handle, newMeshData);
  }

  function renderFrame(viewProj: mat4, meshHandles: MeshHandleStd[]) {
    scene.cameraViewProjMatrix = viewProj;

    gl.viewport(0, 0, canv.width, canv.height);

    gl.clearColor(
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      1.0
    );

    gl.enable(gl.DEPTH_TEST);
    // gl.frontFace(gl.CW);
    gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.FRONT);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    // update scene uniform
    gl.uniformMatrix4fv(
      u_loc_cameraViewProjMatrix,
      false,
      scene.cameraViewProjMatrix
    );
    // gl.uniformMatrix4fv(
    //   u_loc_lightViewProjMatrix,
    //   false,
    //   scene.lightViewProjMatrix
    // );
    gl.uniform3fv(u_loc_light1Dir, scene.light1Dir);
    gl.uniform3fv(u_loc_light2Dir, scene.light2Dir);
    gl.uniform3fv(u_loc_light3Dir, scene.light3Dir);
    gl.uniform1f(u_loc_time, scene.time);
    gl.uniform2fv(u_loc_playerPos, scene.playerPos);
    gl.uniform3fv(u_loc_cameraPos, scene.cameraPos);

    // bind vertex buffers
    // TODO(@darzu): IMPL
    // gl.bindBuffer(gl.ARRAY_BUFFER, pool.vertexBuffer);
    // TODO(@darzu): create these attrib points via CyBuffer
    gl.vertexAttribPointer(
      a_loc_position,
      3,
      gl.FLOAT,
      false,
      VertexStruct.size,
      VertexStruct.offsets[0]
    );
    gl.enableVertexAttribArray(a_loc_position);
    gl.vertexAttribPointer(
      a_loc_color,
      3,
      gl.FLOAT,
      false,
      VertexStruct.size,
      VertexStruct.offsets[1]
    );
    gl.enableVertexAttribArray(a_loc_color);
    gl.vertexAttribPointer(
      a_loc_normal,
      3,
      gl.FLOAT,
      false,
      VertexStruct.size,
      VertexStruct.offsets[2]
    );
    gl.enableVertexAttribArray(a_loc_normal);

    // TODO(@darzu): need to draw update uniform: u_loc_transform

    // bind index buffer
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pool.triIndicesBuffer);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, builder.triIndicesMap, gl.DYNAMIC_DRAW);

    // TODO(@darzu): DEBUG
    // gl.uniformMatrix4fv(u_loc_transform, false, mat4.create());
    // gl.drawElements(gl.TRIANGLES, 6 * 6, gl.UNSIGNED_SHORT, 0);

    for (let m of meshHandles) {
      // gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, m.handle.indicesNumOffset * 2);
      gl.uniformMatrix4fv(u_loc_transform, false, m.shaderData.transform);
      gl.uniform3fv(u_loc_tint, m.shaderData.tint);
      const indicesBytesOffset = m.triIdx * 3 * 2;
      gl.drawElements(
        gl.TRIANGLES,
        m.triNum * 3,
        gl.UNSIGNED_SHORT,
        indicesBytesOffset
      );
      // TODO(@darzu): support draw lines

      // gl.drawElements(gl.TRIANGLES, m.handle.numTris * 3, gl.UNSIGNED_SHORT, m.handle.indicesNumOffset);
      // break; // TODO(@darzu):
      // console.log(`t: ${m.handle.transform.join(',')}`)
      // console.log(`count: ${m.handle.numTris * 3} at ${m.handle.indicesNumOffset}`)
    }
  }

  const renderer: Renderer = {
    drawLines: true, // TODO(@darzu): support wireframe mode in webgl
    drawTris: true,
    backgroundColor,
    addMesh,
    addMeshInstance,
    updateMesh,
    renderFrame,
  };

  return renderer;
}
