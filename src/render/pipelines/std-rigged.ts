import { EM } from "../../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V } from "../../matrix/sprig-matrix.js";
import { assert, assertDbg } from "../../utils/util.js";
import { computeTriangleNormal } from "../../utils/utils-3d.js";
import { randColor } from "../../utils/utils-game.js";
import { CY, CyMeshPoolPtr } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { createMeshPool, MAX_INDICES, MeshHandle } from "../mesh-pool.js";
import {
  getAABBFromMesh,
  isRigged,
  Mesh,
  RiggedMesh,
} from "../../meshes/mesh.js";
import {
  computeUniData,
  mainDepthTex,
  MeshUniformStruct,
  MeshUniformTS,
  positionsTexturePtr,
  RenderDataStdDef,
  sceneBufPtr,
  surfacesTexturePtr,
  unlitTexturePtr,
  worldNormsAndFresTexPtr,
} from "./std-scene.js";
import { CyResources } from "../instantiator-webgpu.js";
import { createCyArray } from "../data-webgpu.js";
import { GPUBufferUsage } from "../webgpu-hacks.js";
import { Renderer } from "../renderer-ecs.js";

const MAX_MESHES = 20000;
const MAX_VERTICES = MAX_INDICES; // 21844;
// uniform buffer size is limited to 64k
const MAX_JOINTS = 200;

interface RiggedMeshWithJointIdx extends RiggedMesh {
  jointIdx: number;
}

export interface RiggedMeshHandle extends MeshHandle {
  jointIdx: number;
}

function isRiggedMeshWithJointIdx(m: Mesh): m is RiggedMeshWithJointIdx {
  return isRigged(m) && "jointIdx" in m;
}

const VertexStruct = createCyStruct(
  {
    // TODO: this could be vec4<u8>
    jointIds: "vec4<u32>",
    jointWeights: "vec4<f32>",
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    // TODO(@darzu): add UV back? needed for ocean stuff?
    uv: "vec2<f32>",
    surfaceId: "u32",
  },
  {
    isCompact: true,
    serializer: (
      { jointIds, jointWeights, position, color, normal, uv, surfaceId },
      _,
      offsets_32,
      views
    ) => {
      views.u32.set(jointIds, offsets_32[0]);
      views.f32.set(jointWeights, offsets_32[1]);
      views.f32.set(position, offsets_32[2]);
      views.f32.set(color, offsets_32[3]);
      views.f32.set(normal, offsets_32[4]);
      views.f32.set(uv, offsets_32[5]);
      views.u32[offsets_32[6]] = surfaceId;
    },
  }
);
type VertexTS = CyToTS<typeof VertexStruct.desc>;
function createEmptyVertexTS(): VertexTS {
  return {
    jointIds: V4.mk(),
    jointWeights: V4.mk(),
    position: V3.mk(),
    color: V3.mk(),
    // tangent: m.tangents ? m.tangents[i] : [1.0, 0.0, 0.0],
    normal: V3.mk(),
    uv: V(0, 0),
    surfaceId: 0,
  };
}

const JointStruct = createCyStruct(
  {
    jointMatrix: "mat4x4<f32>",
  },
  {
    isUniform: true,
    // TODO: daryl, why is this necessary? it fixes things :(
    hackArray: true,
  }
);
type JointTS = CyToTS<typeof JointStruct.desc>;

