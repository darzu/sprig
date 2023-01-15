import { vec2, vec3, vec4, quat, mat4, V } from "./sprig-matrix.js";
import { RawMesh } from "./render/mesh.js";

// TODO(@darzu): maybe never mind any of this? doesn't get much more compressed that .toFixed(2)'ing everything
// TODO(@darzu): this is all somewhat inefficient and will probalby crumble for large files
// TODO(@darzu): also can we store in smaller than f32?
// TODO(@darzu): colors?

export type Base64String = string;

export interface SprigMesh {
  vertices: Base64String;
  triangles: Base64String;
}

export function exportSprigMesh(mesh: RawMesh): SprigMesh {
  return {
    vertices: serializeVecArray(mesh.pos),
    triangles: serializeVecArray(mesh.tri),
  };
}

export function importSprigMesh(smesh: SprigMesh): RawMesh {
  const res: Partial<RawMesh> = {
    pos: deserializeVecArray(smesh.vertices),
    tri: deserializeVecArray(smesh.triangles),
  };

  // TODO(@darzu): colors
  res.colors = res.tri!.map((_) => V(0.1, 0.1, 0.1));

  return res as RawMesh;
}

function serializeVecArray(f32s: vec3[]): string {
  const buf = new Float32Array(
    f32s.reduce((p, n) => [...p, ...n], [] as number[])
  );
  return serializeBuf(buf.buffer);
}
function serializeBuf(buf: ArrayBufferLike): Base64String {
  const dataU8 = new Uint8Array(buf);
  let dataStr = ``;
  for (let i = 0; i < dataU8.length; i++)
    dataStr += String.fromCharCode(dataU8[i]);
  return btoa(dataStr);
}

function deserializeVecArray(b64: string): vec3[] {
  const buf = deserializeBuf(b64);
  const f32s = new Float32Array(buf);
  if (f32s.length % 3 !== 0)
    throw `cannot deserialize float32 array into vec3s if it isnt a multiple of 3`;
  const res: vec3[] = [];
  for (let i = 0; i < f32s.length; i += 3) {
    res.push(V(f32s[i], f32s[i + 1], f32s[i + 2]));
  }
  return res;
}
function deserializeBuf(b64: Base64String): ArrayBufferLike {
  const dataStr = atob(b64);
  const dataU8 = new Uint8Array(dataStr.length);
  for (let i = 0; i < dataStr.length; i++) {
    dataU8[i] = dataStr.charCodeAt(i);
  }
  return dataU8.buffer;
}
