import { vec3, mat4 } from "../../gl-matrix.js";
import { computeTriangleNormal } from "../../utils-3d.js";
import { CY } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { MAX_INDICES, MeshHandle } from "../mesh-pool.js";
import { getAABBFromMesh, Mesh } from "../mesh.js";

export const MAX_MESHES = 20000;
export const MAX_VERTICES = MAX_INDICES; // 21844;

export const VertexStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    // uv: "vec2<f32>",
    surfaceId: "u32",
  },
  {
    isCompact: true,
    serializer: (
      {
        position,
        color,
        normal,
        // uv,
        surfaceId,
      },
      _,
      offsets_32,
      views
    ) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      // views.f32.set(uv, offsets_32[3]);
      // views.u32[offsets_32[4]] = surfaceId;
      views.u32[offsets_32[3]] = surfaceId;
    },
  }
);
export type VertexTS = CyToTS<typeof VertexStruct.desc>;
export function createEmptyVertexTS(): VertexTS {
  return {
    position: vec3.create(),
    color: vec3.create(),
    // tangent: m.tangents ? m.tangents[i] : [1.0, 0.0, 0.0],
    normal: vec3.create(),
    // uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
    surfaceId: 0,
  };
}

export const MeshUniformStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    // aabbMin: "vec3<f32>",
    // aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
    id: "u32",
    // TODO: is this a good idea?
    flags: "u32",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      // views.f32.set(d.aabbMin, offsets_32[1]);
      // views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[1]);
      views.u32[offsets_32[2]] = d.id;
      views.u32[offsets_32[3]] = d.flags;
    },
  }
);

export const FLAG_UNLIT = 1;

export type MeshUniformTS = CyToTS<typeof MeshUniformStruct.desc>;

const meshVertsPtr = CY.createArray("meshVertsBuf", {
  struct: VertexStruct,
  init: MAX_VERTICES,
});

const meshTriIndsPtr = CY.createIdxBuf("meshTriIndsBuf", {
  init: () => MAX_VERTICES * 3,
});

const meshLineIndsPtr = CY.createIdxBuf("meshLineIndsBuf", {
  init: () => MAX_VERTICES * 2,
});

const meshUnisPtr = CY.createArray("meshUni", {
  struct: MeshUniformStruct,
  init: MAX_MESHES,
});

export const meshPoolPtr = CY.createMeshPool("meshPool", {
  computeVertsData,
  computeUniData,
  vertsPtr: meshVertsPtr,
  unisPtr: meshUnisPtr,
  triIndsPtr: meshTriIndsPtr,
  lineIndsPtr: meshLineIndsPtr,
});

// TODO: does this need to be passed into the mesh pool anymore?
export function computeUniData(m: Mesh): MeshUniformTS {
  const { min, max } = getAABBFromMesh(m);
  const uni: MeshUniformTS = {
    transform: mat4.create(),
    // aabbMin: min,
    // aabbMax: max,
    tint: vec3.create(),
    id: 0,
    flags: 0,
  };
  return uni;
}

// TODO(@darzu): Allow partial updates (start + len?)
// TODO(@darzu): Allow updates directly to serialized data
// TODO(@darzu): Related, allow updates that don't change e.g. the normals
const tempVertsData: VertexTS[] = [];
export function computeVertsData(
  m: Mesh,
  startIdx?: number,
  count?: number
): VertexTS[] {
  count = count ?? m.pos.length;
  startIdx = startIdx ?? 0;

  const missingLen = m.pos.length - tempVertsData.length;
  if (missingLen > 0) {
    for (let i = 0; i < missingLen; i++)
      tempVertsData.push(createEmptyVertexTS());
  }
  m.pos.forEach((pos, i) => {
    // NOTE: assignment is fine since this better not be used without being re-assigned
    tempVertsData[i].position = pos;
    // TODO(@darzu): UVs again?
    // if (m.uvs)
    //   tempVertsData[i].uv = m.uvs[i];
  });
  // NOTE: for per-face data (e.g. color and surface IDs), first all the quads then tris
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    // TODO(@darzu): what to do about normals. If we're modifying verts, they need to recompute. But it might be in the mesh.
    const normal = computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]]
    );
    tempVertsData[triInd[0]].normal = normal;
    const faceIdx = i + m.quad.length; // quads first
    tempVertsData[triInd[0]].color = m.colors[faceIdx];
    tempVertsData[triInd[0]].surfaceId = m.surfaceIds[faceIdx];
  });
  m.quad.forEach((quadInd, i) => {
    // set provoking vertex data
    const normal = computeTriangleNormal(
      m.pos[quadInd[0]],
      m.pos[quadInd[1]],
      m.pos[quadInd[2]]
    );
    tempVertsData[quadInd[0]].normal = normal;
    // TODO(@darzu): this isn't right, colors and surfaceIds r being indexed by tris and quads
    tempVertsData[quadInd[0]].color = m.colors[i];
    tempVertsData[quadInd[0]].surfaceId = m.surfaceIds[i];
  });

  return tempVertsData;
}

