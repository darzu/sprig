export function exportSprigMesh(mesh) {
    return {
        vertices: serializeVecArray(mesh.pos),
        triangles: serializeVecArray(mesh.tri),
    };
}
export function importSprigMesh(smesh) {
    const res = {
        pos: deserializeVecArray(smesh.vertices),
        tri: deserializeVecArray(smesh.triangles),
    };
    // TODO(@darzu): colors
    res.colors = res.tri.map((_) => [0.1, 0.1, 0.1]);
    return res;
}
function serializeVecArray(f32s) {
    const buf = new Float32Array(f32s.reduce((p, n) => [...p, ...n], []));
    return serializeBuf(buf.buffer);
}
function serializeBuf(buf) {
    const dataU8 = new Uint8Array(buf);
    let dataStr = ``;
    for (let i = 0; i < dataU8.length; i++)
        dataStr += String.fromCharCode(dataU8[i]);
    return btoa(dataStr);
}
function deserializeVecArray(b64) {
    const buf = deserializeBuf(b64);
    const f32s = new Float32Array(buf);
    if (f32s.length % 3 !== 0)
        throw `cannot deserialize float32 array into vec3s if it isnt a multiple of 3`;
    const res = [];
    for (let i = 0; i < f32s.length; i += 3) {
        res.push([f32s[i], f32s[i + 1], f32s[i + 2]]);
    }
    return res;
}
function deserializeBuf(b64) {
    const dataStr = atob(b64);
    const dataU8 = new Uint8Array(dataStr.length);
    for (let i = 0; i < dataStr.length; i++) {
        dataU8[i] = dataStr.charCodeAt(i);
    }
    return dataU8.buffer;
}
//# sourceMappingURL=import_sprigmesh.js.map