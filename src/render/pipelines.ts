import { mat4, vec3 } from "../gl-matrix.js";
import { computeTriangleNormal } from "../utils-3d.js";
import {
  createCyMany,
  createCyOne,
  createCyStruct,
  CyBuffer,
  CyStruct,
  CyStructDesc,
  CyToTS,
} from "./data.js";
import { MeshHandle, MeshPoolOpts } from "./mesh-pool.js";
import { getAABBFromMesh, Mesh } from "./mesh.js";
import {
  registerBufPtr,
  registerCompPipeline,
  registerRenderPipeline,
  registerIdxBufPtr,
  registerTexPtr,
  CyTexturePtr,
  registerMeshPoolPtr,
} from "./render_webgpu.js";
import { particle_shader, rope_shader } from "./shaders.js";

// TODO(@darzu):
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

export const RopeStickStruct = createCyStruct({
  aIdx: "u32",
  bIdx: "u32",
  length: "f32",
});
export type RopeStickTS = CyToTS<typeof RopeStickStruct.desc>;

export const SceneStruct = createCyStruct(
  {
    cameraViewProjMatrix: "mat4x4<f32>",
    light1Dir: "vec3<f32>",
    light2Dir: "vec3<f32>",
    light3Dir: "vec3<f32>",
    cameraPos: "vec3<f32>",
    playerPos: "vec2<f32>",
    time: "f32",
  },
  {
    isUniform: true,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.cameraViewProjMatrix, offsets_32[0]);
      views.f32.set(data.light1Dir, offsets_32[1]);
      views.f32.set(data.light2Dir, offsets_32[2]);
      views.f32.set(data.light3Dir, offsets_32[3]);
      views.f32.set(data.cameraPos, offsets_32[4]);
      views.f32.set(data.playerPos, offsets_32[5]);
      views.f32[offsets_32[6]] = data.time;
    },
  }
);
export type SceneTS = CyToTS<typeof SceneStruct.desc>;

export function setupScene(): SceneTS {
  // create a directional light and compute it's projection (for shadows) and direction
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
    light1Dir,
    light2Dir,
    light3Dir,
    cameraPos: vec3.create(), // updated later
    playerPos: [0, 0], // updated later
    time: 0, // updated later
  };
}

export const RopePointStruct = createCyStruct(
  {
    position: "vec3<f32>",
    prevPosition: "vec3<f32>",
    locked: "f32",
  },
  {
    isUniform: false,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.position, offsets_32[0]);
      views.f32.set(data.prevPosition, offsets_32[1]);
      views.f32[offsets_32[2]] = data.locked;
    },
  }
);
export type RopePointTS = CyToTS<typeof RopePointStruct.desc>;

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

export const CLOTH_W = 12;

function generateRopeGrid(): {
  ropePointData: RopePointTS[];
  ropeStickData: RopeStickTS[];
} {
  // setup scene data:
  // TODO(@darzu): allow init to pass in above

  // setup rope
  // TODO(@darzu): ROPE
  const ropePointData: RopePointTS[] = [];
  const ropeStickData: RopeStickTS[] = [];
  // let n = 0;
  const idx = (x: number, y: number) => {
    if (x >= CLOTH_W || y >= CLOTH_W) return CLOTH_W * CLOTH_W;
    return x * CLOTH_W + y;
  };
  for (let x = 0; x < CLOTH_W; x++) {
    for (let y = 0; y < CLOTH_W; y++) {
      let i = idx(x, y);
      // assert(i === n, "i === n");
      const pos: vec3 = [x, y + 4, 0];
      const p: RopePointTS = {
        position: pos,
        prevPosition: pos,
        locked: 0.0,
      };
      ropePointData[i] = p;

      // if (y + 1 < W && x + 1 < W) {
      // if (y + 1 < W) {
      ropeStickData.push({
        aIdx: i,
        bIdx: idx(x, y + 1),
        length: 1.0,
      });
      // }

      // if (x + 1 < W) {
      ropeStickData.push({
        aIdx: i,
        bIdx: idx(x + 1, y),
        length: 1.0,
      });
      // }
      // }

      // n++;
    }
  }

  console.log(RopeStickStruct.wgsl(true));

  // fix points
  ropePointData[idx(0, CLOTH_W - 1)].locked = 1.0;
  ropePointData[idx(CLOTH_W - 1, CLOTH_W - 1)].locked = 1.0;
  // for (let i = 0; i < ropePointData.length; i++)
  //   if (ropePointData[i].locked > 0) console.log(`locked: ${i}`);
  // console.dir(ropePointData);
  // console.dir(ropeStickData);

  return { ropePointData, ropeStickData };
}
let _initRopePointData: RopePointTS[];
let _initRopeStickData: RopeStickTS[];

const genRopePointData = () => {
  if (!_initRopePointData) {
    let res = generateRopeGrid();
    _initRopePointData = res.ropePointData;
    _initRopeStickData = res.ropeStickData;
  }
  return _initRopePointData;
};
const genRopeStickData = () => {
  if (!_initRopeStickData) {
    let res = generateRopeGrid();
    _initRopePointData = res.ropePointData;
    _initRopeStickData = res.ropeStickData;
  }
  return _initRopeStickData;
};

