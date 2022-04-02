// Some serialization and deserialization tests
import { testImporters } from "./import_obj.js";
import { Serializer, Deserializer } from "./serialize.js";
function testBasics() {
    let s = new Serializer(100);
    s.writeUint32(42);
    let second = s.writeUint32(56);
    s.writeUint16(45);
    s.writeUint32(57, second);
    let d = new Deserializer(s.buffer.buffer);
    if (d.readUint32() !== 42)
        throw "test failure";
    if (d.readUint32() !== 57)
        throw "test failure";
    if (d.readUint16() !== 45)
        throw "test failure";
}
export function assert(cond, msg) {
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
    if (!cond)
        throw (msg !== null && msg !== void 0 ? msg : "Assertion failed; please add a helpful msg and yell at the lazy dev who didn't.");
}
export function test() {
    const start = performance.now();
    console.log(`>>> STARTING TESTS`);
    testBasics();
    testImporters();
    const end = performance.now();
    console.log(`<<< ENDING TESTS (${(end - start).toFixed(1)}ms)`);
    assert(end - start < 1000, `tests took longer than 1 second! shame on you.`);
}
//# sourceMappingURL=test.js.map