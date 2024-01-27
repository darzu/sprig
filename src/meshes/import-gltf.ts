import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { RawMesh, Rigging } from "./mesh.js";
import { assert, never } from "../utils/util.js";
import { idPair, IdPair, isString } from "../utils/util.js";
import { texTypeIsDepthAndStencil } from "../render/gpu-struct.js";
import { vec3Dbg } from "../utils/utils-3d.js";

export type ParseError = string; // TODO(@darzu): more sophisticated error format?

function isParseError(m: any | ParseError): m is ParseError {
  return isString(m);
}

const MAGIC_VALUE = 0x46546c67;
const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

type GltfCollection = "SCALAR" | "VEC3" | "VEC4" | "MAT4";

interface Accessor<S extends GltfCollection> {
  type: S;
  componentType: number;
  bufferView: number;
  count: number;
}

interface Gltf {
  accessors: Accessor<GltfCollection>[];
  bufferViews: {
    buffer: number;
    byteOffset: number;
    byteLength: number;
  }[];
  meshes: {
    name: string;
    primitives: {
      attributes: {
        POSITION: number;
        NORMAL: number;
        JOINTS_0: number;
        WEIGHTS_0: number;
        COLOR_0?: number;
      };
      indices: number;
    }[];
  }[];
  skins?: {
    inverseBindMatrices: number;
    joints: number[];
    name: string;
  }[];
  animations: {
    channels: {
      sampler: number;
      target: {
        node: number;
        path: "rotation" | "translation" | "scale" | "weights";
      };
    }[];
    samplers: {
      input: number;
      interpolation: string;
      output: number;
    }[];
  }[];
  nodes: {
    name: string;
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    translation?: [number, number, number];
    children?: number[];
  }[];
}

function typedBufferView(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  bufferViewIdx: number,
  componentType: number
): ArrayLike<number> | ParseError {
  const bufferView = gltf.bufferViews[bufferViewIdx];
  switch (componentType) {
    case 5121: // GL_UNSIGNED_BYTE
      return new Uint8Array(
        buffers[bufferView.buffer],
        bufferView.byteOffset,
        bufferView.byteLength / Uint8Array.BYTES_PER_ELEMENT
      );
    case 5123: // GL_UNSIGNED_SHORT
      return new Uint16Array(
        buffers[bufferView.buffer],
        bufferView.byteOffset,
        bufferView.byteLength / Uint16Array.BYTES_PER_ELEMENT
      );
    case 5126: // GL_FLOAT
      return new Float32Array(
        buffers[bufferView.buffer],
        bufferView.byteOffset,
        bufferView.byteLength / Float32Array.BYTES_PER_ELEMENT
      );
  }
  return `Array constructor not found for component type ${componentType}`;
}

function isAccessorFor<S extends GltfCollection>(
  accessor: Accessor<GltfCollection>,
  type: S
): accessor is Accessor<S> {
  return accessor.type === type;
}

function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"SCALAR">
): number[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"VEC3">
): V3[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"VEC4">
): V4[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"MAT4">
): mat4[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<GltfCollection>
): number[] | V3[] | V4[] | mat4[] | ParseError {
  const arr = typedBufferView(
    gltf,
    buffers,
    accessor.bufferView,
    accessor.componentType
  );
  if (isParseError(arr)) {
    return arr;
  }
  switch (accessor.type) {
    case "SCALAR": {
      const res: number[] = [];
      for (let i = 0; i < accessor.count; i++) {
        res.push(arr[i]);
      }
      return res;
    }
    case "VEC3": {
      const res: V3[] = [];
      for (let i = 0; i < accessor.count; i++) {
        res.push(V(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));
      }
      return res;
    }
    case "VEC4": {
      const res: V4[] = [];
      for (let i = 0; i < accessor.count; i++) {
        res.push(V(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]));
      }
      return res;
    }
    case "MAT4": {
      const res: mat4[] = [];
      for (let i = 0; i < accessor.count; i++) {
        const m = mat4.create();
        res.push(m);
        for (let j = 0; j < m.length; j++) {
          m[j] = arr[i * m.length + j];
        }
      }
      return res;
    }
  }
}