export const SceneStruct = createCyStruct(
  {
    cameraViewProjMatrix: "mat4x4<f32>",
    //lightViewProjMatrix: "mat4x4<f32>",
    //dirLight1: "vec3<f32>",
    // dirLight2: "vec3<f32>",
    // dirLight3: "vec3<f32>",
    cameraPos: "vec3<f32>",
    partyPos: "vec3<f32>",
    // TODO(@darzu): timeDelta vs totalTime
    time: "f32",
    canvasAspectRatio: "f32",
    maxSurfaceId: "u32",
    numPointLights: "u32",
    numGerstnerWaves: "u32",
  },
  {
    isUniform: true,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.cameraViewProjMatrix, offsets_32[0]);
      //views.f32.set(data.lightViewProjMatrix, offsets_32[1]);
      // views.f32.set(data.dirLight1, offsets_32[2]);
      // views.f32.set(data.dirLight2, offsets_32[3]);
      // views.f32.set(data.dirLight3, offsets_32[4]);
      views.f32.set(data.cameraPos, offsets_32[1]);
      views.f32.set(data.partyPos, offsets_32[2]);
      views.f32[offsets_32[3]] = data.time;
      views.f32[offsets_32[4]] = data.canvasAspectRatio;
      views.u32[offsets_32[5]] = data.maxSurfaceId;
      views.u32[offsets_32[6]] = data.numPointLights;
      views.u32[offsets_32[7]] = data.numGerstnerWaves;
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
  // TODO(@darzu): should be named "dirLight1" etc. These are direction + strength, not unit.
  // const dirLight1 = vec3.fromValues(1, -1 * 2, 1);
  // vec3.normalize(dirLight1, dirLight1);
  // vec3.scale(dirLight1, dirLight1, 2.0);

  // const dirLight2 = vec3.fromValues(1, -1 * 1, -1);
  // vec3.normalize(dirLight2, dirLight2);
  // vec3.scale(dirLight2, dirLight2, 0.5);

  // const dirLight3 = vec3.fromValues(0, -1 * 0.5, 1);
  // vec3.normalize(dirLight3, dirLight3);
  // vec3.scale(dirLight3, dirLight3, 0.2);

  return {
    cameraViewProjMatrix: mat4.create(), // updated later
    //lightViewProjMatrix: mat4.create(), // updated later
    // dirLight1,
    // dirLight2,
    // dirLight3,
    cameraPos: vec3.create(), // updated later
    partyPos: vec3.create(), // updated later
    time: 0, // updated later
    canvasAspectRatio: 1, // updated later
    maxSurfaceId: 1, // updated later
    numPointLights: 0, // updated later
    numGerstnerWaves: 0, // updated later
  };
}

// TODO(@darzu): safer way to grab this format?
const canvasFormat: GPUTextureFormat = //"bgra8unorm-srgb";
  navigator.gpu?.getPreferredCanvasFormat() ?? "bgra8unorm";

export const litTexturePtr = CY.createTexture("mainTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba16float",
  // TODO(@darzu): support anti-aliasing again
});

export const normalsTexturePtr = CY.createTexture("normalsTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba16float",
  // TODO(@darzu): support anti-aliasing again
});

export const positionsTexturePtr = CY.createTexture("positionsTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba16float",
  // TODO(@darzu): support anti-aliasing again
});

export const surfacesTexturePtr = CY.createTexture("surfacesTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rg16uint",
});

export const canvasTexturePtr = CY.createTexture("canvasTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: canvasFormat,
  attachToCanvas: true,
});

export const mainDepthTex = CY.createDepthTexture("canvasDepth", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "depth32float",
  // format: "depth24plus-stencil8",
});
