import { MeshPool, SceneUniform } from "./mesh-pool";

// this is the interface we need
// constructor(
//   canvas: HTMLCanvasElement,
//   device: GPUDevice,
//   maxMeshes = 100,
//   maxTrisPerMesh = 100
// )
// export interface Renderer {
//     unmapGPUBuffers(): void;
//     addObject(o: GameObject): MeshHandle;
//     renderFrame(viewMatrix: mat4): void;
//   }

const vertCode = `
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

const fragCode = `
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

// webgl strategy
//  how do we have a unified approach for our vertex buffers?
//      deserializeFromUnified arrays into seperate arrays?

export interface Renderer {
    renderFrame(timeMs: number): void;
}

export function attachToCanvas(canvasRef: HTMLCanvasElement, pools: MeshPool[]): Renderer {
    let gl = canvasRef.getContext('webgl')!;
    let canv = gl.canvas;// as HTMLCanvasElement

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

    pools.forEach(p => {



        // const positionBuffer = gl.createBuffer();
        // gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        // gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        // const normalBuffer = gl.createBuffer();
        // gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        // gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        // const indicesBuffer = gl.createBuffer();
        // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
        // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        // to change webgl buffers after creation:
        // gl.bufferSubData
    })

    function updateSceneUniform(scene: SceneUniform.Data) {
    }

    function renderFrame(timeMs: number) {
        for (let p of pools) {
            // gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            // gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            // gl.enableVertexAttribArray(positionLoc);
            // gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
            // gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
            // gl.enableVertexAttribArray(normalLoc);
            // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
        }
    }

    return {
        renderFrame,
    }
}
