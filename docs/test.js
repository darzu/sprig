// Some serialization and deserialization tests
import { Serializer, Deserializer } from "./serialize.js";
function testBasics() {
    let s = new Serializer(100);
    s.writeUint32(42);
    let second = s.writeUint32(56);
    s.writeUint16(45);
    s.writeUint32(57, second);
    let d = new Deserializer(s.buffer);
    if (d.readUint32() !== 42)
        throw "test failure";
    if (d.readUint32() !== 57)
        throw "test failure";
    if (d.readUint16() !== 45)
        throw "test failure";
}
export function test() {
    testBasics();
}
//# sourceMappingURL=test.js.map