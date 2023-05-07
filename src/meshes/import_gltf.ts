import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { RawMesh } from "./mesh.js";
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
        COLOR?: number;
      };
      indices: number;
    }[];
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
): vec3[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"VEC4">
): vec4[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<"MAT4">
): mat4[] | ParseError;
function readArray(
  gltf: Gltf,
  buffers: ArrayBufferLike[],
  accessor: Accessor<GltfCollection>
): number[] | vec3[] | vec4[] | mat4[] | ParseError {
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
      const res: vec3[] = [];
      for (let i = 0; i < accessor.count; i++) {
        res.push(V(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));
      }
      return res;
    }
    case "VEC4": {
      const res: vec4[] = [];
      for (let i = 0; i < accessor.count; i++) {
        res.push(V(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]));
      }
      return res;
    }
    case "MAT4": {
      const res: mat4[] = [];
      for (let i = 0; i < accessor.count; i++) {
        const m = mat4.create();
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
  const pos: vec3[] | ParseError = readArray(gltf, buffers, posAccessor);
  if (isParseError(pos)) {
    return pos;
  }

  const normalAccessor = gltf.accessors[mesh.primitives[0].attributes.NORMAL];
  if (!isAccessorFor(normalAccessor, "VEC3")) {
    return `Unexpected normal type ${normalAccessor.type}`;
  }
  const normals: vec3[] | ParseError = readArray(gltf, buffers, normalAccessor);
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
  const tri: vec3[] = [];
  for (let i = 0; i < ind.length / 3; i++) {
    tri.push(V(ind[i * 3], ind[i * 3 + 1], ind[i * 3 + 2]));
  }

  let colors: vec3[];
  if (mesh.primitives[0].attributes.COLOR !== undefined) {
    const colorAccessor = gltf.accessors[mesh.primitives[0].indices];
    // hack--we actually want vec3s even though these are listed as scalars
    if (!isAccessorFor(colorAccessor, "VEC3")) {
      return `Unexpected color type ${colorAccessor.type}`;
    }
    const maybeColors = readArray(gltf, buffers, colorAccessor);
    if (isParseError(maybeColors)) {
      return maybeColors;
    }
    colors = maybeColors;
  } else {
    colors = tri.map(() => V(0.1, 0.1, 0.1));
  }

  const quad: vec4[] = [];
  const dbgName = mesh.name;
  // TODO: include normals
  return { pos, tri, normals, quad, colors, dbgName };
}