const jointBufPtr = CY.createArray("joint", {
  struct: JointStruct,
  init: MAX_JOINTS,
  forceUsage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const poolPtr = CY.createMeshPool("riggedMeshPool", {
  computeVertsData,
  computeUniData,
  vertsStruct: VertexStruct,
  unisStruct: MeshUniformStruct,
  maxMeshes: MAX_MESHES,
  maxSets: 5,
  // maxSets: 3,
  setMaxPrims: MAX_VERTICES * 2,
  setMaxVerts: MAX_VERTICES,
  // TODO(@darzu): this dataDef is v weird
  dataDef: RenderDataStdDef,
  prim: "tri",
});

// TODO: avoid duplicating std-scene
// TODO(@darzu): Allow updates directly to serialized data
// TODO(@darzu): Related, allow updates that don't change e.g. the normals
const tempVertsData: VertexTS[] = [];
function computeVertsData(
  m: Mesh,
  startIdx: number,
  count: number
): VertexTS[] {
  console.log("computeVertsData called");
  assertDbg(0 <= startIdx && startIdx + count <= m.pos.length);
  if (!isRiggedMeshWithJointIdx(m)) {
    throw `Got mesh without jointIdx`;
  }

  while (tempVertsData.length < count)
    tempVertsData.push(createEmptyVertexTS());

  assertDbg(
    !m.uvs || m.uvs.length === m.pos.length,
    `uvs.length != pos.length for ${m.dbgName}`
  );
  // if (!(!m.uvs || m.uvs.length === m.pos.length)) console.dir(m);

  for (let vi = startIdx; vi < startIdx + count; vi++) {
    const dIdx = vi - startIdx;
    // NOTE: assignment is fine since this better not be used without being re-assigned
    tempVertsData[dIdx].position = m.pos[vi];
    if (m.uvs) tempVertsData[dIdx].uv = m.uvs[vi];
    tempVertsData[dIdx].jointWeights = m.rigging.jointWeights[vi];
    m.rigging.jointIds[vi];
    // add index into global joint array
    for (let i = 0; i < 4; i++) {
      tempVertsData[dIdx].jointIds[i] = m.rigging.jointIds[vi][i] + m.jointIdx;
    }
  }
  // NOTE: for per-face data (e.g. color and surface IDs), first all the quads then tris
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    const provVi = triInd[0];
    // is triangle relevant to changed vertices?
    if (provVi < startIdx || startIdx + count <= provVi) return;

    const dIdx = provVi - startIdx;
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    // TODO(@darzu): what to do about normals. If we're modifying verts, they need to recompute. But it might be in the mesh.
    computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]],
      tempVertsData[dIdx].normal
    );
    const faceIdx = i + m.quad.length; // quads first
    // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
    tempVertsData[dIdx].color = m.colors[faceIdx];
    tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
  });

  m.quad.forEach((quadInd, i) => {
    // set provoking vertex data
    const provVi = quadInd[0];
    // is quad relevant to changed vertices?
    if (provVi < startIdx || startIdx + count <= provVi) return;

    const dIdx = provVi - startIdx;
    computeTriangleNormal(
      m.pos[quadInd[0]],
      m.pos[quadInd[1]],
      m.pos[quadInd[2]],
      tempVertsData[dIdx].normal
    );
    const faceIdx = i; // quads first
    // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
    tempVertsData[dIdx].color = m.colors[faceIdx];
    tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
  });

  return tempVertsData;
}

export interface RiggedMeshPool {
  addRiggedMesh(mesh: RiggedMesh): RiggedMeshHandle;
  // TODO: allow for partial updates?
  updateJointMatrices(handle: RiggedMeshHandle, mats: mat4[]): void;
  ptr: CyMeshPoolPtr<any, any>;
}

export function createRiggedMeshPool(renderer: Renderer): RiggedMeshPool {
  let nextJointIdx = 0;

  const joints = renderer.getCyResource(jointBufPtr)!;
  const pool = renderer.getCyResource(poolPtr)!;

  function addRiggedMesh(mesh: RiggedMesh): RiggedMeshHandle {
    const m: RiggedMeshWithJointIdx = {
      ...mesh,
      jointIdx: nextJointIdx,
    };
    nextJointIdx += m.rigging.parents.length;
    const handle = pool.addMesh(m);
    return { ...handle, jointIdx: m.jointIdx };
  }

  function updateJointMatrices(handle: RiggedMeshHandle, mats: mat4[]) {
    joints.queueUpdates(
      // TODO: avoid unnecessary object allocation here--this should
      // just be an array of mat4s
      mats.map((m) => ({
        jointMatrix: m,
      })),
      handle.jointIdx,
      0,
      mats.length
    );
  }

  return { addRiggedMesh, updateJointMatrices, ptr: poolPtr };
}

export const stdRiggedRenderPipeline = CY.createRenderPipeline(
  "stdRiggedRender",
  {
    globals: [sceneBufPtr, jointBufPtr],
    cullMode: "back",
    meshOpt: {
      pool: poolPtr,
      stepMode: "per-mesh-handle",
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    // TODO: do i need other outputs from std-mesh?
    output: [
      {
        ptr: unlitTexturePtr,
        clear: "never",
      },
      {
        ptr: worldNormsAndFresTexPtr,
        clear: "never",
      },
      {
        ptr: positionsTexturePtr,
        clear: "never",
      },
      {
        ptr: surfacesTexturePtr,
        clear: "never",
      },
    ],
    depthStencil: mainDepthTex,
    shader: (shaderSet) => shaderSet["std-rigged"].code,
  }
);
