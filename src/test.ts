// Some serialization and deserialization tests

import { testImporters } from "./import_obj.js";
import { Serializer, Deserializer } from "./serialize.js";

function testBasics() {
  let s = new Serializer(100);
  s.writeUint32(42);
  let second = s.writeUint32(56);
  s.writeUint16(45);
  s.writeUint32(57, second);

  let d = new Deserializer(s.buffer);
  if (d.readUint32() !== 42) throw "test failure";
  if (d.readUint32() !== 57) throw "test failure";
  if (d.readUint16() !== 45) throw "test failure";
}

export function test() {
  const start = performance.now();
  console.log(`>>> STARTING TESTS`);

  testBasics();
  testImporters();

  const end = performance.now();
  console.log(`<<< ENDING TESTS (${(end - start).toFixed(1)}ms)`);
  if (end - start > 1000)
    throw `tests took longer than 1 second! shame on you.`;
}
