import { vec3, mat4 } from "../gl-matrix.js";
import { computeTriangleNormal } from "../utils-3d.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { MeshHandle } from "./mesh-pool.js";
import { Mesh, getAABBFromMesh } from "./mesh.js";

export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
export const MAX_LIGHTS = 8;

export const VertexStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    uv: "vec2<f32>",
  },
  {
    isCompact: true,
    serializer: ({ position, color, normal, uv }, _, offsets_32, views) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      views.f32.set(uv, offsets_32[3]);
    },
  }
);
export type VertexTS = CyToTS<typeof VertexStruct.desc>;

export const MeshUniformStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    aabbMin: "vec3<f32>",
    aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.aabbMin, offsets_32[1]);
      views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[3]);
    },
  }
);
export type MeshUniformTS = CyToTS<typeof MeshUniformStruct.desc>;

// TODO(@darzu): IMPL
export type MeshHandleStd = MeshHandle<typeof MeshUniformStruct.desc>;

const meshVertsPtr = CY.createArray("meshVertsBuf", {
  struct: VertexStruct,
  length: MAX_VERTICES,
});

const meshTriIndsPtr = CY.createIdxBuf("meshTriIndsBuf", {
  init: () => MAX_VERTICES,
});

const meshLineIndsPtr = CY.createIdxBuf("meshLineIndsBuf", {
  init: () => MAX_VERTICES * 2,
});

const meshUnisPtr = CY.createArray("meshUni", {
  struct: MeshUniformStruct,
  length: MAX_MESHES,
});

export const meshPoolPtr = CY.createMeshPool("meshPool", {
  computeVertsData,
  computeUniData,
  vertsPtr: meshVertsPtr,
  unisPtr: meshUnisPtr,
  triIndsPtr: meshTriIndsPtr,
  lineIndsPtr: meshLineIndsPtr,
});

export function computeUniData(m: Mesh): MeshUniformTS {
  const { min, max } = getAABBFromMesh(m);
  const uni: MeshUniformTS = {
    transform: mat4.create(),
    aabbMin: min,
    aabbMax: max,
    tint: vec3.create(),
  };
  return uni;
}

export function computeVertsData(m: Mesh): VertexTS[] {
  const vertsData: VertexTS[] = m.pos.map((pos, i) => ({
    position: pos,
    color: [0.0, 0.0, 0.0],
    normal: [1.0, 0.0, 0.0],
    uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
  }));
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    const normal = computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]]
    );
    vertsData[triInd[0]].normal = normal;
    vertsData[triInd[0]].color = m.colors[i];
  });
  return vertsData;
}

export const SceneStruct = createCyStruct(
  {
    cameraViewProjMatrix: "mat4x4<f32>",
    lightViewProjMatrix: "mat4x4<f32>",
    light1Dir: "vec3<f32>",
    light2Dir: "vec3<f32>",
    light3Dir: "vec3<f32>",
    cameraPos: "vec3<f32>",
    playerPos: "vec2<f32>",
    time: "f32",
    lights: "u32",
  },
  {
    isUniform: true,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.cameraViewProjMatrix, offsets_32[0]);
      views.f32.set(data.lightViewProjMatrix, offsets_32[1]);
      views.f32.set(data.light1Dir, offsets_32[2]);
      views.f32.set(data.light2Dir, offsets_32[3]);
      views.f32.set(data.light3Dir, offsets_32[4]);
      views.f32.set(data.cameraPos, offsets_32[5]);
      views.f32.set(data.playerPos, offsets_32[6]);
      views.f32[offsets_32[7]] = data.time;
      views.u32[offsets_32[8]] = data.lights;
    },
  }
);
export type SceneTS = CyToTS<typeof SceneStruct.desc>;

export const sceneBufPtr = CY.createSingleton("scene", {
  struct: SceneStruct,
  init: setupScene,
});

export function setupScene(): SceneTS {
  // create a directional light and compute it's projection (for shadows) and direction
  // TODO(@darzu): directional lights should be unit vectors then scaled by strength; remove strength from shader
  const worldOrigin = vec3.fromValues(0, 0, 0);
  const D = 50;
  const light1Pos = vec3.fromValues(D, D * 2, D);
  const light2Pos = vec3.fromValues(-D, D * 1, D);
  const light3Pos = vec3.fromValues(0, D * 0.5, -D);
  const light1Dir = vec3.subtract(vec3.create(), worldOrigin, light1Pos);
  vec3.normalize(light1Dir, light1Dir);
  const light2Dir = vec3.subtract(vec3.create(), worldOrigin, light2Pos);
  vec3.normalize(light2Dir, light2Dir);
  const light3Dir = vec3.subtract(vec3.create(), worldOrigin, light3Pos);
  vec3.normalize(light3Dir, light3Dir);

  return {
    cameraViewProjMatrix: mat4.create(), // updated later
    lightViewProjMatrix: mat4.create(), // updated later
    light1Dir,
    light2Dir,
    light3Dir,
    cameraPos: vec3.create(), // updated later
    playerPos: [0, 0], // updated later
    time: 0, // updated later
    lights: 0, // updated later
  };
}

export const PointLightStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    ambient: "vec3<f32>",
    diffuse: "vec3<f32>",
    specular: "vec3<f32>",

    constant: "f32",
    linear: "f32",
    quadratic: "f32",
  },
  { isUniform: true }
);

export type PointLightTS = CyToTS<typeof PointLightStruct.desc>;

export const pointLightsPtr = CY.createArray("pointLightsBuf", {
  struct: PointLightStruct,
  length: MAX_LIGHTS,
  forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

// TODO(@darzu): safer way to grab this format?
const mainFormat: GPUTextureFormat =
  navigator.gpu?.getPreferredCanvasFormat() ?? "bgra8unorm";

export const mainTexturePtr = CY.createTexture("mainTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: mainFormat,
  init: () => undefined,
  // TODO(@darzu): support anti-aliasing again
});

export const normalsTexturePtr = CY.createTexture("normalsTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba16float",
  init: () => undefined,
  // TODO(@darzu): support anti-aliasing again
});

export const canvasTexturePtr = CY.createTexture("canvasTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: mainFormat,
  attachToCanvas: true,
  init: () => undefined,
});

export const canvasDepthTex = CY.createDepthTexture("canvasDepth", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "depth24plus-stencil8",
  init: () => undefined,
});
