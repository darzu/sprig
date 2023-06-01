// Some serialization and deserialization tests

import { RUN_UNIT_TESTS, VERBOSE_LOG } from "../flags.js";
import { testImporters } from "../meshes/import-obj.js";
import { Serializer, Deserializer } from "./serialize.js";
import { assert, testPackUnpackI16 } from "./util.js";

function testSerializeDeserialzers() {
  let s = new Serializer(100);
  s.writeUint32(42);
  let second = s.writeUint32(56);
  s.writeUint16(45);
  s.writeUint32(57, second);

  let d = new Deserializer(s.buffer.buffer);
  if (d.readUint32() !== 42) throw "test failure";
  if (d.readUint32() !== 57) throw "test failure";
  if (d.readUint16() !== 45) throw "test failure";
}

export function test() {
  if (!RUN_UNIT_TESTS) {
    if (VERBOSE_LOG) console.log(`Skipping unit tests (!RUN_UNIT_TESTS)`);
    return;
  }
  const start = performance.now();
  console.log(`>>> STARTING TESTS`);

  testSerializeDeserialzers();
  testImporters();
  testPackUnpackI16();

  const end = performance.now();
  console.log(`<<< ENDING TESTS (${(end - start).toFixed(1)}ms)`);
  assert(end - start < 1000, `tests took longer than 1 second! shame on you.`);
}