const sceneBufPtr = registerBufPtr({
  name: "scene",
  struct: SceneStruct,
  init: setupScene,
});
const ropePointBufPtr = registerBufPtr({
  name: "ropePoint",
  struct: RopePointStruct,
  init: genRopePointData,
});
const ropeStickBufPtr = registerBufPtr({
  name: "ropeStick",
  struct: RopeStickStruct,
  init: genRopeStickData,
});
const compRopePipelinePtr = registerCompPipeline({
  resources: [sceneBufPtr, ropePointBufPtr, ropeStickBufPtr],
  shader: rope_shader,
  shaderComputeEntry: "main",
});

// rope particle render
const ParticleVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
  },
  {
    isCompact: true,
  }
);
const initParticleVertData: () => CyToTS<
  typeof ParticleVertStruct.desc
>[] = () => [
  { position: [1, 1, 1] },
  { position: [1, -1, -1] },
  { position: [-1, 1, -1] },
  { position: [-1, -1, 1] },
];
const particleVertBufPtr = registerBufPtr({
  name: "particleVert",
  struct: ParticleVertStruct,
  init: initParticleVertData,
});

const initParticleIdxData = () =>
  new Uint16Array([2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 3, 1]);

const particleIdxBufPtr = registerIdxBufPtr({
  name: "particleIdx",
  init: initParticleIdxData,
});

const renderRopePipelineDesc = registerRenderPipeline({
  resources: [sceneBufPtr],
  meshOpt: {
    vertex: particleVertBufPtr,
    instance: ropePointBufPtr,
    index: particleIdxBufPtr,
    stepMode: "per-instance",
  },
  shader: particle_shader,
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
});

const CLOTH_SIZE = 10; // TODO(@darzu):

const clothTexPtrDesc: Omit<CyTexturePtr, "id"> = {
  name: "clothTex",
  size: [CLOTH_SIZE, CLOTH_SIZE],
  format: "rgba32float",
  init: () => {
    const clothData = new Float32Array(10 * 10 * 4);
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const i = (y + x * 10) * 3;
        clothData[i + 0] = i / clothData.length;
        clothData[i + 1] = i / clothData.length;
        clothData[i + 2] = i / clothData.length;
      }
    }
    return clothData;
  },
};
const clothTexPtr0 = registerTexPtr({
  ...clothTexPtrDesc,
  name: clothTexPtrDesc.name + "0",
});
const clothTexPtr1 = registerTexPtr({
  ...clothTexPtrDesc,
  name: clothTexPtrDesc.name + "1",
});

export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;

const meshVertsPtr = registerBufPtr({
  name: "meshVertsBuf",
  struct: VertexStruct,
  init: () => MAX_VERTICES,
});

const meshTriIndsPtr = registerIdxBufPtr({
  name: "meshTriIndsBuf",
  init: () => MAX_VERTICES,
});

const meshLineIndsPtr = registerIdxBufPtr({
  name: "meshLineIndsBuf",
  init: () => MAX_VERTICES * 2,
});

const meshUnisPtr = registerBufPtr({
  name: "meshUnisBuf",
  struct: MeshUniformStruct,
  init: () => MAX_MESHES,
});

export const meshPoolPtr = registerMeshPoolPtr({
  name: "meshPool",
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

// const renderTriPipelineDesc = registerMeshRenderPipeline({
//   resources: [sceneBufPtr],
//   meshOpt: {
//     pool: meshPoolPtr,
//     stepMode: "per-mesh-handle",
//   },
//   shader: mesh_shader,
//   shaderVertexEntry: "vert_main",
//   shaderFragmentEntry: "frag_main",
// });

/*
renderPipelineDesc_tris: GPURenderPipelineDescriptor = {
  layout: device.createPipelineLayout({
    bindGroupLayouts: [
      renderSceneUniBindGroupLayout,
      modelUniBindGroupLayout,
    ],
  }),
  vertex: {
    module: device.createShaderModule({ code: obj_vertShader() }),
    entryPoint: "main",
    buffers: [VertexStruct.vertexLayout("vertex", 0)],
  },
  fragment: {
    module: device.createShaderModule({ code: obj_fragShader() }),
    entryPoint: "main",
    targets: [{ format: canvasFormat }],
  },
  primitive: prim_tris,
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: "less",
    format: depthStencilFormat,
  },
  multisample: {
    count: antiAliasSampleCount,
  },
};


    // render triangles and lines
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setVertexBuffer(0, pool.verticesBuffer.buffer);

    // render triangles first
    if (renderer.drawTris) {
      bundleEnc.setPipeline(renderPipeline_tris);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.triIndicesBuffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        bundleEnc.drawIndexed(
          m.numTris * 3,
          undefined,
          m.triIndicesNumOffset,
          m.vertNumOffset
        );
      }
    }
*/