// all numbers are little-endian
export function importGltf(buf: ArrayBuffer): RawMesh | ParseError {
  const bytesView = new DataView(buf);
  const magic = bytesView.getUint32(0, true);
  if (magic !== MAGIC_VALUE) {
    return "Bad magic value";
  }
  // byte 1 is the version, we ignore it
  const totalLength = bytesView.getUint32(
    2 * Uint32Array.BYTES_PER_ELEMENT,
    true
  );
  // now we're into the chunked data. chunk 0 is always json
  const jsonLength = bytesView.getUint32(
    3 * Uint32Array.BYTES_PER_ELEMENT,
    true
  );
  const chunk0Type = bytesView.getUint32(
    4 * Uint32Array.BYTES_PER_ELEMENT,
    true
  );
  if (chunk0Type != JSON_TYPE) {
    return "Chunk 0 not JSON";
  }
  const jsonBuf = new Uint8Array(
    buf,
    5 * Uint32Array.BYTES_PER_ELEMENT,
    jsonLength
  );
  const jsonStr = new TextDecoder("utf-8").decode(jsonBuf);
  const gltf = JSON.parse(jsonStr) as Gltf;
  console.dir(gltf);

  const buffers: ArrayBufferLike[] = [];
  let nextChunkStart = 5 * Uint32Array.BYTES_PER_ELEMENT + jsonLength;
  let chunksFound = 0;
  while (nextChunkStart < totalLength) {
    chunksFound++;
    const chunkLength = bytesView.getUint32(nextChunkStart, true);
    const chunkType = bytesView.getUint32(
      nextChunkStart + Uint32Array.BYTES_PER_ELEMENT,
      true
    );
    if (chunkType != BIN_TYPE) {
      return `Non-bin chunk ${chunksFound} found (length ${chunkLength}`;
    }
    // TODO: this does a copy, which is needlessly inefficient
    buffers.push(
      buf.slice(
        nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT,
        nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT + chunkLength
      )
    );
    nextChunkStart =
      nextChunkStart + 2 * Uint32Array.BYTES_PER_ELEMENT + chunkLength;
  }
  (window as any).buffers = buffers;

  if (gltf.meshes.length !== 1) {
    return `Found ${gltf.meshes.length} meshes in gltf file, expected 1`;
  }

  const mesh = gltf.meshes[0];
  if (mesh.primitives.length !== 1) {
    return `Found ${mesh.primitives.length} primitives in gltf mesh, expected 1`;
  }
  const posAccessor = gltf.accessors[mesh.primitives[0].attributes.POSITION];
  if (!isAccessorFor(posAccessor, "VEC3")) {
    return `Unexpected position type ${posAccessor.type}`;
  }
  const pos: V3[] | ParseError = readArray(gltf, buffers, posAccessor);
  if (isParseError(pos)) {
    return pos;
  }

  const normalAccessor = gltf.accessors[mesh.primitives[0].attributes.NORMAL];
  if (!isAccessorFor(normalAccessor, "VEC3")) {
    return `Unexpected normal type ${normalAccessor.type}`;
  }
  const normals: V3[] | ParseError = readArray(gltf, buffers, normalAccessor);
  if (isParseError(normals)) {
    return normals;
  }

  const indexAccessor = gltf.accessors[mesh.primitives[0].indices];
  // hack--we actually want vec3s even though these are listed as scalars
  if (!isAccessorFor(indexAccessor, "SCALAR")) {
    return `Unexpected index type ${indexAccessor.type}`;
  }
  const ind: number[] | ParseError = readArray(gltf, buffers, indexAccessor);
  if (isParseError(ind)) {
    return ind;
  }
  const tri: V3[] = [];
  for (let i = 0; i < ind.length / 3; i++) {
    tri.push(V(ind[i * 3], ind[i * 3 + 1], ind[i * 3 + 2]));
  }

  let colors: V3[];
  if (mesh.primitives[0].attributes.COLOR_0 !== undefined) {
    //console.log("loading colors");
    const colorAccessor = gltf.accessors[mesh.primitives[0].attributes.COLOR_0];
    // hack--we actually want vec3s even though these are listed as scalars
    if (!isAccessorFor(colorAccessor, "VEC4")) {
      return `Unexpected color type ${colorAccessor.type}`;
    }
    const maybeColors = readArray(gltf, buffers, colorAccessor);
    if (isParseError(maybeColors)) {
      return maybeColors;
    }
    // console.log(
    //   `got ${maybeColors.length} colors for ${tri.length} triangles and ${pos.length} pos`
    // );
    colors = [];
    for (let i = 0; i < tri.length; i++) {
      // just grab the color for the 0th vertex
      const color = maybeColors[tri[i][0]];
      colors.push(V(color[0] / 65535, color[1] / 65535, color[2] / 65535));
    }
  } else {
    //console.log("setting colors to default");
    colors = tri.map(() => V(0.1, 0.1, 0.1));
  }

  let rigging: Rigging | undefined = undefined;
  // joints
  if (gltf.skins !== undefined && gltf.skins.length > 0) {
    if (gltf.skins.length !== 1) {
      return `Got ${gltf.skins.length} skins, expected 0 or 1`;
    }

    const jointIdsAccessor =
      gltf.accessors[mesh.primitives[0].attributes.JOINTS_0];
    if (!isAccessorFor(jointIdsAccessor, "VEC4")) {
      return `Unexpected index type ${jointIdsAccessor.type}`;
    }
    const jointIds: V4[] | ParseError = readArray(
      gltf,
      buffers,
      jointIdsAccessor
    );
    if (isParseError(jointIds)) {
      return jointIds;
    }

    const jointWeightsAccessor =
      gltf.accessors[mesh.primitives[0].attributes.WEIGHTS_0];
    if (!isAccessorFor(jointWeightsAccessor, "VEC4")) {
      return `Unexpected index type ${jointWeightsAccessor.type}`;
    }
    const jointWeights: V4[] | ParseError = readArray(
      gltf,
      buffers,
      jointWeightsAccessor
    );
    if (isParseError(jointWeights)) {
      return jointWeights;
    }

    const inverseBindMatricesAccessor =
      gltf.accessors[gltf.skins[0].inverseBindMatrices];
    if (!isAccessorFor(inverseBindMatricesAccessor, "MAT4")) {
      return `Unexpected index type ${inverseBindMatricesAccessor.type}`;
    }
    const inverseBindMatrices: mat4[] | ParseError = readArray(
      gltf,
      buffers,
      inverseBindMatricesAccessor
    );
    if (isParseError(inverseBindMatrices)) {
      return inverseBindMatrices;
    }
    const jointPos: V3[] = [];
    const jointRot: quat[] = [];
    const jointScale: V3[] = [];
    const parents: number[] = [];

    // by default, parent every joint to itself
    for (let i = 0; i < gltf.skins[0].joints.length; i++) {
      parents.push(i);
    }

    const jointNodeIdxToJointIdx = new Map<number, number>();
    gltf.skins[0].joints.forEach((jointNodeIdx, jointIdx) =>
      jointNodeIdxToJointIdx.set(jointNodeIdx, jointIdx)
    );

    let i = 0;
    for (let jointNodeIdx of gltf.skins[0].joints) {
      const jointNode = gltf.nodes[jointNodeIdx];
      jointPos.push(
        V3.clone(jointNode.translation ? jointNode.translation : V(0, 0, 0))
      );
      jointRot.push(
        jointNode.rotation ? quat.clone(jointNode.rotation) : quat.mk()
      );
      jointScale.push(jointNode.scale ? V3.clone(jointNode.scale) : V(1, 1, 1));

      if (jointNode.children) {
        for (let childNodeIdx of jointNode.children) {
          if (jointNodeIdxToJointIdx.has(childNodeIdx)) {
            parents[jointNodeIdxToJointIdx.get(childNodeIdx)!] = i;
          }
        }
      }
      i++;
    }

    // check to see that this is in topo order
    if (parents.some((value, index) => value > index)) {
      return `Joints expected to be in topological order`;
    }

    const poseRot: quat[][] = [];
    // We have joints and initial values now. Now we'll find poses. We
    // get these from a single animation, and we ignore keyframe
    // times--we just care about the actual pose in each keyframe.
    if (gltf.animations) {
      if (gltf.animations.length !== 1) return `Got more than 1 animation`;
      const animation = gltf.animations[0];
      // for now, we want exactly one channel and sampler for each joint
      // TODO: set default rotations or something in order to avoid this
      if (animation.channels.length !== parents.length)
        return `Have ${parents.length} joints but got ${animation.channels.length} animation channels`;
      if (animation.samplers.length !== parents.length)
        return `Have ${parents.length} joints but got ${animation.samplers.length} animation samplers`;

      // also, expect every sampler to have the same "input". this
      // defines the keyframes; we don't actually care about the times
      // listed, just how many of them there are (bc those are our
      // poses)

      if (
        animation.samplers.some(
          (sampler) => sampler.input !== animation.samplers[0].input
        )
      )
        return `Got samplers with two different inputs`;

      // finally, we only support rotation animations for now
      if (
        animation.channels.some((channel) => channel.target.path !== "rotation")
      )
        return `Got non-rotation animation`;

      const inputAccessor = gltf.accessors[animation.samplers[0].input];
      const nPoses = inputAccessor.count;
      // fill out poseRot with identity quats for now
      for (let i = 0; i < nPoses; i++) {
        poseRot.push([]);
        for (let j = 0; j < parents.length; j++) {
          poseRot[i].push(quat.mk());
        }
      }

      // now, get the actual rotations from the channels and samplers
      for (let channel of animation.channels) {
        let jointIdx = jointNodeIdxToJointIdx.get(channel.target.node);
        if (jointIdx === undefined) {
          return `Animation targeting non-joint node ${jointIdx}`;
        }
        const sampler = animation.samplers[channel.sampler];
        const outputAccessor = gltf.accessors[sampler.output];
        if (!isAccessorFor(outputAccessor, "VEC4")) {
          return `Got bad accessor type for animation sampler`;
        }
        const rotations: V4[] | ParseError = readArray(
          gltf,
          buffers,
          outputAccessor
        );
        if (isParseError(rotations)) {
          return rotations;
        }
        for (let pose = 0; pose < nPoses; pose++) {
          // in the CUBICSPLINE interpolation mode we get tangent
          // values. These always seem to be all zeroes, so we ignore
          // them.
          if (sampler.interpolation == "CUBICSPLINE") {
            poseRot[pose][jointIdx] = rotations[pose * 3 + 1];
          } else {
            poseRot[pose][jointIdx] = rotations[pose];
          }
        }
      }
    }

    rigging = {
      jointIds,
      jointWeights,
      inverseBindMatrices,
      jointPos,
      jointRot,
      jointScale,
      parents,
      poseRot,
    };
    console.log(rigging);
  }

  const quad: V4[] = [];
  const dbgName = mesh.name;
  // TODO: include normals
  return { pos, tri, normals, quad, colors, dbgName, rigging };
}
