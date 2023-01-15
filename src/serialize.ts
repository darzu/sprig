import { vec2, vec3, vec4, quat, mat4, V } from "./sprig-matrix.js";

// use network byte order
const LITTLE_ENDIAN = false;

export class OutOfRoomError extends Error {
  constructor(at: number) {
    super(`Out of room (at index ${at}`);
  }
}

export class Serializer {
  private _buffer: ArrayBuffer;
  private dataView: DataView;
  private cursor: number = 0;

  constructor(size: number) {
    if (size <= 0) {
      throw "Serializer size must be >= 0";
    }
    this._buffer = new ArrayBuffer(size);
    this.dataView = new DataView(this._buffer);
  }

  get buffer() {
    return new DataView(this._buffer, 0, this.cursor);
  }

  private index(at: number | null, length: number): number {
    if (at === null) {
      if (this.cursor + length > this._buffer.byteLength) {
        throw new OutOfRoomError(this.cursor);
      }
      at = this.cursor;
      this.cursor += length;
      return at;
    }
    if (at + length > this._buffer.byteLength) {
      throw new OutOfRoomError(at);
    }
    return at;
  }

  writeUint8(value: number, at: number | null = null): number {
    at = this.index(at, 1);
    this.dataView.setUint8(at, value);
    return at;
  }

  writeUint16(value: number, at: number | null = null): number {
    at = this.index(at, 2);
    this.dataView.setUint16(at, value, LITTLE_ENDIAN);
    return at;
  }

  writeUint32(value: number, at: number | null = null): number {
    at = this.index(at, 4);
    this.dataView.setUint32(at, value, LITTLE_ENDIAN);
    return at;
  }

  writeFloat32(value: number, at: number | null = null): number {
    at = this.index(at, 4);
    this.dataView.setFloat32(at, value, LITTLE_ENDIAN);
    return at;
  }

  writeVec2(value: vec2, at: number | null = null): number {
    at = this.index(at, 8);
    this.dataView.setFloat32(at, value[0], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 4, value[1], LITTLE_ENDIAN);
    return at;
  }

  writeVec3(value: vec3, at: number | null = null): number {
    at = this.index(at, 12);
    this.dataView.setFloat32(at, value[0], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 4, value[1], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 8, value[2], LITTLE_ENDIAN);
    return at;
  }

  writeQuat(value: quat, at: number | null = null): number {
    at = this.index(at, 16);
    this.dataView.setFloat32(at, value[0], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 4, value[1], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 8, value[2], LITTLE_ENDIAN);
    this.dataView.setFloat32(at + 12, value[3], LITTLE_ENDIAN);
    return at;
  }

  writeMat4(value: mat4, at: number | null = null): number {
    at = this.index(at, 4 * 16);
    for (let i = 0; i < 16; i++)
      this.dataView.setFloat32(at + i * 4, value[i], LITTLE_ENDIAN);
    return at;
  }

  writeString(value: string, at: number | null = null): number {
    if (value.length > 255) {
      throw "String too large";
    }
    at = this.index(at, value.length + 1);
    this.writeUint8(value.length, at++);
    for (let i = 0; i < value.length; i++) {
      this.writeUint8(value.charCodeAt(i), at++);
    }
    return at;
  }
}

export class Deserializer {
  private dataView: DataView;
  private cursor: number = 0;
  // set this to true if you don't want to actually deserialize.
  // Can be read from object deserializers
  dummy: boolean = false;

  constructor(buffer: ArrayBuffer) {
    this.dataView = new DataView(buffer);
  }

  readUint8(): number {
    let at = this.cursor;
    this.cursor += 1;
    return this.dataView.getUint8(at);
  }

  readUint16(): number {
    let at = this.cursor;
    this.cursor += 2;
    return this.dataView.getUint16(at, LITTLE_ENDIAN);
  }

  readUint32(): number {
    let at = this.cursor;
    this.cursor += 4;
    return this.dataView.getUint32(at, LITTLE_ENDIAN);
  }

  readFloat32(): number {
    let at = this.cursor;
    this.cursor += 4;
    return this.dataView.getFloat32(at, LITTLE_ENDIAN);
  }

  readVec2(into: vec2 | null = null): vec2 | null {
    let at = this.cursor;
    this.cursor += 8;
    if (!this.dummy) {
      if (into === null) {
        into = vec2.create();
      }
      into[0] = this.dataView.getFloat32(at, LITTLE_ENDIAN);
      into[1] = this.dataView.getFloat32(at + 4, LITTLE_ENDIAN);
    }
    return into;
  }

  readVec3(into: vec3 | null = null): vec3 | null {
    let at = this.cursor;
    this.cursor += 12;
    if (!this.dummy) {
      if (into === null) {
        into = vec3.create();
      }
      into[0] = this.dataView.getFloat32(at, LITTLE_ENDIAN);
      into[1] = this.dataView.getFloat32(at + 4, LITTLE_ENDIAN);
      into[2] = this.dataView.getFloat32(at + 8, LITTLE_ENDIAN);
    }
    return into;
  }

  readQuat(into: quat | null = null): quat | null {
    let at = this.cursor;
    this.cursor += 16;
    if (!this.dummy) {
      if (!into) {
        into = quat.create();
      }
      into[0] = this.dataView.getFloat32(at, LITTLE_ENDIAN);
      into[1] = this.dataView.getFloat32(at + 4, LITTLE_ENDIAN);
      into[2] = this.dataView.getFloat32(at + 8, LITTLE_ENDIAN);
      into[3] = this.dataView.getFloat32(at + 12, LITTLE_ENDIAN);
    }
    return into;
  }

  readMat4(into: mat4 | null = null): mat4 | null {
    let at = this.cursor;
    this.cursor += 16 * 4;
    if (!this.dummy) {
      if (!into) {
        into = mat4.create();
      }
      for (let i = 0; i < 16; i++)
        into[i] = this.dataView.getFloat32(at + i * 4, LITTLE_ENDIAN);
    }
    return into;
  }

  readString(): string {
    let length = this.readUint8();
    let s = "";
    for (let i = 0; i < length; i++) {
      s = s + String.fromCharCode(this.readUint8());
    }
    return s;
  }
}
