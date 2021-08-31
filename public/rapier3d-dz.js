// wasm-deferred:/Users/darzu/projects/rapier3d-dz/rapier_wasm3d_bg.wasm
var rapier_wasm3d_bg_default = "./rapier_wasm3d_bg-EN2MUG3Q.wasm";

// rapier_wasm3d_bg.js
var heap = new Array(32).fill(void 0);
heap.push(void 0, null, true, false);
function getObject(idx) {
  return heap[idx];
}
var heap_next = heap.length;
function dropObject(idx) {
  if (idx < 36)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
function addHeapObject(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
var lTextDecoder = typeof TextDecoder === "undefined" ? (0, module.require)("util").TextDecoder : TextDecoder;
var cachedTextDecoder = new lTextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
var cachegetUint8Memory0 = null;
function getUint8Memory0() {
  if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== memory.buffer) {
    cachegetUint8Memory0 = new Uint8Array(memory.buffer);
  }
  return cachegetUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
var cachegetFloat64Memory0 = null;
function getFloat64Memory0() {
  if (cachegetFloat64Memory0 === null || cachegetFloat64Memory0.buffer !== memory.buffer) {
    cachegetFloat64Memory0 = new Float64Array(memory.buffer);
  }
  return cachegetFloat64Memory0;
}
var cachegetInt32Memory0 = null;
function getInt32Memory0() {
  if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== memory.buffer) {
    cachegetInt32Memory0 = new Int32Array(memory.buffer);
  }
  return cachegetInt32Memory0;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
var WASM_VECTOR_LEN = 0;
var lTextEncoder = typeof TextEncoder === "undefined" ? (0, module.require)("util").TextEncoder : TextEncoder;
var cachedTextEncoder = new lTextEncoder("utf-8");
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length);
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len);
  const mem = getUint8Memory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3);
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function version2() {
  try {
    const retptr = __wbindgen_add_to_stack_pointer(-16);
    version(retptr);
    var r0 = getInt32Memory0()[retptr / 4 + 0];
    var r1 = getInt32Memory0()[retptr / 4 + 1];
    return getStringFromWasm0(r0, r1);
  } finally {
    __wbindgen_add_to_stack_pointer(16);
    __wbindgen_free(r0, r1);
  }
}
var stack_pointer = 32;
function addBorrowedObject(obj) {
  if (stack_pointer == 1)
    throw new Error("out of js stack");
  heap[--stack_pointer] = obj;
  return stack_pointer;
}
function _assertClass(instance2, klass) {
  if (!(instance2 instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance2.ptr;
}
var cachegetFloat32Memory0 = null;
function getFloat32Memory0() {
  if (cachegetFloat32Memory0 === null || cachegetFloat32Memory0.buffer !== memory.buffer) {
    cachegetFloat32Memory0 = new Float32Array(memory.buffer);
  }
  return cachegetFloat32Memory0;
}
function getArrayF32FromWasm0(ptr, len) {
  return getFloat32Memory0().subarray(ptr / 4, ptr / 4 + len);
}
var cachegetUint32Memory0 = null;
function getUint32Memory0() {
  if (cachegetUint32Memory0 === null || cachegetUint32Memory0.buffer !== memory.buffer) {
    cachegetUint32Memory0 = new Uint32Array(memory.buffer);
  }
  return cachegetUint32Memory0;
}
function getArrayU32FromWasm0(ptr, len) {
  return getUint32Memory0().subarray(ptr / 4, ptr / 4 + len);
}
function passArrayF32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4);
  getFloat32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4);
  getUint32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    __wbindgen_exn_store(addHeapObject(e));
  }
}
var RawJointType = Object.freeze({ Ball: 0, "0": "Ball", Fixed: 1, "1": "Fixed", Prismatic: 2, "2": "Prismatic", Revolute: 3, "3": "Revolute" });
var RawSpringModel = Object.freeze({ Disabled: 0, "0": "Disabled", VelocityBased: 1, "1": "VelocityBased", AccelerationBased: 2, "2": "AccelerationBased", ForceBased: 3, "3": "ForceBased" });
var RawRigidBodyType = Object.freeze({ Dynamic: 0, "0": "Dynamic", Static: 1, "1": "Static", KinematicPositionBased: 2, "2": "KinematicPositionBased", KinematicVelocityBased: 3, "3": "KinematicVelocityBased" });
var RawShapeType = Object.freeze({ Ball: 0, "0": "Ball", Cuboid: 1, "1": "Cuboid", Capsule: 2, "2": "Capsule", Segment: 3, "3": "Segment", Polyline: 4, "4": "Polyline", Triangle: 5, "5": "Triangle", TriMesh: 6, "6": "TriMesh", HeightField: 7, "7": "HeightField", Compound: 8, "8": "Compound", ConvexPolyhedron: 9, "9": "ConvexPolyhedron", Cylinder: 10, "10": "Cylinder", Cone: 11, "11": "Cone", RoundCuboid: 12, "12": "RoundCuboid", RoundTriangle: 13, "13": "RoundTriangle", RoundCylinder: 14, "14": "RoundCylinder", RoundCone: 15, "15": "RoundCone", RoundConvexPolyhedron: 16, "16": "RoundConvexPolyhedron" });
var RawBroadPhase = class {
  static __wrap(ptr) {
    const obj = Object.create(RawBroadPhase.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawbroadphase_free(ptr);
  }
  constructor() {
    var ret = rawbroadphase_new();
    return RawBroadPhase.__wrap(ret);
  }
};
var RawCCDSolver = class {
  static __wrap(ptr) {
    const obj = Object.create(RawCCDSolver.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawccdsolver_free(ptr);
  }
  constructor() {
    var ret = rawccdsolver_new();
    return RawCCDSolver.__wrap(ret);
  }
};
var RawColliderSet = class {
  static __wrap(ptr) {
    const obj = Object.create(RawColliderSet.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawcolliderset_free(ptr);
  }
  coTranslation(handle) {
    var ret = rawcolliderset_coTranslation(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  coRotation(handle) {
    var ret = rawcolliderset_coRotation(this.ptr, handle);
    return RawRotation.__wrap(ret);
  }
  coSetTranslation(handle, x, y, z) {
    rawcolliderset_coSetTranslation(this.ptr, handle, x, y, z);
  }
  coSetTranslationWrtParent(handle, x, y, z) {
    rawcolliderset_coSetTranslationWrtParent(this.ptr, handle, x, y, z);
  }
  coSetRotation(handle, x, y, z, w) {
    rawcolliderset_coSetRotation(this.ptr, handle, x, y, z, w);
  }
  coSetRotationWrtParent(handle, x, y, z, w) {
    rawcolliderset_coSetRotationWrtParent(this.ptr, handle, x, y, z, w);
  }
  coIsSensor(handle) {
    var ret = rawcolliderset_coIsSensor(this.ptr, handle);
    return ret !== 0;
  }
  coShapeType(handle) {
    var ret = rawcolliderset_coShapeType(this.ptr, handle);
    return ret >>> 0;
  }
  coHalfExtents(handle) {
    var ret = rawcolliderset_coHalfExtents(this.ptr, handle);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  coRadius(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coRadius(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coHalfHeight(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coHalfHeight(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coRoundRadius(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coRoundRadius(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coVertices(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coVertices(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v0;
      if (r0 !== 0) {
        v0 = getArrayF32FromWasm0(r0, r1).slice();
        __wbindgen_free(r0, r1 * 4);
      }
      return v0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coIndices(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coIndices(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v0;
      if (r0 !== 0) {
        v0 = getArrayU32FromWasm0(r0, r1).slice();
        __wbindgen_free(r0, r1 * 4);
      }
      return v0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coHeightfieldHeights(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coHeightfieldHeights(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      let v0;
      if (r0 !== 0) {
        v0 = getArrayF32FromWasm0(r0, r1).slice();
        __wbindgen_free(r0, r1 * 4);
      }
      return v0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coHeightfieldScale(handle) {
    var ret = rawcolliderset_coHeightfieldScale(this.ptr, handle);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  coHeightfieldNRows(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coHeightfieldNRows(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coHeightfieldNCols(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coHeightfieldNCols(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coParent(handle) {
    var ret = rawcolliderset_coParent(this.ptr, handle);
    return ret >>> 0;
  }
  coFriction(handle) {
    var ret = rawcolliderset_coFriction(this.ptr, handle);
    return ret;
  }
  coDensity(handle) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      rawcolliderset_coDensity(retptr, this.ptr, handle);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getFloat32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  coCollisionGroups(handle) {
    var ret = rawcolliderset_coCollisionGroups(this.ptr, handle);
    return ret >>> 0;
  }
  coSolverGroups(handle) {
    var ret = rawcolliderset_coSolverGroups(this.ptr, handle);
    return ret >>> 0;
  }
  coActiveHooks(handle) {
    var ret = rawcolliderset_coActiveHooks(this.ptr, handle);
    return ret >>> 0;
  }
  coActiveCollisionTypes(handle) {
    var ret = rawcolliderset_coActiveCollisionTypes(this.ptr, handle);
    return ret;
  }
  coActiveEvents(handle) {
    var ret = rawcolliderset_coActiveEvents(this.ptr, handle);
    return ret >>> 0;
  }
  coSetSensor(handle, is_sensor) {
    rawcolliderset_coSetSensor(this.ptr, handle, is_sensor);
  }
  coSetRestitution(handle, restitution) {
    rawcolliderset_coSetRestitution(this.ptr, handle, restitution);
  }
  coSetFriction(handle, friction) {
    rawcolliderset_coSetFriction(this.ptr, handle, friction);
  }
  coFrictionCombineRule(handle) {
    var ret = rawcolliderset_coFrictionCombineRule(this.ptr, handle);
    return ret >>> 0;
  }
  coSetFrictionCombineRule(handle, rule) {
    rawcolliderset_coSetFrictionCombineRule(this.ptr, handle, rule);
  }
  coRestitutionCombineRule(handle) {
    var ret = rawcolliderset_coRestitutionCombineRule(this.ptr, handle);
    return ret >>> 0;
  }
  coSetRestitutionCombineRule(handle, rule) {
    rawcolliderset_coSetRestitutionCombineRule(this.ptr, handle, rule);
  }
  coSetCollisionGroups(handle, groups) {
    rawcolliderset_coSetCollisionGroups(this.ptr, handle, groups);
  }
  coSetSolverGroups(handle, groups) {
    rawcolliderset_coSetSolverGroups(this.ptr, handle, groups);
  }
  coSetActiveHooks(handle, hooks) {
    rawcolliderset_coSetActiveHooks(this.ptr, handle, hooks);
  }
  coSetActiveEvents(handle, events) {
    rawcolliderset_coSetActiveEvents(this.ptr, handle, events);
  }
  coSetActiveCollisionTypes(handle, types) {
    rawcolliderset_coSetActiveCollisionTypes(this.ptr, handle, types);
  }
  coSetShape(handle, shape) {
    _assertClass(shape, RawShape);
    var ptr0 = shape.ptr;
    shape.ptr = 0;
    rawcolliderset_coSetShape(this.ptr, handle, ptr0);
  }
  constructor() {
    var ret = rawcolliderset_new();
    return RawColliderSet.__wrap(ret);
  }
  len() {
    var ret = rawcolliderset_len(this.ptr);
    return ret >>> 0;
  }
  contains(handle) {
    var ret = rawcolliderset_contains(this.ptr, handle);
    return ret !== 0;
  }
  createCollider(shape, translation, rotation, useMassProps, mass, centerOfMass, principalAngularInertia, angularInertiaFrame, density, friction, restitution, frictionCombineRule, restitutionCombineRule, isSensor, collisionGroups, solverGroups, activeCollisionTypes, activeHooks, activeEvents, hasParent, parent, bodies) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      _assertClass(shape, RawShape);
      _assertClass(translation, RawVector);
      _assertClass(rotation, RawRotation);
      _assertClass(centerOfMass, RawVector);
      _assertClass(principalAngularInertia, RawVector);
      _assertClass(angularInertiaFrame, RawRotation);
      _assertClass(bodies, RawRigidBodySet);
      rawcolliderset_createCollider(retptr, this.ptr, shape.ptr, translation.ptr, rotation.ptr, useMassProps, mass, centerOfMass.ptr, principalAngularInertia.ptr, angularInertiaFrame.ptr, density, friction, restitution, frictionCombineRule, restitutionCombineRule, isSensor, collisionGroups, solverGroups, activeCollisionTypes, activeHooks, activeEvents, hasParent, parent, bodies.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  remove(handle, islands, bodies, wakeUp) {
    _assertClass(islands, RawIslandManager);
    _assertClass(bodies, RawRigidBodySet);
    rawcolliderset_remove(this.ptr, handle, islands.ptr, bodies.ptr, wakeUp);
  }
  isHandleValid(handle) {
    var ret = rawcolliderset_contains(this.ptr, handle);
    return ret !== 0;
  }
  forEachColliderHandle(f) {
    try {
      rawcolliderset_forEachColliderHandle(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
};
var RawContactManifold = class {
  static __wrap(ptr) {
    const obj = Object.create(RawContactManifold.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawcontactmanifold_free(ptr);
  }
  normal() {
    var ret = rawcontactmanifold_normal(this.ptr);
    return RawVector.__wrap(ret);
  }
  local_n1() {
    var ret = rawcontactmanifold_local_n1(this.ptr);
    return RawVector.__wrap(ret);
  }
  local_n2() {
    var ret = rawcontactmanifold_local_n1(this.ptr);
    return RawVector.__wrap(ret);
  }
  subshape1() {
    var ret = rawcontactmanifold_subshape1(this.ptr);
    return ret >>> 0;
  }
  subshape2() {
    var ret = rawcontactmanifold_subshape1(this.ptr);
    return ret >>> 0;
  }
  num_contacts() {
    var ret = rawcontactmanifold_num_contacts(this.ptr);
    return ret >>> 0;
  }
  contact_local_p1(i) {
    var ret = rawcontactmanifold_contact_local_p1(this.ptr, i);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  contact_local_p2(i) {
    var ret = rawcontactmanifold_contact_local_p1(this.ptr, i);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  contact_dist(i) {
    var ret = rawcontactmanifold_contact_dist(this.ptr, i);
    return ret;
  }
  contact_fid1(i) {
    var ret = rawcontactmanifold_contact_fid1(this.ptr, i);
    return ret >>> 0;
  }
  contact_fid2(i) {
    var ret = rawcontactmanifold_contact_fid2(this.ptr, i);
    return ret >>> 0;
  }
  contact_impulse(i) {
    var ret = rawcontactmanifold_contact_impulse(this.ptr, i);
    return ret;
  }
  contact_tangent_impulse_x(i) {
    var ret = rawcontactmanifold_contact_tangent_impulse_x(this.ptr, i);
    return ret;
  }
  contact_tangent_impulse_y(i) {
    var ret = rawcontactmanifold_contact_tangent_impulse_y(this.ptr, i);
    return ret;
  }
  num_solver_contacts() {
    var ret = rawcontactmanifold_num_solver_contacts(this.ptr);
    return ret >>> 0;
  }
  solver_contact_point(i) {
    var ret = rawcontactmanifold_solver_contact_point(this.ptr, i);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  solver_contact_dist(i) {
    var ret = rawcontactmanifold_solver_contact_dist(this.ptr, i);
    return ret;
  }
  solver_contact_friction(i) {
    var ret = rawcontactmanifold_solver_contact_friction(this.ptr, i);
    return ret;
  }
  solver_contact_restitution(i) {
    var ret = rawcontactmanifold_solver_contact_restitution(this.ptr, i);
    return ret;
  }
  solver_contact_tangent_velocity(i) {
    var ret = rawcontactmanifold_solver_contact_tangent_velocity(this.ptr, i);
    return RawVector.__wrap(ret);
  }
};
var RawContactPair = class {
  static __wrap(ptr) {
    const obj = Object.create(RawContactPair.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawcontactpair_free(ptr);
  }
  collider1() {
    var ret = rawcontactpair_collider1(this.ptr);
    return ret >>> 0;
  }
  collider2() {
    var ret = rawcontactpair_collider2(this.ptr);
    return ret >>> 0;
  }
  numContactManifolds() {
    var ret = rawcontactpair_numContactManifolds(this.ptr);
    return ret >>> 0;
  }
  contactManifold(i) {
    var ret = rawcontactpair_contactManifold(this.ptr, i);
    return ret === 0 ? void 0 : RawContactManifold.__wrap(ret);
  }
};
var RawDeserializedWorld = class {
  static __wrap(ptr) {
    const obj = Object.create(RawDeserializedWorld.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawdeserializedworld_free(ptr);
  }
  takeGravity() {
    var ret = rawdeserializedworld_takeGravity(this.ptr);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  takeIntegrationParameters() {
    var ret = rawdeserializedworld_takeIntegrationParameters(this.ptr);
    return ret === 0 ? void 0 : RawIntegrationParameters.__wrap(ret);
  }
  takeIslandManager() {
    var ret = rawdeserializedworld_takeIslandManager(this.ptr);
    return ret === 0 ? void 0 : RawIslandManager.__wrap(ret);
  }
  takeBroadPhase() {
    var ret = rawdeserializedworld_takeBroadPhase(this.ptr);
    return ret === 0 ? void 0 : RawBroadPhase.__wrap(ret);
  }
  takeNarrowPhase() {
    var ret = rawdeserializedworld_takeNarrowPhase(this.ptr);
    return ret === 0 ? void 0 : RawNarrowPhase.__wrap(ret);
  }
  takeBodies() {
    var ret = rawdeserializedworld_takeBodies(this.ptr);
    return ret === 0 ? void 0 : RawRigidBodySet.__wrap(ret);
  }
  takeColliders() {
    var ret = rawdeserializedworld_takeColliders(this.ptr);
    return ret === 0 ? void 0 : RawColliderSet.__wrap(ret);
  }
  takeJoints() {
    var ret = rawdeserializedworld_takeJoints(this.ptr);
    return ret === 0 ? void 0 : RawJointSet.__wrap(ret);
  }
};
var RawEventQueue = class {
  static __wrap(ptr) {
    const obj = Object.create(RawEventQueue.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_raweventqueue_free(ptr);
  }
  constructor(autoDrain) {
    var ret = raweventqueue_new(autoDrain);
    return RawEventQueue.__wrap(ret);
  }
  drainContactEvents(f) {
    try {
      raweventqueue_drainContactEvents(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  drainIntersectionEvents(f) {
    try {
      raweventqueue_drainIntersectionEvents(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  clear() {
    raweventqueue_clear(this.ptr);
  }
};
var RawIntegrationParameters = class {
  static __wrap(ptr) {
    const obj = Object.create(RawIntegrationParameters.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawintegrationparameters_free(ptr);
  }
  constructor() {
    var ret = rawintegrationparameters_new();
    return RawIntegrationParameters.__wrap(ret);
  }
  get dt() {
    var ret = rawintegrationparameters_dt(this.ptr);
    return ret;
  }
  get erp() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
  get jointErp() {
    var ret = rawintegrationparameters_jointErp(this.ptr);
    return ret;
  }
  get warmstartCoeff() {
    var ret = rawintegrationparameters_warmstartCoeff(this.ptr);
    return ret;
  }
  get allowedLinearError() {
    var ret = rawintegrationparameters_allowedLinearError(this.ptr);
    return ret;
  }
  get predictionDistance() {
    var ret = rawintegrationparameters_predictionDistance(this.ptr);
    return ret;
  }
  get allowedAngularError() {
    var ret = rawintegrationparameters_allowedAngularError(this.ptr);
    return ret;
  }
  get maxLinearCorrection() {
    var ret = rawintegrationparameters_maxLinearCorrection(this.ptr);
    return ret;
  }
  get maxAngularCorrection() {
    var ret = rawintegrationparameters_maxAngularCorrection(this.ptr);
    return ret;
  }
  get maxVelocityIterations() {
    var ret = rawintegrationparameters_maxVelocityIterations(this.ptr);
    return ret >>> 0;
  }
  get maxPositionIterations() {
    var ret = rawintegrationparameters_maxPositionIterations(this.ptr);
    return ret >>> 0;
  }
  get minIslandSize() {
    var ret = rawintegrationparameters_minIslandSize(this.ptr);
    return ret >>> 0;
  }
  get maxCcdSubsteps() {
    var ret = rawintegrationparameters_maxCcdSubsteps(this.ptr);
    return ret >>> 0;
  }
  set dt(value) {
    rawintegrationparameters_set_dt(this.ptr, value);
  }
  set erp(value) {
    rawintegrationparameters_set_erp(this.ptr, value);
  }
  set jointErp(value) {
    rawintegrationparameters_set_jointErp(this.ptr, value);
  }
  set warmstartCoeff(value) {
    rawintegrationparameters_set_warmstartCoeff(this.ptr, value);
  }
  set allowedLinearError(value) {
    rawintegrationparameters_set_allowedLinearError(this.ptr, value);
  }
  set predictionDistance(value) {
    rawintegrationparameters_set_predictionDistance(this.ptr, value);
  }
  set allowedAngularError(value) {
    rawintegrationparameters_set_allowedAngularError(this.ptr, value);
  }
  set maxLinearCorrection(value) {
    rawintegrationparameters_set_maxLinearCorrection(this.ptr, value);
  }
  set maxAngularCorrection(value) {
    rawintegrationparameters_set_maxAngularCorrection(this.ptr, value);
  }
  set maxVelocityIterations(value) {
    rawintegrationparameters_set_maxVelocityIterations(this.ptr, value);
  }
  set maxPositionIterations(value) {
    rawintegrationparameters_set_maxPositionIterations(this.ptr, value);
  }
  set minIslandSize(value) {
    rawintegrationparameters_set_minIslandSize(this.ptr, value);
  }
  set maxCcdSubsteps(value) {
    rawintegrationparameters_set_maxCcdSubsteps(this.ptr, value);
  }
};
var RawIslandManager = class {
  static __wrap(ptr) {
    const obj = Object.create(RawIslandManager.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawislandmanager_free(ptr);
  }
  constructor() {
    var ret = rawislandmanager_new();
    return RawIslandManager.__wrap(ret);
  }
  forEachActiveRigidBodyHandle(f) {
    try {
      rawislandmanager_forEachActiveRigidBodyHandle(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
};
var RawJointParams = class {
  static __wrap(ptr) {
    const obj = Object.create(RawJointParams.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawjointparams_free(ptr);
  }
  static ball(anchor1, anchor2) {
    _assertClass(anchor1, RawVector);
    _assertClass(anchor2, RawVector);
    var ret = rawjointparams_ball(anchor1.ptr, anchor2.ptr);
    return RawJointParams.__wrap(ret);
  }
  static prismatic(anchor1, axis1, tangent1, anchor2, axis2, tangent2, limitsEnabled, limitsMin, limitsMax) {
    _assertClass(anchor1, RawVector);
    _assertClass(axis1, RawVector);
    _assertClass(tangent1, RawVector);
    _assertClass(anchor2, RawVector);
    _assertClass(axis2, RawVector);
    _assertClass(tangent2, RawVector);
    var ret = rawjointparams_prismatic(anchor1.ptr, axis1.ptr, tangent1.ptr, anchor2.ptr, axis2.ptr, tangent2.ptr, limitsEnabled, limitsMin, limitsMax);
    return ret === 0 ? void 0 : RawJointParams.__wrap(ret);
  }
  static fixed(anchor1, axes1, anchor2, axes2) {
    _assertClass(anchor1, RawVector);
    _assertClass(axes1, RawRotation);
    _assertClass(anchor2, RawVector);
    _assertClass(axes2, RawRotation);
    var ret = rawjointparams_fixed(anchor1.ptr, axes1.ptr, anchor2.ptr, axes2.ptr);
    return RawJointParams.__wrap(ret);
  }
  static revolute(anchor1, axis1, anchor2, axis2) {
    _assertClass(anchor1, RawVector);
    _assertClass(axis1, RawVector);
    _assertClass(anchor2, RawVector);
    _assertClass(axis2, RawVector);
    var ret = rawjointparams_revolute(anchor1.ptr, axis1.ptr, anchor2.ptr, axis2.ptr);
    return ret === 0 ? void 0 : RawJointParams.__wrap(ret);
  }
};
var RawJointSet = class {
  static __wrap(ptr) {
    const obj = Object.create(RawJointSet.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawjointset_free(ptr);
  }
  jointBodyHandle1(handle) {
    var ret = rawjointset_jointBodyHandle1(this.ptr, handle);
    return ret >>> 0;
  }
  jointBodyHandle2(handle) {
    var ret = rawjointset_jointBodyHandle2(this.ptr, handle);
    return ret >>> 0;
  }
  jointType(handle) {
    var ret = rawjointset_jointType(this.ptr, handle);
    return ret >>> 0;
  }
  jointFrameX1(handle) {
    var ret = rawjointset_jointFrameX1(this.ptr, handle);
    return RawRotation.__wrap(ret);
  }
  jointFrameX2(handle) {
    var ret = rawjointset_jointFrameX2(this.ptr, handle);
    return RawRotation.__wrap(ret);
  }
  jointAnchor1(handle) {
    var ret = rawjointset_jointAnchor1(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  jointAnchor2(handle) {
    var ret = rawjointset_jointAnchor2(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  jointAxis1(handle) {
    var ret = rawjointset_jointAxis1(this.ptr, handle);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  jointAxis2(handle) {
    var ret = rawjointset_jointAxis2(this.ptr, handle);
    return ret === 0 ? void 0 : RawVector.__wrap(ret);
  }
  jointLimitsEnabled(handle) {
    var ret = rawjointset_jointLimitsEnabled(this.ptr, handle);
    return ret !== 0;
  }
  jointLimitsMin(handle) {
    var ret = rawjointset_jointLimitsMin(this.ptr, handle);
    return ret;
  }
  jointLimitsMax(handle) {
    var ret = rawjointset_jointLimitsMax(this.ptr, handle);
    return ret;
  }
  jointConfigureMotorModel(handle, model) {
    rawjointset_jointConfigureMotorModel(this.ptr, handle, model);
  }
  jointConfigureBallMotorVelocity(handle, vx, vy, vz, factor) {
    rawjointset_jointConfigureBallMotorVelocity(this.ptr, handle, vx, vy, vz, factor);
  }
  jointConfigureBallMotorPosition(handle, qw, qx, qy, qz, stiffness, damping) {
    rawjointset_jointConfigureBallMotorPosition(this.ptr, handle, qw, qx, qy, qz, stiffness, damping);
  }
  jointConfigureBallMotor(handle, qw, qx, qy, qz, vx, vy, vz, stiffness, damping) {
    rawjointset_jointConfigureBallMotor(this.ptr, handle, qw, qx, qy, qz, vx, vy, vz, stiffness, damping);
  }
  jointConfigureUnitMotorVelocity(handle, targetVel, factor) {
    rawjointset_jointConfigureUnitMotorVelocity(this.ptr, handle, targetVel, factor);
  }
  jointConfigureUnitMotorPosition(handle, targetPos, stiffness, damping) {
    rawjointset_jointConfigureUnitMotorPosition(this.ptr, handle, targetPos, stiffness, damping);
  }
  jointConfigureUnitMotor(handle, targetPos, targetVel, stiffness, damping) {
    rawjointset_jointConfigureUnitMotor(this.ptr, handle, targetPos, targetVel, stiffness, damping);
  }
  constructor() {
    var ret = rawjointset_new();
    return RawJointSet.__wrap(ret);
  }
  createJoint(bodies, params, parent1, parent2) {
    _assertClass(bodies, RawRigidBodySet);
    _assertClass(params, RawJointParams);
    var ret = rawjointset_createJoint(this.ptr, bodies.ptr, params.ptr, parent1, parent2);
    return ret >>> 0;
  }
  remove(handle, islands, bodies, wakeUp) {
    _assertClass(islands, RawIslandManager);
    _assertClass(bodies, RawRigidBodySet);
    rawjointset_remove(this.ptr, handle, islands.ptr, bodies.ptr, wakeUp);
  }
  len() {
    var ret = rawjointset_len(this.ptr);
    return ret >>> 0;
  }
  contains(handle) {
    var ret = rawjointset_contains(this.ptr, handle);
    return ret !== 0;
  }
  forEachJointHandle(f) {
    try {
      rawjointset_forEachJointHandle(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
};
var RawNarrowPhase = class {
  static __wrap(ptr) {
    const obj = Object.create(RawNarrowPhase.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawnarrowphase_free(ptr);
  }
  constructor() {
    var ret = rawnarrowphase_new();
    return RawNarrowPhase.__wrap(ret);
  }
  contacts_with(handle1, f) {
    rawnarrowphase_contacts_with(this.ptr, handle1, addHeapObject(f));
  }
  contact_pair(handle1, handle2) {
    var ret = rawnarrowphase_contact_pair(this.ptr, handle1, handle2);
    return ret === 0 ? void 0 : RawContactPair.__wrap(ret);
  }
  intersections_with(handle1, f) {
    rawnarrowphase_intersections_with(this.ptr, handle1, addHeapObject(f));
  }
  intersection_pair(handle1, handle2) {
    var ret = rawnarrowphase_intersection_pair(this.ptr, handle1, handle2);
    return ret !== 0;
  }
};
var RawPhysicsPipeline = class {
  static __wrap(ptr) {
    const obj = Object.create(RawPhysicsPipeline.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawphysicspipeline_free(ptr);
  }
  constructor() {
    var ret = rawphysicspipeline_new();
    return RawPhysicsPipeline.__wrap(ret);
  }
  step(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, joints, ccd_solver) {
    _assertClass(gravity, RawVector);
    _assertClass(integrationParameters, RawIntegrationParameters);
    _assertClass(islands, RawIslandManager);
    _assertClass(broadPhase, RawBroadPhase);
    _assertClass(narrowPhase, RawNarrowPhase);
    _assertClass(bodies, RawRigidBodySet);
    _assertClass(colliders, RawColliderSet);
    _assertClass(joints, RawJointSet);
    _assertClass(ccd_solver, RawCCDSolver);
    rawphysicspipeline_step(this.ptr, gravity.ptr, integrationParameters.ptr, islands.ptr, broadPhase.ptr, narrowPhase.ptr, bodies.ptr, colliders.ptr, joints.ptr, ccd_solver.ptr);
  }
  stepWithEvents(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, joints, ccd_solver, eventQueue, hookObject, hookFilterContactPair, hookFilterIntersectionPair) {
    _assertClass(gravity, RawVector);
    _assertClass(integrationParameters, RawIntegrationParameters);
    _assertClass(islands, RawIslandManager);
    _assertClass(broadPhase, RawBroadPhase);
    _assertClass(narrowPhase, RawNarrowPhase);
    _assertClass(bodies, RawRigidBodySet);
    _assertClass(colliders, RawColliderSet);
    _assertClass(joints, RawJointSet);
    _assertClass(ccd_solver, RawCCDSolver);
    _assertClass(eventQueue, RawEventQueue);
    rawphysicspipeline_stepWithEvents(this.ptr, gravity.ptr, integrationParameters.ptr, islands.ptr, broadPhase.ptr, narrowPhase.ptr, bodies.ptr, colliders.ptr, joints.ptr, ccd_solver.ptr, eventQueue.ptr, addHeapObject(hookObject), addHeapObject(hookFilterContactPair), addHeapObject(hookFilterIntersectionPair));
  }
};
var RawPointColliderProjection = class {
  static __wrap(ptr) {
    const obj = Object.create(RawPointColliderProjection.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawpointcolliderprojection_free(ptr);
  }
  colliderHandle() {
    var ret = rawpointcolliderprojection_colliderHandle(this.ptr);
    return ret >>> 0;
  }
  point() {
    var ret = rawpointcolliderprojection_point(this.ptr);
    return RawVector.__wrap(ret);
  }
  isInside() {
    var ret = rawpointcolliderprojection_isInside(this.ptr);
    return ret !== 0;
  }
};
var RawQueryPipeline = class {
  static __wrap(ptr) {
    const obj = Object.create(RawQueryPipeline.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawquerypipeline_free(ptr);
  }
  constructor() {
    var ret = rawquerypipeline_new();
    return RawQueryPipeline.__wrap(ret);
  }
  update(islands, bodies, colliders) {
    _assertClass(islands, RawIslandManager);
    _assertClass(bodies, RawRigidBodySet);
    _assertClass(colliders, RawColliderSet);
    rawquerypipeline_update(this.ptr, islands.ptr, bodies.ptr, colliders.ptr);
  }
  castRay(colliders, rayOrig, rayDir, maxToi, solid, groups) {
    _assertClass(colliders, RawColliderSet);
    _assertClass(rayOrig, RawVector);
    _assertClass(rayDir, RawVector);
    var ret = rawquerypipeline_castRay(this.ptr, colliders.ptr, rayOrig.ptr, rayDir.ptr, maxToi, solid, groups);
    return ret === 0 ? void 0 : RawRayColliderToi.__wrap(ret);
  }
  castRayAndGetNormal(colliders, rayOrig, rayDir, maxToi, solid, groups) {
    _assertClass(colliders, RawColliderSet);
    _assertClass(rayOrig, RawVector);
    _assertClass(rayDir, RawVector);
    var ret = rawquerypipeline_castRayAndGetNormal(this.ptr, colliders.ptr, rayOrig.ptr, rayDir.ptr, maxToi, solid, groups);
    return ret === 0 ? void 0 : RawRayColliderIntersection.__wrap(ret);
  }
  intersectionsWithRay(colliders, rayOrig, rayDir, maxToi, solid, groups, callback) {
    try {
      _assertClass(colliders, RawColliderSet);
      _assertClass(rayOrig, RawVector);
      _assertClass(rayDir, RawVector);
      rawquerypipeline_intersectionsWithRay(this.ptr, colliders.ptr, rayOrig.ptr, rayDir.ptr, maxToi, solid, groups, addBorrowedObject(callback));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  intersectionWithShape(colliders, shapePos, shapeRot, shape, groups) {
    try {
      const retptr = __wbindgen_add_to_stack_pointer(-16);
      _assertClass(colliders, RawColliderSet);
      _assertClass(shapePos, RawVector);
      _assertClass(shapeRot, RawRotation);
      _assertClass(shape, RawShape);
      rawquerypipeline_intersectionWithShape(retptr, this.ptr, colliders.ptr, shapePos.ptr, shapeRot.ptr, shape.ptr, groups);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return r0 === 0 ? void 0 : r1 >>> 0;
    } finally {
      __wbindgen_add_to_stack_pointer(16);
    }
  }
  projectPoint(colliders, point, solid, groups) {
    _assertClass(colliders, RawColliderSet);
    _assertClass(point, RawVector);
    var ret = rawquerypipeline_projectPoint(this.ptr, colliders.ptr, point.ptr, solid, groups);
    return ret === 0 ? void 0 : RawPointColliderProjection.__wrap(ret);
  }
  intersectionsWithPoint(colliders, point, groups, callback) {
    try {
      _assertClass(colliders, RawColliderSet);
      _assertClass(point, RawVector);
      rawquerypipeline_intersectionsWithPoint(this.ptr, colliders.ptr, point.ptr, groups, addBorrowedObject(callback));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  castShape(colliders, shapePos, shapeRot, shapeVel, shape, maxToi, groups) {
    _assertClass(colliders, RawColliderSet);
    _assertClass(shapePos, RawVector);
    _assertClass(shapeRot, RawRotation);
    _assertClass(shapeVel, RawVector);
    _assertClass(shape, RawShape);
    var ret = rawquerypipeline_castShape(this.ptr, colliders.ptr, shapePos.ptr, shapeRot.ptr, shapeVel.ptr, shape.ptr, maxToi, groups);
    return ret === 0 ? void 0 : RawShapeColliderTOI.__wrap(ret);
  }
  intersectionsWithShape(colliders, shapePos, shapeRot, shape, groups, callback) {
    try {
      _assertClass(colliders, RawColliderSet);
      _assertClass(shapePos, RawVector);
      _assertClass(shapeRot, RawRotation);
      _assertClass(shape, RawShape);
      rawquerypipeline_intersectionsWithShape(this.ptr, colliders.ptr, shapePos.ptr, shapeRot.ptr, shape.ptr, groups, addBorrowedObject(callback));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  collidersWithAabbIntersectingAabb(aabbCenter, aabbHalfExtents, callback) {
    try {
      _assertClass(aabbCenter, RawVector);
      var ptr0 = aabbCenter.ptr;
      aabbCenter.ptr = 0;
      _assertClass(aabbHalfExtents, RawVector);
      var ptr1 = aabbHalfExtents.ptr;
      aabbHalfExtents.ptr = 0;
      rawquerypipeline_collidersWithAabbIntersectingAabb(this.ptr, ptr0, ptr1, addBorrowedObject(callback));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
};
var RawRayColliderIntersection = class {
  static __wrap(ptr) {
    const obj = Object.create(RawRayColliderIntersection.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawraycolliderintersection_free(ptr);
  }
  colliderHandle() {
    var ret = rawpointcolliderprojection_colliderHandle(this.ptr);
    return ret >>> 0;
  }
  normal() {
    var ret = rawraycolliderintersection_normal(this.ptr);
    return RawVector.__wrap(ret);
  }
  toi() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
};
var RawRayColliderToi = class {
  static __wrap(ptr) {
    const obj = Object.create(RawRayColliderToi.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawraycollidertoi_free(ptr);
  }
  colliderHandle() {
    var ret = rawpointcolliderprojection_colliderHandle(this.ptr);
    return ret >>> 0;
  }
  toi() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
};
var RawRigidBodySet = class {
  static __wrap(ptr) {
    const obj = Object.create(RawRigidBodySet.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawrigidbodyset_free(ptr);
  }
  rbTranslation(handle) {
    var ret = rawrigidbodyset_rbTranslation(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  rbRotation(handle) {
    var ret = rawrigidbodyset_rbRotation(this.ptr, handle);
    return RawRotation.__wrap(ret);
  }
  rbSleep(handle) {
    rawrigidbodyset_rbSleep(this.ptr, handle);
  }
  rbIsSleeping(handle) {
    var ret = rawrigidbodyset_rbIsSleeping(this.ptr, handle);
    return ret !== 0;
  }
  rbIsMoving(handle) {
    var ret = rawrigidbodyset_rbIsMoving(this.ptr, handle);
    return ret !== 0;
  }
  rbNextTranslation(handle) {
    var ret = rawrigidbodyset_rbNextTranslation(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  rbNextRotation(handle) {
    var ret = rawrigidbodyset_rbNextRotation(this.ptr, handle);
    return RawRotation.__wrap(ret);
  }
  rbSetTranslation(handle, x, y, z, wakeUp) {
    rawrigidbodyset_rbSetTranslation(this.ptr, handle, x, y, z, wakeUp);
  }
  rbSetRotation(handle, x, y, z, w, wakeUp) {
    rawrigidbodyset_rbSetRotation(this.ptr, handle, x, y, z, w, wakeUp);
  }
  rbSetLinvel(handle, linvel, wakeUp) {
    _assertClass(linvel, RawVector);
    rawrigidbodyset_rbSetLinvel(this.ptr, handle, linvel.ptr, wakeUp);
  }
  rbSetAngvel(handle, angvel, wakeUp) {
    _assertClass(angvel, RawVector);
    rawrigidbodyset_rbSetAngvel(this.ptr, handle, angvel.ptr, wakeUp);
  }
  rbSetNextKinematicTranslation(handle, x, y, z) {
    rawrigidbodyset_rbSetNextKinematicTranslation(this.ptr, handle, x, y, z);
  }
  rbSetNextKinematicRotation(handle, x, y, z, w) {
    rawrigidbodyset_rbSetNextKinematicRotation(this.ptr, handle, x, y, z, w);
  }
  rbLinvel(handle) {
    var ret = rawrigidbodyset_rbLinvel(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  rbAngvel(handle) {
    var ret = rawrigidbodyset_rbAngvel(this.ptr, handle);
    return RawVector.__wrap(ret);
  }
  rbLockTranslations(handle, locked, wake_up) {
    rawrigidbodyset_rbLockRotations(this.ptr, handle, locked, wake_up);
  }
  rbLockRotations(handle, locked, wake_up) {
    rawrigidbodyset_rbLockRotations(this.ptr, handle, locked, wake_up);
  }
  rbRestrictRotations(handle, allow_x, allow_y, allow_z, wake_up) {
    rawrigidbodyset_rbRestrictRotations(this.ptr, handle, allow_x, allow_y, allow_z, wake_up);
  }
  rbDominanceGroup(handle) {
    var ret = rawrigidbodyset_rbDominanceGroup(this.ptr, handle);
    return ret;
  }
  rbSetDominanceGroup(handle, group) {
    rawrigidbodyset_rbSetDominanceGroup(this.ptr, handle, group);
  }
  rbEnableCcd(handle, enabled) {
    rawrigidbodyset_rbEnableCcd(this.ptr, handle, enabled);
  }
  rbMass(handle) {
    var ret = rawrigidbodyset_rbMass(this.ptr, handle);
    return ret;
  }
  rbWakeUp(handle) {
    rawrigidbodyset_rbWakeUp(this.ptr, handle);
  }
  rbIsCcdEnabled(handle) {
    var ret = rawrigidbodyset_rbIsCcdEnabled(this.ptr, handle);
    return ret !== 0;
  }
  rbNumColliders(handle) {
    var ret = rawrigidbodyset_rbNumColliders(this.ptr, handle);
    return ret >>> 0;
  }
  rbCollider(handle, at) {
    var ret = rawrigidbodyset_rbCollider(this.ptr, handle, at);
    return ret >>> 0;
  }
  rbBodyType(handle) {
    var ret = rawrigidbodyset_rbBodyType(this.ptr, handle);
    return ret >>> 0;
  }
  rbIsStatic(handle) {
    var ret = rawrigidbodyset_rbIsStatic(this.ptr, handle);
    return ret !== 0;
  }
  rbIsKinematic(handle) {
    var ret = rawrigidbodyset_rbIsKinematic(this.ptr, handle);
    return ret !== 0;
  }
  rbIsDynamic(handle) {
    var ret = rawrigidbodyset_rbIsDynamic(this.ptr, handle);
    return ret !== 0;
  }
  rbLinearDamping(handle) {
    var ret = rawrigidbodyset_rbLinearDamping(this.ptr, handle);
    return ret;
  }
  rbAngularDamping(handle) {
    var ret = rawrigidbodyset_rbAngularDamping(this.ptr, handle);
    return ret;
  }
  rbSetLinearDamping(handle, factor) {
    rawrigidbodyset_rbSetLinearDamping(this.ptr, handle, factor);
  }
  rbSetAngularDamping(handle, factor) {
    rawrigidbodyset_rbSetAngularDamping(this.ptr, handle, factor);
  }
  rbGravityScale(handle) {
    var ret = rawrigidbodyset_rbGravityScale(this.ptr, handle);
    return ret;
  }
  rbSetGravityScale(handle, factor, wakeUp) {
    rawrigidbodyset_rbSetGravityScale(this.ptr, handle, factor, wakeUp);
  }
  rbApplyForce(handle, force, wakeUp) {
    _assertClass(force, RawVector);
    rawrigidbodyset_rbApplyForce(this.ptr, handle, force.ptr, wakeUp);
  }
  rbApplyImpulse(handle, impulse, wakeUp) {
    _assertClass(impulse, RawVector);
    rawrigidbodyset_rbApplyImpulse(this.ptr, handle, impulse.ptr, wakeUp);
  }
  rbApplyTorque(handle, torque, wakeUp) {
    _assertClass(torque, RawVector);
    rawrigidbodyset_rbApplyTorque(this.ptr, handle, torque.ptr, wakeUp);
  }
  rbApplyTorqueImpulse(handle, torque_impulse, wakeUp) {
    _assertClass(torque_impulse, RawVector);
    rawrigidbodyset_rbApplyTorqueImpulse(this.ptr, handle, torque_impulse.ptr, wakeUp);
  }
  rbApplyForceAtPoint(handle, force, point, wakeUp) {
    _assertClass(force, RawVector);
    _assertClass(point, RawVector);
    rawrigidbodyset_rbApplyForceAtPoint(this.ptr, handle, force.ptr, point.ptr, wakeUp);
  }
  rbApplyImpulseAtPoint(handle, impulse, point, wakeUp) {
    _assertClass(impulse, RawVector);
    _assertClass(point, RawVector);
    rawrigidbodyset_rbApplyImpulseAtPoint(this.ptr, handle, impulse.ptr, point.ptr, wakeUp);
  }
  constructor() {
    var ret = rawrigidbodyset_new();
    return RawRigidBodySet.__wrap(ret);
  }
  createRigidBody(translation, rotation, gravityScale, mass, translationsEnabled, centerOfMass, linvel, angvel, principalAngularInertia, angularInertiaFrame, rotationEnabledX, rotationEnabledY, rotationEnabledZ, linearDamping, angularDamping, rb_type, canSleep, ccdEnabled, dominanceGroup) {
    _assertClass(translation, RawVector);
    _assertClass(rotation, RawRotation);
    _assertClass(centerOfMass, RawVector);
    _assertClass(linvel, RawVector);
    _assertClass(angvel, RawVector);
    _assertClass(principalAngularInertia, RawVector);
    _assertClass(angularInertiaFrame, RawRotation);
    var ret = rawrigidbodyset_createRigidBody(this.ptr, translation.ptr, rotation.ptr, gravityScale, mass, translationsEnabled, centerOfMass.ptr, linvel.ptr, angvel.ptr, principalAngularInertia.ptr, angularInertiaFrame.ptr, rotationEnabledX, rotationEnabledY, rotationEnabledZ, linearDamping, angularDamping, rb_type, canSleep, ccdEnabled, dominanceGroup);
    return ret >>> 0;
  }
  remove(handle, islands, colliders, joints) {
    _assertClass(islands, RawIslandManager);
    _assertClass(colliders, RawColliderSet);
    _assertClass(joints, RawJointSet);
    rawrigidbodyset_remove(this.ptr, handle, islands.ptr, colliders.ptr, joints.ptr);
  }
  len() {
    var ret = rawrigidbodyset_len(this.ptr);
    return ret >>> 0;
  }
  contains(handle) {
    var ret = rawrigidbodyset_contains(this.ptr, handle);
    return ret !== 0;
  }
  forEachRigidBodyHandle(f) {
    try {
      rawrigidbodyset_forEachRigidBodyHandle(this.ptr, addBorrowedObject(f));
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
};
var RawRotation = class {
  static __wrap(ptr) {
    const obj = Object.create(RawRotation.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawrotation_free(ptr);
  }
  constructor(x, y, z, w) {
    var ret = rawrotation_new(x, y, z, w);
    return RawRotation.__wrap(ret);
  }
  static identity() {
    var ret = rawrotation_identity();
    return RawRotation.__wrap(ret);
  }
  get x() {
    var ret = rawintegrationparameters_dt(this.ptr);
    return ret;
  }
  get y() {
    var ret = rawrotation_y(this.ptr);
    return ret;
  }
  get z() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
  get w() {
    var ret = rawintegrationparameters_jointErp(this.ptr);
    return ret;
  }
};
var RawSerializationPipeline = class {
  static __wrap(ptr) {
    const obj = Object.create(RawSerializationPipeline.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawserializationpipeline_free(ptr);
  }
  constructor() {
    var ret = rawserializationpipeline_new();
    return RawSerializationPipeline.__wrap(ret);
  }
  serializeAll(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, joints) {
    _assertClass(gravity, RawVector);
    _assertClass(integrationParameters, RawIntegrationParameters);
    _assertClass(islands, RawIslandManager);
    _assertClass(broadPhase, RawBroadPhase);
    _assertClass(narrowPhase, RawNarrowPhase);
    _assertClass(bodies, RawRigidBodySet);
    _assertClass(colliders, RawColliderSet);
    _assertClass(joints, RawJointSet);
    var ret = rawserializationpipeline_serializeAll(this.ptr, gravity.ptr, integrationParameters.ptr, islands.ptr, broadPhase.ptr, narrowPhase.ptr, bodies.ptr, colliders.ptr, joints.ptr);
    return takeObject(ret);
  }
  deserializeAll(data) {
    var ret = rawserializationpipeline_deserializeAll(this.ptr, addHeapObject(data));
    return ret === 0 ? void 0 : RawDeserializedWorld.__wrap(ret);
  }
};
var RawShape = class {
  static __wrap(ptr) {
    const obj = Object.create(RawShape.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawshape_free(ptr);
  }
  static cuboid(hx, hy, hz) {
    var ret = rawshape_cuboid(hx, hy, hz);
    return RawShape.__wrap(ret);
  }
  static roundCuboid(hx, hy, hz, borderRadius) {
    var ret = rawshape_roundCuboid(hx, hy, hz, borderRadius);
    return RawShape.__wrap(ret);
  }
  static ball(radius) {
    var ret = rawshape_ball(radius);
    return RawShape.__wrap(ret);
  }
  static capsule(halfHeight, radius) {
    var ret = rawshape_capsule(halfHeight, radius);
    return RawShape.__wrap(ret);
  }
  static cylinder(halfHeight, radius) {
    var ret = rawshape_cylinder(halfHeight, radius);
    return RawShape.__wrap(ret);
  }
  static roundCylinder(halfHeight, radius, borderRadius) {
    var ret = rawshape_roundCylinder(halfHeight, radius, borderRadius);
    return RawShape.__wrap(ret);
  }
  static cone(halfHeight, radius) {
    var ret = rawshape_cone(halfHeight, radius);
    return RawShape.__wrap(ret);
  }
  static roundCone(halfHeight, radius, borderRadius) {
    var ret = rawshape_roundCone(halfHeight, radius, borderRadius);
    return RawShape.__wrap(ret);
  }
  static polyline(vertices, indices) {
    var ptr0 = passArrayF32ToWasm0(vertices, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = passArray32ToWasm0(indices, __wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    var ret = rawshape_polyline(ptr0, len0, ptr1, len1);
    return RawShape.__wrap(ret);
  }
  static trimesh(vertices, indices) {
    var ptr0 = passArrayF32ToWasm0(vertices, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = passArray32ToWasm0(indices, __wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    var ret = rawshape_trimesh(ptr0, len0, ptr1, len1);
    return RawShape.__wrap(ret);
  }
  static heightfield(nrows, ncols, heights, scale) {
    var ptr0 = passArrayF32ToWasm0(heights, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    _assertClass(scale, RawVector);
    var ret = rawshape_heightfield(nrows, ncols, ptr0, len0, scale.ptr);
    return RawShape.__wrap(ret);
  }
  static segment(p1, p2) {
    _assertClass(p1, RawVector);
    _assertClass(p2, RawVector);
    var ret = rawshape_segment(p1.ptr, p2.ptr);
    return RawShape.__wrap(ret);
  }
  static triangle(p1, p2, p3) {
    _assertClass(p1, RawVector);
    _assertClass(p2, RawVector);
    _assertClass(p3, RawVector);
    var ret = rawshape_triangle(p1.ptr, p2.ptr, p3.ptr);
    return RawShape.__wrap(ret);
  }
  static roundTriangle(p1, p2, p3, borderRadius) {
    _assertClass(p1, RawVector);
    _assertClass(p2, RawVector);
    _assertClass(p3, RawVector);
    var ret = rawshape_roundTriangle(p1.ptr, p2.ptr, p3.ptr, borderRadius);
    return RawShape.__wrap(ret);
  }
  static convexHull(points) {
    var ptr0 = passArrayF32ToWasm0(points, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ret = rawshape_convexHull(ptr0, len0);
    return ret === 0 ? void 0 : RawShape.__wrap(ret);
  }
  static roundConvexHull(points, borderRadius) {
    var ptr0 = passArrayF32ToWasm0(points, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ret = rawshape_roundConvexHull(ptr0, len0, borderRadius);
    return ret === 0 ? void 0 : RawShape.__wrap(ret);
  }
  static convexMesh(vertices, indices) {
    var ptr0 = passArrayF32ToWasm0(vertices, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = passArray32ToWasm0(indices, __wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    var ret = rawshape_convexMesh(ptr0, len0, ptr1, len1);
    return ret === 0 ? void 0 : RawShape.__wrap(ret);
  }
  static roundConvexMesh(vertices, indices, borderRadius) {
    var ptr0 = passArrayF32ToWasm0(vertices, __wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = passArray32ToWasm0(indices, __wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    var ret = rawshape_roundConvexMesh(ptr0, len0, ptr1, len1, borderRadius);
    return ret === 0 ? void 0 : RawShape.__wrap(ret);
  }
};
var RawShapeColliderTOI = class {
  static __wrap(ptr) {
    const obj = Object.create(RawShapeColliderTOI.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawshapecollidertoi_free(ptr);
  }
  colliderHandle() {
    var ret = rawpointcolliderprojection_colliderHandle(this.ptr);
    return ret >>> 0;
  }
  toi() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
  witness1() {
    var ret = rawraycolliderintersection_normal(this.ptr);
    return RawVector.__wrap(ret);
  }
  witness2() {
    var ret = rawraycolliderintersection_normal(this.ptr);
    return RawVector.__wrap(ret);
  }
  normal1() {
    var ret = rawshapecollidertoi_normal1(this.ptr);
    return RawVector.__wrap(ret);
  }
  normal2() {
    var ret = rawshapecollidertoi_normal1(this.ptr);
    return RawVector.__wrap(ret);
  }
};
var RawVector = class {
  static __wrap(ptr) {
    const obj = Object.create(RawVector.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    __wbg_rawvector_free(ptr);
  }
  static zero() {
    var ret = rawvector_zero();
    return RawVector.__wrap(ret);
  }
  constructor(x, y, z) {
    var ret = rawvector_new(x, y, z);
    return RawVector.__wrap(ret);
  }
  get x() {
    var ret = rawintegrationparameters_dt(this.ptr);
    return ret;
  }
  set x(x) {
    rawintegrationparameters_set_dt(this.ptr, x);
  }
  get y() {
    var ret = rawrotation_y(this.ptr);
    return ret;
  }
  set y(y) {
    rawvector_set_y(this.ptr, y);
  }
  get z() {
    var ret = rawintegrationparameters_erp(this.ptr);
    return ret;
  }
  set z(z) {
    rawintegrationparameters_set_erp(this.ptr, z);
  }
  xyz() {
    var ret = rawvector_xyz(this.ptr);
    return RawVector.__wrap(ret);
  }
  yxz() {
    var ret = rawvector_yxz(this.ptr);
    return RawVector.__wrap(ret);
  }
  zxy() {
    var ret = rawvector_zxy(this.ptr);
    return RawVector.__wrap(ret);
  }
  xzy() {
    var ret = rawvector_xzy(this.ptr);
    return RawVector.__wrap(ret);
  }
  yzx() {
    var ret = rawvector_yzx(this.ptr);
    return RawVector.__wrap(ret);
  }
  zyx() {
    var ret = rawvector_zyx(this.ptr);
    return RawVector.__wrap(ret);
  }
};
function __wbindgen_object_drop_ref(arg0) {
  takeObject(arg0);
}
function __wbindgen_number_new(arg0) {
  var ret = arg0;
  return addHeapObject(ret);
}
function __wbg_rawraycolliderintersection_new(arg0) {
  var ret = RawRayColliderIntersection.__wrap(arg0);
  return addHeapObject(ret);
}
function __wbindgen_string_new(arg0, arg1) {
  var ret = getStringFromWasm0(arg0, arg1);
  return addHeapObject(ret);
}
function __wbg_now_44a034aa2e1d73dd(arg0) {
  var ret = getObject(arg0).now();
  return ret;
}
function __wbg_get_800098c980b31ea2() {
  return handleError(function(arg0, arg1) {
    var ret = Reflect.get(getObject(arg0), getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_call_ba36642bd901572b() {
  return handleError(function(arg0, arg1) {
    var ret = getObject(arg0).call(getObject(arg1));
    return addHeapObject(ret);
  }, arguments);
}
function __wbindgen_object_clone_ref(arg0) {
  var ret = getObject(arg0);
  return addHeapObject(ret);
}
function __wbg_newnoargs_9fdd8f3961dd1bee(arg0, arg1) {
  var ret = new Function(getStringFromWasm0(arg0, arg1));
  return addHeapObject(ret);
}
function __wbg_call_3fc07b7d5fc9022d() {
  return handleError(function(arg0, arg1, arg2) {
    var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_call_2c06c503c0d359bd() {
  return handleError(function(arg0, arg1, arg2, arg3) {
    var ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_call_f30b405e7b5e253f() {
  return handleError(function(arg0, arg1, arg2, arg3, arg4) {
    var ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_bind_eb09a5d063488170(arg0, arg1, arg2, arg3) {
  var ret = getObject(arg0).bind(getObject(arg1), getObject(arg2), getObject(arg3));
  return addHeapObject(ret);
}
function __wbg_buffer_9e184d6f785de5ed(arg0) {
  var ret = getObject(arg0).buffer;
  return addHeapObject(ret);
}
function __wbg_self_bb69a836a72ec6e9() {
  return handleError(function() {
    var ret = self.self;
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_window_3304fc4b414c9693() {
  return handleError(function() {
    var ret = window.window;
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_globalThis_e0d21cabc6630763() {
  return handleError(function() {
    var ret = globalThis.globalThis;
    return addHeapObject(ret);
  }, arguments);
}
function __wbg_global_8463719227271676() {
  return handleError(function() {
    var ret = global.global;
    return addHeapObject(ret);
  }, arguments);
}
function __wbindgen_is_undefined(arg0) {
  var ret = getObject(arg0) === void 0;
  return ret;
}
function __wbg_newwithbyteoffsetandlength_e57ad1f2ce812c03(arg0, arg1, arg2) {
  var ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
  return addHeapObject(ret);
}
function __wbg_length_2d56cb37075fcfb1(arg0) {
  var ret = getObject(arg0).length;
  return ret;
}
function __wbg_new_e8101319e4cf95fc(arg0) {
  var ret = new Uint8Array(getObject(arg0));
  return addHeapObject(ret);
}
function __wbg_set_e8ae7b27314e8b98(arg0, arg1, arg2) {
  getObject(arg0).set(getObject(arg1), arg2 >>> 0);
}
function __wbindgen_number_get(arg0, arg1) {
  const obj = getObject(arg1);
  var ret = typeof obj === "number" ? obj : void 0;
  getFloat64Memory0()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
  getInt32Memory0()[arg0 / 4 + 0] = !isLikeNone(ret);
}
function __wbindgen_boolean_get(arg0) {
  const v = getObject(arg0);
  var ret = typeof v === "boolean" ? v ? 1 : 0 : 2;
  return ret;
}
function __wbindgen_debug_string(arg0, arg1) {
  var ret = debugString(getObject(arg1));
  var ptr0 = passStringToWasm0(ret, __wbindgen_malloc, __wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
}
function __wbindgen_throw(arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
}
function __wbindgen_memory() {
  var ret = memory;
  return addHeapObject(ret);
}

// wasm-module:/Users/darzu/projects/rapier3d-dz/rapier_wasm3d_bg.wasm
var imports = {
  ["./rapier_wasm3d_bg.js"]: {
    __wbindgen_object_drop_ref,
    __wbindgen_number_new,
    __wbg_rawraycolliderintersection_new,
    __wbindgen_string_new,
    __wbg_now_44a034aa2e1d73dd,
    __wbg_get_800098c980b31ea2,
    __wbg_call_ba36642bd901572b,
    __wbindgen_object_clone_ref,
    __wbg_newnoargs_9fdd8f3961dd1bee,
    __wbg_call_3fc07b7d5fc9022d,
    __wbg_call_2c06c503c0d359bd,
    __wbg_call_f30b405e7b5e253f,
    __wbg_bind_eb09a5d063488170,
    __wbg_buffer_9e184d6f785de5ed,
    __wbg_self_bb69a836a72ec6e9,
    __wbg_window_3304fc4b414c9693,
    __wbg_globalThis_e0d21cabc6630763,
    __wbg_global_8463719227271676,
    __wbindgen_is_undefined,
    __wbg_newwithbyteoffsetandlength_e57ad1f2ce812c03,
    __wbg_length_2d56cb37075fcfb1,
    __wbg_new_e8101319e4cf95fc,
    __wbg_set_e8ae7b27314e8b98,
    __wbindgen_number_get,
    __wbindgen_boolean_get,
    __wbindgen_debug_string,
    __wbindgen_throw,
    __wbindgen_memory
  }
};
async function loadWasm(module3, imports2) {
  console.log('loadWasm');
  if (typeof module3 === "string") {
    const moduleRequest = await fetch(module3);
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(moduleRequest, imports2);
      } catch (e) {
        if (moduleRequest.headers.get("Content-Type") != "application/wasm") {
          console.warn(e);
        } else {
          throw e;
        }
      }
    }
    module3 = await moduleRequest.arrayBuffer();
  }
  return await WebAssembly.instantiate(module3, imports2);
}
var { instance, module: module2 } = await loadWasm(rapier_wasm3d_bg_default, imports);
var memory = instance.exports.memory;
var version = instance.exports.version;
var __wbg_rawccdsolver_free = instance.exports.__wbg_rawccdsolver_free;
var rawccdsolver_new = instance.exports.rawccdsolver_new;
var __wbg_rawintegrationparameters_free = instance.exports.__wbg_rawintegrationparameters_free;
var rawintegrationparameters_new = instance.exports.rawintegrationparameters_new;
var rawintegrationparameters_dt = instance.exports.rawintegrationparameters_dt;
var rawintegrationparameters_erp = instance.exports.rawintegrationparameters_erp;
var rawintegrationparameters_jointErp = instance.exports.rawintegrationparameters_jointErp;
var rawintegrationparameters_warmstartCoeff = instance.exports.rawintegrationparameters_warmstartCoeff;
var rawintegrationparameters_allowedLinearError = instance.exports.rawintegrationparameters_allowedLinearError;
var rawintegrationparameters_predictionDistance = instance.exports.rawintegrationparameters_predictionDistance;
var rawintegrationparameters_allowedAngularError = instance.exports.rawintegrationparameters_allowedAngularError;
var rawintegrationparameters_maxLinearCorrection = instance.exports.rawintegrationparameters_maxLinearCorrection;
var rawintegrationparameters_maxAngularCorrection = instance.exports.rawintegrationparameters_maxAngularCorrection;
var rawintegrationparameters_maxVelocityIterations = instance.exports.rawintegrationparameters_maxVelocityIterations;
var rawintegrationparameters_maxPositionIterations = instance.exports.rawintegrationparameters_maxPositionIterations;
var rawintegrationparameters_minIslandSize = instance.exports.rawintegrationparameters_minIslandSize;
var rawintegrationparameters_maxCcdSubsteps = instance.exports.rawintegrationparameters_maxCcdSubsteps;
var rawintegrationparameters_set_dt = instance.exports.rawintegrationparameters_set_dt;
var rawintegrationparameters_set_erp = instance.exports.rawintegrationparameters_set_erp;
var rawintegrationparameters_set_jointErp = instance.exports.rawintegrationparameters_set_jointErp;
var rawintegrationparameters_set_warmstartCoeff = instance.exports.rawintegrationparameters_set_warmstartCoeff;
var rawintegrationparameters_set_allowedLinearError = instance.exports.rawintegrationparameters_set_allowedLinearError;
var rawintegrationparameters_set_predictionDistance = instance.exports.rawintegrationparameters_set_predictionDistance;
var rawintegrationparameters_set_allowedAngularError = instance.exports.rawintegrationparameters_set_allowedAngularError;
var rawintegrationparameters_set_maxLinearCorrection = instance.exports.rawintegrationparameters_set_maxLinearCorrection;
var rawintegrationparameters_set_maxAngularCorrection = instance.exports.rawintegrationparameters_set_maxAngularCorrection;
var rawintegrationparameters_set_maxVelocityIterations = instance.exports.rawintegrationparameters_set_maxVelocityIterations;
var rawintegrationparameters_set_maxPositionIterations = instance.exports.rawintegrationparameters_set_maxPositionIterations;
var rawintegrationparameters_set_minIslandSize = instance.exports.rawintegrationparameters_set_minIslandSize;
var rawintegrationparameters_set_maxCcdSubsteps = instance.exports.rawintegrationparameters_set_maxCcdSubsteps;
var __wbg_rawislandmanager_free = instance.exports.__wbg_rawislandmanager_free;
var rawislandmanager_new = instance.exports.rawislandmanager_new;
var rawislandmanager_forEachActiveRigidBodyHandle = instance.exports.rawislandmanager_forEachActiveRigidBodyHandle;
var rawjointset_jointBodyHandle1 = instance.exports.rawjointset_jointBodyHandle1;
var rawjointset_jointBodyHandle2 = instance.exports.rawjointset_jointBodyHandle2;
var rawjointset_jointType = instance.exports.rawjointset_jointType;
var rawjointset_jointFrameX1 = instance.exports.rawjointset_jointFrameX1;
var rawjointset_jointFrameX2 = instance.exports.rawjointset_jointFrameX2;
var rawjointset_jointAnchor1 = instance.exports.rawjointset_jointAnchor1;
var rawjointset_jointAnchor2 = instance.exports.rawjointset_jointAnchor2;
var rawjointset_jointAxis1 = instance.exports.rawjointset_jointAxis1;
var rawjointset_jointAxis2 = instance.exports.rawjointset_jointAxis2;
var rawjointset_jointLimitsEnabled = instance.exports.rawjointset_jointLimitsEnabled;
var rawjointset_jointLimitsMin = instance.exports.rawjointset_jointLimitsMin;
var rawjointset_jointLimitsMax = instance.exports.rawjointset_jointLimitsMax;
var rawjointset_jointConfigureMotorModel = instance.exports.rawjointset_jointConfigureMotorModel;
var rawjointset_jointConfigureBallMotorVelocity = instance.exports.rawjointset_jointConfigureBallMotorVelocity;
var rawjointset_jointConfigureBallMotorPosition = instance.exports.rawjointset_jointConfigureBallMotorPosition;
var rawjointset_jointConfigureBallMotor = instance.exports.rawjointset_jointConfigureBallMotor;
var rawjointset_jointConfigureUnitMotorVelocity = instance.exports.rawjointset_jointConfigureUnitMotorVelocity;
var rawjointset_jointConfigureUnitMotorPosition = instance.exports.rawjointset_jointConfigureUnitMotorPosition;
var rawjointset_jointConfigureUnitMotor = instance.exports.rawjointset_jointConfigureUnitMotor;
var __wbg_rawjointparams_free = instance.exports.__wbg_rawjointparams_free;
var rawjointparams_ball = instance.exports.rawjointparams_ball;
var rawjointparams_prismatic = instance.exports.rawjointparams_prismatic;
var rawjointparams_fixed = instance.exports.rawjointparams_fixed;
var rawjointparams_revolute = instance.exports.rawjointparams_revolute;
var __wbg_rawjointset_free = instance.exports.__wbg_rawjointset_free;
var rawjointset_new = instance.exports.rawjointset_new;
var rawjointset_createJoint = instance.exports.rawjointset_createJoint;
var rawjointset_remove = instance.exports.rawjointset_remove;
var rawjointset_len = instance.exports.rawjointset_len;
var rawjointset_contains = instance.exports.rawjointset_contains;
var rawjointset_forEachJointHandle = instance.exports.rawjointset_forEachJointHandle;
var rawrigidbodyset_rbTranslation = instance.exports.rawrigidbodyset_rbTranslation;
var rawrigidbodyset_rbRotation = instance.exports.rawrigidbodyset_rbRotation;
var rawrigidbodyset_rbSleep = instance.exports.rawrigidbodyset_rbSleep;
var rawrigidbodyset_rbIsSleeping = instance.exports.rawrigidbodyset_rbIsSleeping;
var rawrigidbodyset_rbIsMoving = instance.exports.rawrigidbodyset_rbIsMoving;
var rawrigidbodyset_rbNextTranslation = instance.exports.rawrigidbodyset_rbNextTranslation;
var rawrigidbodyset_rbNextRotation = instance.exports.rawrigidbodyset_rbNextRotation;
var rawrigidbodyset_rbSetTranslation = instance.exports.rawrigidbodyset_rbSetTranslation;
var rawrigidbodyset_rbSetRotation = instance.exports.rawrigidbodyset_rbSetRotation;
var rawrigidbodyset_rbSetLinvel = instance.exports.rawrigidbodyset_rbSetLinvel;
var rawrigidbodyset_rbSetAngvel = instance.exports.rawrigidbodyset_rbSetAngvel;
var rawrigidbodyset_rbSetNextKinematicTranslation = instance.exports.rawrigidbodyset_rbSetNextKinematicTranslation;
var rawrigidbodyset_rbSetNextKinematicRotation = instance.exports.rawrigidbodyset_rbSetNextKinematicRotation;
var rawrigidbodyset_rbLinvel = instance.exports.rawrigidbodyset_rbLinvel;
var rawrigidbodyset_rbAngvel = instance.exports.rawrigidbodyset_rbAngvel;
var rawrigidbodyset_rbLockRotations = instance.exports.rawrigidbodyset_rbLockRotations;
var rawrigidbodyset_rbRestrictRotations = instance.exports.rawrigidbodyset_rbRestrictRotations;
var rawrigidbodyset_rbDominanceGroup = instance.exports.rawrigidbodyset_rbDominanceGroup;
var rawrigidbodyset_rbSetDominanceGroup = instance.exports.rawrigidbodyset_rbSetDominanceGroup;
var rawrigidbodyset_rbEnableCcd = instance.exports.rawrigidbodyset_rbEnableCcd;
var rawrigidbodyset_rbMass = instance.exports.rawrigidbodyset_rbMass;
var rawrigidbodyset_rbWakeUp = instance.exports.rawrigidbodyset_rbWakeUp;
var rawrigidbodyset_rbIsCcdEnabled = instance.exports.rawrigidbodyset_rbIsCcdEnabled;
var rawrigidbodyset_rbNumColliders = instance.exports.rawrigidbodyset_rbNumColliders;
var rawrigidbodyset_rbCollider = instance.exports.rawrigidbodyset_rbCollider;
var rawrigidbodyset_rbBodyType = instance.exports.rawrigidbodyset_rbBodyType;
var rawrigidbodyset_rbIsStatic = instance.exports.rawrigidbodyset_rbIsStatic;
var rawrigidbodyset_rbIsKinematic = instance.exports.rawrigidbodyset_rbIsKinematic;
var rawrigidbodyset_rbIsDynamic = instance.exports.rawrigidbodyset_rbIsDynamic;
var rawrigidbodyset_rbLinearDamping = instance.exports.rawrigidbodyset_rbLinearDamping;
var rawrigidbodyset_rbAngularDamping = instance.exports.rawrigidbodyset_rbAngularDamping;
var rawrigidbodyset_rbSetLinearDamping = instance.exports.rawrigidbodyset_rbSetLinearDamping;
var rawrigidbodyset_rbSetAngularDamping = instance.exports.rawrigidbodyset_rbSetAngularDamping;
var rawrigidbodyset_rbGravityScale = instance.exports.rawrigidbodyset_rbGravityScale;
var rawrigidbodyset_rbSetGravityScale = instance.exports.rawrigidbodyset_rbSetGravityScale;
var rawrigidbodyset_rbApplyForce = instance.exports.rawrigidbodyset_rbApplyForce;
var rawrigidbodyset_rbApplyImpulse = instance.exports.rawrigidbodyset_rbApplyImpulse;
var rawrigidbodyset_rbApplyTorque = instance.exports.rawrigidbodyset_rbApplyTorque;
var rawrigidbodyset_rbApplyTorqueImpulse = instance.exports.rawrigidbodyset_rbApplyTorqueImpulse;
var rawrigidbodyset_rbApplyForceAtPoint = instance.exports.rawrigidbodyset_rbApplyForceAtPoint;
var rawrigidbodyset_rbApplyImpulseAtPoint = instance.exports.rawrigidbodyset_rbApplyImpulseAtPoint;
var __wbg_rawrigidbodyset_free = instance.exports.__wbg_rawrigidbodyset_free;
var rawrigidbodyset_new = instance.exports.rawrigidbodyset_new;
var rawrigidbodyset_createRigidBody = instance.exports.rawrigidbodyset_createRigidBody;
var rawrigidbodyset_remove = instance.exports.rawrigidbodyset_remove;
var rawrigidbodyset_len = instance.exports.rawrigidbodyset_len;
var rawrigidbodyset_contains = instance.exports.rawrigidbodyset_contains;
var rawrigidbodyset_forEachRigidBodyHandle = instance.exports.rawrigidbodyset_forEachRigidBodyHandle;
var __wbg_rawbroadphase_free = instance.exports.__wbg_rawbroadphase_free;
var rawbroadphase_new = instance.exports.rawbroadphase_new;
var rawcolliderset_coTranslation = instance.exports.rawcolliderset_coTranslation;
var rawcolliderset_coRotation = instance.exports.rawcolliderset_coRotation;
var rawcolliderset_coSetTranslation = instance.exports.rawcolliderset_coSetTranslation;
var rawcolliderset_coSetTranslationWrtParent = instance.exports.rawcolliderset_coSetTranslationWrtParent;
var rawcolliderset_coSetRotation = instance.exports.rawcolliderset_coSetRotation;
var rawcolliderset_coSetRotationWrtParent = instance.exports.rawcolliderset_coSetRotationWrtParent;
var rawcolliderset_coIsSensor = instance.exports.rawcolliderset_coIsSensor;
var rawcolliderset_coShapeType = instance.exports.rawcolliderset_coShapeType;
var rawcolliderset_coHalfExtents = instance.exports.rawcolliderset_coHalfExtents;
var rawcolliderset_coRadius = instance.exports.rawcolliderset_coRadius;
var rawcolliderset_coHalfHeight = instance.exports.rawcolliderset_coHalfHeight;
var rawcolliderset_coRoundRadius = instance.exports.rawcolliderset_coRoundRadius;
var rawcolliderset_coVertices = instance.exports.rawcolliderset_coVertices;
var rawcolliderset_coIndices = instance.exports.rawcolliderset_coIndices;
var rawcolliderset_coHeightfieldHeights = instance.exports.rawcolliderset_coHeightfieldHeights;
var rawcolliderset_coHeightfieldScale = instance.exports.rawcolliderset_coHeightfieldScale;
var rawcolliderset_coHeightfieldNRows = instance.exports.rawcolliderset_coHeightfieldNRows;
var rawcolliderset_coHeightfieldNCols = instance.exports.rawcolliderset_coHeightfieldNCols;
var rawcolliderset_coParent = instance.exports.rawcolliderset_coParent;
var rawcolliderset_coFriction = instance.exports.rawcolliderset_coFriction;
var rawcolliderset_coDensity = instance.exports.rawcolliderset_coDensity;
var rawcolliderset_coCollisionGroups = instance.exports.rawcolliderset_coCollisionGroups;
var rawcolliderset_coSolverGroups = instance.exports.rawcolliderset_coSolverGroups;
var rawcolliderset_coActiveHooks = instance.exports.rawcolliderset_coActiveHooks;
var rawcolliderset_coActiveCollisionTypes = instance.exports.rawcolliderset_coActiveCollisionTypes;
var rawcolliderset_coActiveEvents = instance.exports.rawcolliderset_coActiveEvents;
var rawcolliderset_coSetSensor = instance.exports.rawcolliderset_coSetSensor;
var rawcolliderset_coSetRestitution = instance.exports.rawcolliderset_coSetRestitution;
var rawcolliderset_coSetFriction = instance.exports.rawcolliderset_coSetFriction;
var rawcolliderset_coFrictionCombineRule = instance.exports.rawcolliderset_coFrictionCombineRule;
var rawcolliderset_coSetFrictionCombineRule = instance.exports.rawcolliderset_coSetFrictionCombineRule;
var rawcolliderset_coRestitutionCombineRule = instance.exports.rawcolliderset_coRestitutionCombineRule;
var rawcolliderset_coSetRestitutionCombineRule = instance.exports.rawcolliderset_coSetRestitutionCombineRule;
var rawcolliderset_coSetCollisionGroups = instance.exports.rawcolliderset_coSetCollisionGroups;
var rawcolliderset_coSetSolverGroups = instance.exports.rawcolliderset_coSetSolverGroups;
var rawcolliderset_coSetActiveHooks = instance.exports.rawcolliderset_coSetActiveHooks;
var rawcolliderset_coSetActiveEvents = instance.exports.rawcolliderset_coSetActiveEvents;
var rawcolliderset_coSetActiveCollisionTypes = instance.exports.rawcolliderset_coSetActiveCollisionTypes;
var rawcolliderset_coSetShape = instance.exports.rawcolliderset_coSetShape;
var __wbg_rawcolliderset_free = instance.exports.__wbg_rawcolliderset_free;
var rawcolliderset_new = instance.exports.rawcolliderset_new;
var rawcolliderset_len = instance.exports.rawcolliderset_len;
var rawcolliderset_contains = instance.exports.rawcolliderset_contains;
var rawcolliderset_createCollider = instance.exports.rawcolliderset_createCollider;
var rawcolliderset_remove = instance.exports.rawcolliderset_remove;
var rawcolliderset_forEachColliderHandle = instance.exports.rawcolliderset_forEachColliderHandle;
var __wbg_rawnarrowphase_free = instance.exports.__wbg_rawnarrowphase_free;
var rawnarrowphase_new = instance.exports.rawnarrowphase_new;
var rawnarrowphase_contacts_with = instance.exports.rawnarrowphase_contacts_with;
var rawnarrowphase_contact_pair = instance.exports.rawnarrowphase_contact_pair;
var rawnarrowphase_intersections_with = instance.exports.rawnarrowphase_intersections_with;
var rawnarrowphase_intersection_pair = instance.exports.rawnarrowphase_intersection_pair;
var __wbg_rawcontactmanifold_free = instance.exports.__wbg_rawcontactmanifold_free;
var rawcontactpair_collider1 = instance.exports.rawcontactpair_collider1;
var rawcontactpair_collider2 = instance.exports.rawcontactpair_collider2;
var rawcontactpair_numContactManifolds = instance.exports.rawcontactpair_numContactManifolds;
var rawcontactpair_contactManifold = instance.exports.rawcontactpair_contactManifold;
var rawcontactmanifold_normal = instance.exports.rawcontactmanifold_normal;
var rawcontactmanifold_local_n1 = instance.exports.rawcontactmanifold_local_n1;
var rawcontactmanifold_subshape1 = instance.exports.rawcontactmanifold_subshape1;
var rawcontactmanifold_num_contacts = instance.exports.rawcontactmanifold_num_contacts;
var rawcontactmanifold_contact_local_p1 = instance.exports.rawcontactmanifold_contact_local_p1;
var rawcontactmanifold_contact_dist = instance.exports.rawcontactmanifold_contact_dist;
var rawcontactmanifold_contact_fid1 = instance.exports.rawcontactmanifold_contact_fid1;
var rawcontactmanifold_contact_fid2 = instance.exports.rawcontactmanifold_contact_fid2;
var rawcontactmanifold_contact_impulse = instance.exports.rawcontactmanifold_contact_impulse;
var rawcontactmanifold_contact_tangent_impulse_x = instance.exports.rawcontactmanifold_contact_tangent_impulse_x;
var rawcontactmanifold_contact_tangent_impulse_y = instance.exports.rawcontactmanifold_contact_tangent_impulse_y;
var rawcontactmanifold_num_solver_contacts = instance.exports.rawcontactmanifold_num_solver_contacts;
var rawcontactmanifold_solver_contact_point = instance.exports.rawcontactmanifold_solver_contact_point;
var rawcontactmanifold_solver_contact_dist = instance.exports.rawcontactmanifold_solver_contact_dist;
var rawcontactmanifold_solver_contact_friction = instance.exports.rawcontactmanifold_solver_contact_friction;
var rawcontactmanifold_solver_contact_restitution = instance.exports.rawcontactmanifold_solver_contact_restitution;
var rawcontactmanifold_solver_contact_tangent_velocity = instance.exports.rawcontactmanifold_solver_contact_tangent_velocity;
var __wbg_rawpointcolliderprojection_free = instance.exports.__wbg_rawpointcolliderprojection_free;
var rawpointcolliderprojection_colliderHandle = instance.exports.rawpointcolliderprojection_colliderHandle;
var rawpointcolliderprojection_point = instance.exports.rawpointcolliderprojection_point;
var rawpointcolliderprojection_isInside = instance.exports.rawpointcolliderprojection_isInside;
var __wbg_rawraycolliderintersection_free = instance.exports.__wbg_rawraycolliderintersection_free;
var rawraycolliderintersection_normal = instance.exports.rawraycolliderintersection_normal;
var __wbg_rawraycollidertoi_free = instance.exports.__wbg_rawraycollidertoi_free;
var __wbg_rawshape_free = instance.exports.__wbg_rawshape_free;
var rawshape_cuboid = instance.exports.rawshape_cuboid;
var rawshape_roundCuboid = instance.exports.rawshape_roundCuboid;
var rawshape_ball = instance.exports.rawshape_ball;
var rawshape_capsule = instance.exports.rawshape_capsule;
var rawshape_cylinder = instance.exports.rawshape_cylinder;
var rawshape_roundCylinder = instance.exports.rawshape_roundCylinder;
var rawshape_cone = instance.exports.rawshape_cone;
var rawshape_roundCone = instance.exports.rawshape_roundCone;
var rawshape_polyline = instance.exports.rawshape_polyline;
var rawshape_trimesh = instance.exports.rawshape_trimesh;
var rawshape_heightfield = instance.exports.rawshape_heightfield;
var rawshape_segment = instance.exports.rawshape_segment;
var rawshape_triangle = instance.exports.rawshape_triangle;
var rawshape_roundTriangle = instance.exports.rawshape_roundTriangle;
var rawshape_convexHull = instance.exports.rawshape_convexHull;
var rawshape_roundConvexHull = instance.exports.rawshape_roundConvexHull;
var rawshape_convexMesh = instance.exports.rawshape_convexMesh;
var rawshape_roundConvexMesh = instance.exports.rawshape_roundConvexMesh;
var __wbg_rawshapecollidertoi_free = instance.exports.__wbg_rawshapecollidertoi_free;
var rawshapecollidertoi_normal1 = instance.exports.rawshapecollidertoi_normal1;
var __wbg_rawrotation_free = instance.exports.__wbg_rawrotation_free;
var rawrotation_new = instance.exports.rawrotation_new;
var rawrotation_identity = instance.exports.rawrotation_identity;
var rawrotation_y = instance.exports.rawrotation_y;
var rawvector_zero = instance.exports.rawvector_zero;
var rawvector_new = instance.exports.rawvector_new;
var rawvector_set_y = instance.exports.rawvector_set_y;
var rawvector_xyz = instance.exports.rawvector_xyz;
var rawvector_yxz = instance.exports.rawvector_yxz;
var rawvector_zxy = instance.exports.rawvector_zxy;
var rawvector_xzy = instance.exports.rawvector_xzy;
var rawvector_yzx = instance.exports.rawvector_yzx;
var rawvector_zyx = instance.exports.rawvector_zyx;
var __wbg_raweventqueue_free = instance.exports.__wbg_raweventqueue_free;
var raweventqueue_new = instance.exports.raweventqueue_new;
var raweventqueue_drainContactEvents = instance.exports.raweventqueue_drainContactEvents;
var raweventqueue_drainIntersectionEvents = instance.exports.raweventqueue_drainIntersectionEvents;
var raweventqueue_clear = instance.exports.raweventqueue_clear;
var __wbg_rawphysicspipeline_free = instance.exports.__wbg_rawphysicspipeline_free;
var rawphysicspipeline_new = instance.exports.rawphysicspipeline_new;
var rawphysicspipeline_step = instance.exports.rawphysicspipeline_step;
var rawphysicspipeline_stepWithEvents = instance.exports.rawphysicspipeline_stepWithEvents;
var __wbg_rawquerypipeline_free = instance.exports.__wbg_rawquerypipeline_free;
var rawquerypipeline_new = instance.exports.rawquerypipeline_new;
var rawquerypipeline_update = instance.exports.rawquerypipeline_update;
var rawquerypipeline_castRay = instance.exports.rawquerypipeline_castRay;
var rawquerypipeline_castRayAndGetNormal = instance.exports.rawquerypipeline_castRayAndGetNormal;
var rawquerypipeline_intersectionsWithRay = instance.exports.rawquerypipeline_intersectionsWithRay;
var rawquerypipeline_intersectionWithShape = instance.exports.rawquerypipeline_intersectionWithShape;
var rawquerypipeline_projectPoint = instance.exports.rawquerypipeline_projectPoint;
var rawquerypipeline_intersectionsWithPoint = instance.exports.rawquerypipeline_intersectionsWithPoint;
var rawquerypipeline_castShape = instance.exports.rawquerypipeline_castShape;
var rawquerypipeline_intersectionsWithShape = instance.exports.rawquerypipeline_intersectionsWithShape;
var rawquerypipeline_collidersWithAabbIntersectingAabb = instance.exports.rawquerypipeline_collidersWithAabbIntersectingAabb;
var __wbg_rawdeserializedworld_free = instance.exports.__wbg_rawdeserializedworld_free;
var rawdeserializedworld_takeGravity = instance.exports.rawdeserializedworld_takeGravity;
var rawdeserializedworld_takeIntegrationParameters = instance.exports.rawdeserializedworld_takeIntegrationParameters;
var rawdeserializedworld_takeIslandManager = instance.exports.rawdeserializedworld_takeIslandManager;
var rawdeserializedworld_takeBroadPhase = instance.exports.rawdeserializedworld_takeBroadPhase;
var rawdeserializedworld_takeNarrowPhase = instance.exports.rawdeserializedworld_takeNarrowPhase;
var rawdeserializedworld_takeBodies = instance.exports.rawdeserializedworld_takeBodies;
var rawdeserializedworld_takeColliders = instance.exports.rawdeserializedworld_takeColliders;
var rawdeserializedworld_takeJoints = instance.exports.rawdeserializedworld_takeJoints;
var rawserializationpipeline_serializeAll = instance.exports.rawserializationpipeline_serializeAll;
var rawserializationpipeline_deserializeAll = instance.exports.rawserializationpipeline_deserializeAll;
var __wbg_rawcontactpair_free = instance.exports.__wbg_rawcontactpair_free;
var __wbg_rawvector_free = instance.exports.__wbg_rawvector_free;
var rawshapecollidertoi_witness1 = instance.exports.rawshapecollidertoi_witness1;
var rawshapecollidertoi_witness2 = instance.exports.rawshapecollidertoi_witness2;
var rawshapecollidertoi_normal2 = instance.exports.rawshapecollidertoi_normal2;
var rawcontactmanifold_subshape2 = instance.exports.rawcontactmanifold_subshape2;
var rawserializationpipeline_new = instance.exports.rawserializationpipeline_new;
var rawcontactmanifold_contact_local_p2 = instance.exports.rawcontactmanifold_contact_local_p2;
var rawrigidbodyset_rbLockTranslations = instance.exports.rawrigidbodyset_rbLockTranslations;
var rawcontactmanifold_local_n2 = instance.exports.rawcontactmanifold_local_n2;
var rawraycolliderintersection_colliderHandle = instance.exports.rawraycolliderintersection_colliderHandle;
var rawraycollidertoi_colliderHandle = instance.exports.rawraycollidertoi_colliderHandle;
var rawshapecollidertoi_colliderHandle = instance.exports.rawshapecollidertoi_colliderHandle;
var __wbg_rawserializationpipeline_free = instance.exports.__wbg_rawserializationpipeline_free;
var rawvector_set_x = instance.exports.rawvector_set_x;
var rawvector_set_z = instance.exports.rawvector_set_z;
var rawcolliderset_isHandleValid = instance.exports.rawcolliderset_isHandleValid;
var rawraycolliderintersection_toi = instance.exports.rawraycolliderintersection_toi;
var rawraycollidertoi_toi = instance.exports.rawraycollidertoi_toi;
var rawshapecollidertoi_toi = instance.exports.rawshapecollidertoi_toi;
var rawrotation_x = instance.exports.rawrotation_x;
var rawrotation_z = instance.exports.rawrotation_z;
var rawrotation_w = instance.exports.rawrotation_w;
var rawvector_x = instance.exports.rawvector_x;
var rawvector_y = instance.exports.rawvector_y;
var rawvector_z = instance.exports.rawvector_z;
var __wbindgen_malloc = instance.exports.__wbindgen_malloc;
var __wbindgen_realloc = instance.exports.__wbindgen_realloc;
var __wbindgen_add_to_stack_pointer = instance.exports.__wbindgen_add_to_stack_pointer;
var __wbindgen_free = instance.exports.__wbindgen_free;
var __wbindgen_exn_store = instance.exports.__wbindgen_exn_store;

// math.ts
var Vector3 = class {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
};
var VectorOps = class {
  static new(x, y, z) {
    return new Vector3(x, y, z);
  }
  static intoRaw(v) {
    return new RawVector(v.x, v.y, v.z);
  }
  static zeros() {
    return VectorOps.new(0, 0, 0);
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    let res = VectorOps.new(raw.x, raw.y, raw.z);
    raw.free();
    return res;
  }
};
var Quaternion = class {
  constructor(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
};
var RotationOps = class {
  static identity() {
    return new Quaternion(0, 0, 0, 1);
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    let res = new Quaternion(raw.x, raw.y, raw.z, raw.w);
    raw.free();
    return res;
  }
  static intoRaw(rot) {
    return new RawRotation(rot.x, rot.y, rot.z, rot.w);
  }
};

// dynamics/rigid_body.ts
var RigidBodyType;
(function(RigidBodyType2) {
  RigidBodyType2[RigidBodyType2["Dynamic"] = 0] = "Dynamic";
  RigidBodyType2[RigidBodyType2["Static"] = 1] = "Static";
  RigidBodyType2[RigidBodyType2["KinematicPositionBased"] = 2] = "KinematicPositionBased";
  RigidBodyType2[RigidBodyType2["KinematicVelocityBased"] = 3] = "KinematicVelocityBased";
})(RigidBodyType || (RigidBodyType = {}));
var RigidBody = class {
  constructor(rawSet, handle) {
    this.rawSet = rawSet;
    this.handle = handle;
  }
  isValid() {
    return this.rawSet.contains(this.handle);
  }
  lockTranslations(locked, wakeUp) {
    return this.rawSet.rbLockTranslations(this.handle, locked, wakeUp);
  }
  lockRotations(locked, wakeUp) {
    return this.rawSet.rbLockRotations(this.handle, locked, wakeUp);
  }
  restrictRotations(enableX, enableY, enableZ, wakeUp) {
    return this.rawSet.rbRestrictRotations(this.handle, enableX, enableY, enableZ, wakeUp);
  }
  dominanceGroup() {
    return this.rawSet.rbDominanceGroup(this.handle);
  }
  setDominanceGroup(group) {
    this.rawSet.rbSetDominanceGroup(this.handle, group);
  }
  enableCcd(enabled) {
    this.rawSet.rbEnableCcd(this.handle, enabled);
  }
  translation() {
    let res = this.rawSet.rbTranslation(this.handle);
    return VectorOps.fromRaw(res);
  }
  rotation() {
    let res = this.rawSet.rbRotation(this.handle);
    return RotationOps.fromRaw(res);
  }
  nextTranslation() {
    let res = this.rawSet.rbNextTranslation(this.handle);
    return VectorOps.fromRaw(res);
  }
  nextRotation() {
    let res = this.rawSet.rbNextRotation(this.handle);
    return RotationOps.fromRaw(res);
  }
  setTranslation(tra, wakeUp) {
    this.rawSet.rbSetTranslation(this.handle, tra.x, tra.y, tra.z, wakeUp);
  }
  setLinvel(vel, wakeUp) {
    let rawVel = VectorOps.intoRaw(vel);
    this.rawSet.rbSetLinvel(this.handle, rawVel, wakeUp);
    rawVel.free();
  }
  gravityScale() {
    return this.rawSet.rbGravityScale(this.handle);
  }
  setGravityScale(factor, wakeUp) {
    this.rawSet.rbSetGravityScale(this.handle, factor, wakeUp);
  }
  setRotation(rot, wakeUp) {
    this.rawSet.rbSetRotation(this.handle, rot.x, rot.y, rot.z, rot.w, wakeUp);
  }
  setAngvel(vel, wakeUp) {
    let rawVel = VectorOps.intoRaw(vel);
    this.rawSet.rbSetAngvel(this.handle, rawVel, wakeUp);
    rawVel.free();
  }
  setNextKinematicTranslation(t) {
    this.rawSet.rbSetNextKinematicTranslation(this.handle, t.x, t.y, t.z);
  }
  setNextKinematicRotation(rot) {
    this.rawSet.rbSetNextKinematicRotation(this.handle, rot.x, rot.y, rot.z, rot.w);
  }
  linvel() {
    return VectorOps.fromRaw(this.rawSet.rbLinvel(this.handle));
  }
  angvel() {
    return VectorOps.fromRaw(this.rawSet.rbAngvel(this.handle));
  }
  mass() {
    return this.rawSet.rbMass(this.handle);
  }
  sleep() {
    this.rawSet.rbSleep(this.handle);
  }
  wakeUp() {
    this.rawSet.rbWakeUp(this.handle);
  }
  isCcdEnabled() {
    this.rawSet.rbIsCcdEnabled(this.handle);
  }
  numColliders() {
    return this.rawSet.rbNumColliders(this.handle);
  }
  collider(i) {
    return this.rawSet.rbCollider(this.handle, i);
  }
  bodyType() {
    return this.rawSet.rbBodyType(this.handle);
  }
  isSleeping() {
    return this.rawSet.rbIsSleeping(this.handle);
  }
  isMoving() {
    return this.rawSet.rbIsMoving(this.handle);
  }
  isStatic() {
    return this.rawSet.rbIsStatic(this.handle);
  }
  isKinematic() {
    return this.rawSet.rbIsKinematic(this.handle);
  }
  isDynamic() {
    return this.rawSet.rbIsDynamic(this.handle);
  }
  linearDamping() {
    return this.rawSet.rbLinearDamping(this.handle);
  }
  angularDamping() {
    return this.rawSet.rbAngularDamping(this.handle);
  }
  setLinearDamping(factor) {
    this.rawSet.rbSetLinearDamping(this.handle, factor);
  }
  setAngularDamping(factor) {
    this.rawSet.rbSetAngularDamping(this.handle, factor);
  }
  applyForce(force, wakeUp) {
    const rawForce = VectorOps.intoRaw(force);
    this.rawSet.rbApplyForce(this.handle, rawForce, wakeUp);
    rawForce.free();
  }
  applyImpulse(impulse, wakeUp) {
    const rawImpulse = VectorOps.intoRaw(impulse);
    this.rawSet.rbApplyImpulse(this.handle, rawImpulse, wakeUp);
    rawImpulse.free();
  }
  applyTorque(torque, wakeUp) {
    const rawTorque = VectorOps.intoRaw(torque);
    this.rawSet.rbApplyTorque(this.handle, rawTorque, wakeUp);
    rawTorque.free();
  }
  applyTorqueImpulse(torqueImpulse, wakeUp) {
    const rawTorqueImpulse = VectorOps.intoRaw(torqueImpulse);
    this.rawSet.rbApplyTorqueImpulse(this.handle, rawTorqueImpulse, wakeUp);
    rawTorqueImpulse.free();
  }
  applyForceAtPoint(force, point, wakeUp) {
    const rawForce = VectorOps.intoRaw(force);
    const rawPoint = VectorOps.intoRaw(point);
    this.rawSet.rbApplyForceAtPoint(this.handle, rawForce, rawPoint, wakeUp);
    rawForce.free();
    rawPoint.free();
  }
  applyImpulseAtPoint(impulse, point, wakeUp) {
    const rawImpulse = VectorOps.intoRaw(impulse);
    const rawPoint = VectorOps.intoRaw(point);
    this.rawSet.rbApplyImpulseAtPoint(this.handle, rawImpulse, rawPoint, wakeUp);
    rawImpulse.free();
    rawPoint.free();
  }
};
var RigidBodyDesc = class {
  constructor(status) {
    this.status = status;
    this.translation = VectorOps.zeros();
    this.rotation = RotationOps.identity();
    this.gravityScale = 1;
    this.linvel = VectorOps.zeros();
    this.mass = 0;
    this.translationsEnabled = true;
    this.centerOfMass = VectorOps.zeros();
    this.angvel = VectorOps.zeros();
    this.principalAngularInertia = VectorOps.zeros();
    this.angularInertiaLocalFrame = RotationOps.identity();
    this.rotationsEnabledX = true;
    this.rotationsEnabledY = true;
    this.rotationsEnabledZ = true;
    this.linearDamping = 0;
    this.angularDamping = 0;
    this.canSleep = true;
    this.ccdEnabled = false;
    this.dominanceGroup = 0;
  }
  static newDynamic() {
    return new RigidBodyDesc(0);
  }
  static newKinematicPositionBased() {
    return new RigidBodyDesc(2);
  }
  static newKinematicVelocityBased() {
    return new RigidBodyDesc(3);
  }
  static newStatic() {
    return new RigidBodyDesc(1);
  }
  setDominanceGroup(group) {
    this.dominanceGroup = group;
    return this;
  }
  setTranslation(x, y, z) {
    if (typeof x != "number" || typeof y != "number" || typeof z != "number")
      throw TypeError("The translation components must be numbers.");
    this.translation = { x, y, z };
    return this;
  }
  setRotation(rot) {
    this.rotation = rot;
    return this;
  }
  setGravityScale(scale) {
    this.gravityScale = scale;
    return this;
  }
  setAdditionalMass(mass) {
    this.mass = mass;
    return this;
  }
  lockTranslations() {
    this.translationsEnabled = false;
    return this;
  }
  setLinvel(x, y, z) {
    if (typeof x != "number" || typeof y != "number" || typeof z != "number")
      throw TypeError("The linvel components must be numbers.");
    this.linvel = { x, y, z };
    return this;
  }
  setAngvel(vel) {
    this.angvel = vel;
    return this;
  }
  setAdditionalMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame) {
    this.mass = mass;
    this.centerOfMass = centerOfMass;
    this.principalAngularInertia = principalAngularInertia;
    this.angularInertiaLocalFrame = angularInertiaLocalFrame;
    return this;
  }
  setAdditionalPrincipalAngularInertia(principalAngularInertia) {
    this.principalAngularInertia = principalAngularInertia;
    return this;
  }
  restrictRotations(rotationsEnabledX, rotationsEnabledY, rotationsEnabledZ) {
    this.rotationsEnabledX = rotationsEnabledX;
    this.rotationsEnabledY = rotationsEnabledY;
    this.rotationsEnabledZ = rotationsEnabledZ;
    return this;
  }
  lockRotations() {
    return this.restrictRotations(false, false, false);
  }
  setLinearDamping(damping) {
    this.linearDamping = damping;
    return this;
  }
  setAngularDamping(damping) {
    this.angularDamping = damping;
    return this;
  }
  setCanSleep(can) {
    this.canSleep = can;
    return this;
  }
  setCcdEnabled(enabled) {
    this.ccdEnabled = enabled;
    return this;
  }
};

// dynamics/rigid_body_set.ts
var RigidBodySet = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawRigidBodySet();
  }
  createRigidBody(desc) {
    let rawTra = VectorOps.intoRaw(desc.translation);
    let rawRot = RotationOps.intoRaw(desc.rotation);
    let rawLv = VectorOps.intoRaw(desc.linvel);
    let rawCom = VectorOps.intoRaw(desc.centerOfMass);
    let rawAv = VectorOps.intoRaw(desc.angvel);
    let rawPrincipalInertia = VectorOps.intoRaw(desc.principalAngularInertia);
    let rawInertiaFrame = RotationOps.intoRaw(desc.angularInertiaLocalFrame);
    let handle = this.raw.createRigidBody(rawTra, rawRot, desc.gravityScale, desc.mass, desc.translationsEnabled, rawCom, rawLv, rawAv, rawPrincipalInertia, rawInertiaFrame, desc.rotationsEnabledX, desc.rotationsEnabledY, desc.rotationsEnabledZ, desc.linearDamping, desc.angularDamping, desc.status, desc.canSleep, desc.ccdEnabled, desc.dominanceGroup);
    rawTra.free();
    rawRot.free();
    rawLv.free();
    rawCom.free();
    rawAv.free();
    rawPrincipalInertia.free();
    rawInertiaFrame.free();
    return handle;
  }
  remove(handle, islands, colliders, joints) {
    this.raw.remove(handle, islands.raw, colliders.raw, joints.raw);
  }
  len() {
    return this.raw.len();
  }
  contains(handle) {
    return this.raw.contains(handle);
  }
  get(handle) {
    if (this.raw.contains(handle)) {
      return new RigidBody(this.raw, handle);
    } else {
      return null;
    }
  }
  forEachRigidBody(f) {
    this.forEachRigidBodyHandle((handle) => {
      f(new RigidBody(this.raw, handle));
    });
  }
  forEachRigidBodyHandle(f) {
    this.raw.forEachRigidBodyHandle(f);
  }
  forEachActiveRigidBody(islands, f) {
    islands.forEachActiveRigidBodyHandle((handle) => {
      f(new RigidBody(this.raw, handle));
    });
  }
};

// dynamics/integration_parameters.ts
var IntegrationParameters = class {
  constructor(raw) {
    this.raw = raw || new RawIntegrationParameters();
  }
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  get dt() {
    return this.raw.dt;
  }
  get erp() {
    return this.raw.erp;
  }
  get jointErp() {
    return this.raw.jointErp;
  }
  get warmstartCoeff() {
    return this.raw.warmstartCoeff;
  }
  get allowedLinearError() {
    return this.raw.allowedLinearError;
  }
  get predictionDistance() {
    return this.raw.predictionDistance;
  }
  get allowedAngularError() {
    return this.raw.allowedAngularError;
  }
  get maxLinearCorrection() {
    return this.raw.maxLinearCorrection;
  }
  get maxAngularCorrection() {
    return this.raw.maxAngularCorrection;
  }
  get maxVelocityIterations() {
    return this.raw.maxVelocityIterations;
  }
  get maxPositionIterations() {
    return this.raw.maxPositionIterations;
  }
  get minIslandSize() {
    return this.raw.minIslandSize;
  }
  get maxCcdSubsteps() {
    return this.raw.maxCcdSubsteps;
  }
  set dt(value) {
    this.raw.dt = value;
  }
  set erp(value) {
    this.raw.erp = value;
  }
  set jointErp(value) {
    this.raw.jointErp = value;
  }
  set warmstartCoeff(value) {
    this.raw.warmstartCoeff = value;
  }
  set allowedLinearError(value) {
    this.raw.allowedLinearError = value;
  }
  set predictionDistance(value) {
    this.raw.predictionDistance = value;
  }
  set allowedAngularError(value) {
    this.raw.allowedAngularError = value;
  }
  set maxLinearCorrection(value) {
    this.raw.maxLinearCorrection = value;
  }
  set maxAngularCorrection(value) {
    this.raw.maxAngularCorrection = value;
  }
  set maxVelocityIterations(value) {
    this.raw.maxVelocityIterations = value;
  }
  set maxPositionIterations(value) {
    this.raw.maxPositionIterations = value;
  }
  set minIslandSize(value) {
    this.raw.minIslandSize = value;
  }
  set maxCcdSubsteps(value) {
    this.raw.maxCcdSubsteps = value;
  }
};

// dynamics/joint.ts
var JointType;
(function(JointType2) {
  JointType2[JointType2["Ball"] = 0] = "Ball";
  JointType2[JointType2["Fixed"] = 1] = "Fixed";
  JointType2[JointType2["Prismatic"] = 2] = "Prismatic";
  JointType2[JointType2["Revolute"] = 3] = "Revolute";
})(JointType || (JointType = {}));
var SpringModel;
(function(SpringModel2) {
  SpringModel2[SpringModel2["Disabled"] = 0] = "Disabled";
  SpringModel2[SpringModel2["VelocityBased"] = 1] = "VelocityBased";
  SpringModel2[SpringModel2["AccelerationBased"] = 2] = "AccelerationBased";
  SpringModel2[SpringModel2["ForceBased"] = 3] = "ForceBased";
})(SpringModel || (SpringModel = {}));
var Joint = class {
  constructor(rawSet, handle) {
    this.rawSet = rawSet;
    this.handle = handle;
  }
  isValid() {
    return this.rawSet.contains(this.handle);
  }
  bodyHandle1() {
    return this.rawSet.jointBodyHandle1(this.handle);
  }
  bodyHandle2() {
    return this.rawSet.jointBodyHandle2(this.handle);
  }
  type() {
    return this.rawSet.jointType(this.handle);
  }
  frameX1() {
    return RotationOps.fromRaw(this.rawSet.jointFrameX1(this.handle));
  }
  frameX2() {
    return RotationOps.fromRaw(this.rawSet.jointFrameX2(this.handle));
  }
  anchor1() {
    return VectorOps.fromRaw(this.rawSet.jointAnchor1(this.handle));
  }
  anchor2() {
    return VectorOps.fromRaw(this.rawSet.jointAnchor2(this.handle));
  }
  axis1() {
    return VectorOps.fromRaw(this.rawSet.jointAxis1(this.handle));
  }
  axis2() {
    return VectorOps.fromRaw(this.rawSet.jointAxis2(this.handle));
  }
};
var UnitJoint = class extends Joint {
  limitsEnabled() {
    return this.rawSet.jointLimitsEnabled(this.handle);
  }
  limitsMin() {
    return this.rawSet.jointLimitsMin(this.handle);
  }
  limitsMax() {
    return this.rawSet.jointLimitsMax(this.handle);
  }
  configureMotorModel(model) {
    this.rawSet.jointConfigureMotorModel(this.handle, model);
  }
  configureMotorVelocity(targetVel, factor) {
    this.rawSet.jointConfigureUnitMotorVelocity(this.handle, targetVel, factor);
  }
  configureMotorPosition(targetPos, stiffness, damping) {
    this.rawSet.jointConfigureUnitMotorPosition(this.handle, targetPos, stiffness, damping);
  }
  configureMotor(targetPos, targetVel, stiffness, damping) {
    this.rawSet.jointConfigureUnitMotor(this.handle, targetPos, targetVel, stiffness, damping);
  }
};
var FixedJoint = class extends Joint {
};
var PrismaticJoint = class extends UnitJoint {
};
var BallJoint = class extends Joint {
  configureMotorModel(model) {
    this.rawSet.jointConfigureMotorModel(this.handle, model);
  }
  configureMotorVelocity(targetVel, factor) {
    this.rawSet.jointConfigureBallMotorVelocity(this.handle, targetVel.x, targetVel.y, targetVel.z, factor);
  }
  configureMotorPosition(targetPos, stiffness, damping) {
    this.rawSet.jointConfigureBallMotorPosition(this.handle, targetPos.w, targetPos.x, targetPos.y, targetPos.z, stiffness, damping);
  }
  configureMotor(targetPos, targetVel, stiffness, damping) {
    this.rawSet.jointConfigureBallMotor(this.handle, targetPos.w, targetPos.x, targetPos.y, targetPos.z, targetVel.x, targetVel.y, targetVel.z, stiffness, damping);
  }
};
var RevoluteJoint = class extends UnitJoint {
};
var JointParams = class {
  constructor() {
  }
  static ball(anchor1, anchor2) {
    let res = new JointParams();
    res.anchor1 = anchor1;
    res.anchor2 = anchor2;
    res.jointType = 0;
    return res;
  }
  static fixed(anchor1, frame1, anchor2, frame2) {
    let res = new JointParams();
    res.anchor1 = anchor1;
    res.anchor2 = anchor2;
    res.frame1 = frame1;
    res.frame2 = frame2;
    res.jointType = 1;
    return res;
  }
  static prismatic(anchor1, axis1, tangent1, anchor2, axis2, tangent2) {
    let res = new JointParams();
    res.anchor1 = anchor1;
    res.axis1 = axis1;
    res.tangent1 = tangent1;
    res.anchor2 = anchor2;
    res.axis2 = axis2;
    res.tangent2 = tangent2;
    res.jointType = 2;
    return res;
  }
  static revolute(anchor1, axis1, anchor2, axis2) {
    let res = new JointParams();
    res.anchor1 = anchor1;
    res.anchor2 = anchor2;
    res.axis1 = axis1;
    res.axis2 = axis2;
    res.jointType = 3;
    return res;
  }
  intoRaw() {
    let rawA1 = VectorOps.intoRaw(this.anchor1);
    let rawA2 = VectorOps.intoRaw(this.anchor2);
    let rawAx1;
    let rawAx2;
    let result;
    let limitsEnabled = false;
    let limitsMin = 0;
    let limitsMax = 0;
    switch (this.jointType) {
      case 0:
        result = RawJointParams.ball(rawA1, rawA2);
        break;
      case 1:
        let rawFra1 = RotationOps.intoRaw(this.frame1);
        let rawFra2 = RotationOps.intoRaw(this.frame2);
        result = RawJointParams.fixed(rawA1, rawFra1, rawA2, rawFra2);
        rawFra1.free();
        rawFra2.free();
        break;
      case 2:
        rawAx1 = VectorOps.intoRaw(this.axis1);
        rawAx2 = VectorOps.intoRaw(this.axis2);
        if (!!this.limitsEnabled) {
          limitsEnabled = true;
          limitsMin = this.limits[0];
          limitsMax = this.limits[1];
        }
        let rawTa1 = VectorOps.intoRaw(this.tangent1);
        let rawTa2 = VectorOps.intoRaw(this.tangent2);
        result = RawJointParams.prismatic(rawA1, rawAx1, rawTa1, rawA2, rawAx2, rawTa2, limitsEnabled, limitsMin, limitsMax);
        rawTa1.free();
        rawTa2.free();
        rawAx1.free();
        rawAx2.free();
        break;
      case 3:
        rawAx1 = VectorOps.intoRaw(this.axis1);
        rawAx2 = VectorOps.intoRaw(this.axis2);
        result = RawJointParams.revolute(rawA1, rawAx1, rawA2, rawAx2);
        rawAx1.free();
        rawAx2.free();
        break;
    }
    rawA1.free();
    rawA2.free();
    return result;
  }
};

// dynamics/joint_set.ts
var JointSet = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawJointSet();
  }
  createJoint(bodies, desc, parent1, parent2) {
    const rawParams = desc.intoRaw();
    const result = this.raw.createJoint(bodies.raw, rawParams, parent1, parent2);
    rawParams.free();
    return result;
  }
  remove(handle, islands, bodies, wake_up) {
    this.raw.remove(handle, islands.raw, bodies.raw, wake_up);
  }
  len() {
    return this.raw.len();
  }
  contains(handle) {
    return this.raw.contains(handle);
  }
  get(handle) {
    if (this.raw.contains(handle)) {
      switch (this.raw.jointType(handle)) {
        case JointType.Ball:
          return new BallJoint(this.raw, handle);
        case JointType.Prismatic:
          return new PrismaticJoint(this.raw, handle);
        case JointType.Fixed:
          return new FixedJoint(this.raw, handle);
        case JointType.Revolute:
          return new RevoluteJoint(this.raw, handle);
      }
    } else {
      return null;
    }
  }
  forEachJoint(f) {
    this.raw.forEachJointHandle((handle) => {
      f(new Joint(this.raw, handle));
    });
  }
  forEachJointHandle(f) {
    this.raw.forEachJointHandle(f);
  }
};

// dynamics/coefficient_combine_rule.ts
var CoefficientCombineRule;
(function(CoefficientCombineRule2) {
  CoefficientCombineRule2[CoefficientCombineRule2["Average"] = 0] = "Average";
  CoefficientCombineRule2[CoefficientCombineRule2["Min"] = 1] = "Min";
  CoefficientCombineRule2[CoefficientCombineRule2["Multiply"] = 2] = "Multiply";
  CoefficientCombineRule2[CoefficientCombineRule2["Max"] = 3] = "Max";
})(CoefficientCombineRule || (CoefficientCombineRule = {}));

// dynamics/ccd_solver.ts
var CCDSolver = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawCCDSolver();
  }
};

// dynamics/island_manager.ts
var IslandManager = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawIslandManager();
  }
  forEachActiveRigidBodyHandle(f) {
    this.raw.forEachActiveRigidBodyHandle(f);
  }
};

// geometry/broad_phase.ts
var BroadPhase = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawBroadPhase();
  }
};

// geometry/narrow_phase.ts
var NarrowPhase = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawNarrowPhase();
    this.tempManifold = new TempContactManifold(null);
  }
  contactsWith(collider1, f) {
    this.raw.contacts_with(collider1, f);
  }
  intersectionsWith(collider1, f) {
    this.raw.intersections_with(collider1, f);
  }
  contactPair(collider1, collider2, f) {
    const rawPair = this.raw.contact_pair(collider1, collider2);
    if (!!rawPair) {
      const flipped = rawPair.collider1() != collider1;
      let i;
      for (i = 0; i < rawPair.numContactManifolds(); ++i) {
        this.tempManifold.raw = rawPair.contactManifold(i);
        if (!!this.tempManifold.raw) {
          f(this.tempManifold, flipped);
        }
        this.tempManifold.free();
      }
      rawPair.free();
    }
  }
  intersectionPair(collider1, collider2) {
    return this.raw.intersection_pair(collider1, collider2);
  }
};
var TempContactManifold = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw;
  }
  normal() {
    return VectorOps.fromRaw(this.raw.normal());
  }
  localNormal1() {
    return VectorOps.fromRaw(this.raw.local_n1());
  }
  localNormal2() {
    return VectorOps.fromRaw(this.raw.local_n2());
  }
  subshape1() {
    return this.raw.subshape1();
  }
  subshape2() {
    return this.raw.subshape2();
  }
  numContacts() {
    return this.raw.num_contacts();
  }
  localContactPoint1(i) {
    return VectorOps.fromRaw(this.raw.contact_local_p1(i));
  }
  localContactPoint2(i) {
    return VectorOps.fromRaw(this.raw.contact_local_p2(i));
  }
  contactDist(i) {
    return this.raw.contact_dist(i);
  }
  contactFid1(i) {
    return this.raw.contact_fid1(i);
  }
  contactFid2(i) {
    return this.raw.contact_fid2(i);
  }
  contactImpulse(i) {
    return this.raw.contact_impulse(i);
  }
  contactTangentImpulseX(i) {
    return this.raw.contact_tangent_impulse_x(i);
  }
  contactTangentImpulseY(i) {
    return this.raw.contact_tangent_impulse_y(i);
  }
  numSolverContacts() {
    return this.raw.num_solver_contacts();
  }
  solverContactPoint(i) {
    return VectorOps.fromRaw(this.raw.solver_contact_point(i));
  }
  solverContactDist(i) {
    return this.raw.solver_contact_dist(i);
  }
  solverContactFriction(i) {
    return this.raw.solver_contact_friction(i);
  }
  solverContactRestitution(i) {
    return this.raw.solver_contact_restitution(i);
  }
  solverContactTangentVelocity(i) {
    return VectorOps.fromRaw(this.raw.solver_contact_tangent_velocity(i));
  }
};

// geometry/shape.ts
var ShapeType;
(function(ShapeType3) {
  ShapeType3[ShapeType3["Ball"] = 0] = "Ball";
  ShapeType3[ShapeType3["Cuboid"] = 1] = "Cuboid";
  ShapeType3[ShapeType3["Capsule"] = 2] = "Capsule";
  ShapeType3[ShapeType3["Segment"] = 3] = "Segment";
  ShapeType3[ShapeType3["Polyline"] = 4] = "Polyline";
  ShapeType3[ShapeType3["Triangle"] = 5] = "Triangle";
  ShapeType3[ShapeType3["TriMesh"] = 6] = "TriMesh";
  ShapeType3[ShapeType3["HeightField"] = 7] = "HeightField";
  ShapeType3[ShapeType3["ConvexPolyhedron"] = 9] = "ConvexPolyhedron";
  ShapeType3[ShapeType3["Cylinder"] = 10] = "Cylinder";
  ShapeType3[ShapeType3["Cone"] = 11] = "Cone";
  ShapeType3[ShapeType3["RoundCuboid"] = 12] = "RoundCuboid";
  ShapeType3[ShapeType3["RoundTriangle"] = 13] = "RoundTriangle";
  ShapeType3[ShapeType3["RoundCylinder"] = 14] = "RoundCylinder";
  ShapeType3[ShapeType3["RoundCone"] = 15] = "RoundCone";
  ShapeType3[ShapeType3["RoundConvexPolyhedron"] = 16] = "RoundConvexPolyhedron";
})(ShapeType || (ShapeType = {}));
var Ball = class {
  constructor(radius) {
    this.radius = radius;
  }
  intoRaw() {
    return RawShape.ball(this.radius);
  }
};
var Cuboid = class {
  constructor(hx, hy, hz) {
    this.halfExtents = VectorOps.new(hx, hy, hz);
  }
  intoRaw() {
    return RawShape.cuboid(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z);
  }
};
var RoundCuboid = class {
  constructor(hx, hy, hz, borderRadius) {
    this.halfExtents = VectorOps.new(hx, hy, hz);
    this.borderRadius = borderRadius;
  }
  intoRaw() {
    return RawShape.roundCuboid(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z, this.borderRadius);
  }
};
var Capsule = class {
  constructor(halfHeight, radius) {
    this.halfHeight = halfHeight;
    this.radius = radius;
  }
  intoRaw() {
    return RawShape.capsule(this.halfHeight, this.radius);
  }
};
var Segment = class {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  intoRaw() {
    let ra = VectorOps.intoRaw(this.a);
    let rb = VectorOps.intoRaw(this.b);
    let result = RawShape.segment(ra, rb);
    ra.free();
    rb.free();
    return result;
  }
};
var Triangle = class {
  constructor(a, b, c) {
    this.a = a;
    this.b = b;
    this.c = c;
  }
  intoRaw() {
    let ra = VectorOps.intoRaw(this.a);
    let rb = VectorOps.intoRaw(this.b);
    let rc = VectorOps.intoRaw(this.c);
    let result = RawShape.triangle(ra, rb, rc);
    ra.free();
    rb.free();
    rc.free();
    return result;
  }
};
var RoundTriangle = class {
  constructor(a, b, c, borderRadius) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.borderRadius = borderRadius;
  }
  intoRaw() {
    let ra = VectorOps.intoRaw(this.a);
    let rb = VectorOps.intoRaw(this.b);
    let rc = VectorOps.intoRaw(this.c);
    let result = RawShape.roundTriangle(ra, rb, rc, this.borderRadius);
    ra.free();
    rb.free();
    rc.free();
    return result;
  }
};
var Polyline = class {
  constructor(vertices, indices) {
    this.vertices = vertices;
    this.indices = !!indices ? indices : new Uint32Array(0);
  }
  intoRaw() {
    return RawShape.polyline(this.vertices, this.indices);
  }
};
var TriMesh = class {
  constructor(vertices, indices) {
    this.vertices = vertices;
    this.indices = indices;
  }
  intoRaw() {
    return RawShape.trimesh(this.vertices, this.indices);
  }
};
var ConvexPolyhedron = class {
  constructor(vertices, indices) {
    this.vertices = vertices;
    this.indices = indices;
  }
  intoRaw() {
    if (!!this.indices) {
      return RawShape.convexMesh(this.vertices, this.indices);
    } else {
      return RawShape.convexHull(this.vertices);
    }
  }
};
var RoundConvexPolyhedron = class {
  constructor(vertices, indices, borderRadius) {
    this.vertices = vertices;
    this.indices = indices;
    this.borderRadius = borderRadius;
  }
  intoRaw() {
    if (!!this.indices) {
      return RawShape.roundConvexMesh(this.vertices, this.indices, this.borderRadius);
    } else {
      return RawShape.roundConvexHull(this.vertices, this.borderRadius);
    }
  }
};
var Heightfield = class {
  constructor(nrows, ncols, heights, scale) {
    this.nrows = nrows;
    this.ncols = ncols;
    this.heights = heights;
    this.scale = scale;
  }
  intoRaw() {
    let rawScale = VectorOps.intoRaw(this.scale);
    let rawShape = RawShape.heightfield(this.nrows, this.ncols, this.heights, rawScale);
    rawScale.free();
    return rawShape;
  }
};
var Cylinder = class {
  constructor(halfHeight, radius) {
    this.halfHeight = halfHeight;
    this.radius = radius;
  }
  intoRaw() {
    return RawShape.cylinder(this.halfHeight, this.radius);
  }
};
var RoundCylinder = class {
  constructor(halfHeight, radius, borderRadius) {
    this.borderRadius = borderRadius;
    this.halfHeight = halfHeight;
    this.radius = radius;
  }
  intoRaw() {
    return RawShape.roundCylinder(this.halfHeight, this.radius, this.borderRadius);
  }
};
var Cone = class {
  constructor(halfHeight, radius) {
    this.halfHeight = halfHeight;
    this.radius = radius;
  }
  intoRaw() {
    return RawShape.cone(this.halfHeight, this.radius);
  }
};
var RoundCone = class {
  constructor(halfHeight, radius, borderRadius) {
    this.halfHeight = halfHeight;
    this.radius = radius;
    this.borderRadius = borderRadius;
  }
  intoRaw() {
    return RawShape.roundCone(this.halfHeight, this.radius, this.borderRadius);
  }
};

// geometry/collider.ts
var ActiveCollisionTypes;
(function(ActiveCollisionTypes2) {
  ActiveCollisionTypes2[ActiveCollisionTypes2["DYNAMIC_DYNAMIC"] = 1] = "DYNAMIC_DYNAMIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["DYNAMIC_KINEMATIC"] = 12] = "DYNAMIC_KINEMATIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["DYNAMIC_STATIC"] = 2] = "DYNAMIC_STATIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["KINEMATIC_KINEMATIC"] = 52224] = "KINEMATIC_KINEMATIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["KINEMATIC_STATIC"] = 8704] = "KINEMATIC_STATIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["STATIC_STATIC"] = 32] = "STATIC_STATIC";
  ActiveCollisionTypes2[ActiveCollisionTypes2["DEFAULT"] = 15] = "DEFAULT";
  ActiveCollisionTypes2[ActiveCollisionTypes2["ALL"] = 60943] = "ALL";
})(ActiveCollisionTypes || (ActiveCollisionTypes = {}));
var Collider = class {
  constructor(rawSet, handle) {
    this.rawSet = rawSet;
    this.handle = handle;
  }
  isValid() {
    return this.rawSet.contains(this.handle);
  }
  translation() {
    return VectorOps.fromRaw(this.rawSet.coTranslation(this.handle));
  }
  rotation() {
    return RotationOps.fromRaw(this.rawSet.coRotation(this.handle));
  }
  isSensor() {
    return this.rawSet.coIsSensor(this.handle);
  }
  setSensor(isSensor) {
    this.rawSet.coSetSensor(this.handle, isSensor);
  }
  setShape(shape) {
    let rawShape = shape.intoRaw();
    this.rawSet.coSetShape(this.handle, rawShape);
    rawShape.free();
  }
  setRestitution(restitution) {
    this.rawSet.coSetRestitution(this.handle, restitution);
  }
  setFriction(friction) {
    this.rawSet.coSetFriction(this.handle, friction);
  }
  frictionCombineRule() {
    return this.rawSet.coFrictionCombineRule(this.handle);
  }
  setFrictionCombineRule(rule) {
    this.rawSet.coSetFrictionCombineRule(this.handle, rule);
  }
  restitutionCombineRule() {
    return this.rawSet.coRestitutionCombineRule(this.handle);
  }
  setRestitutionCombineRule(rule) {
    this.rawSet.coSetRestitutionCombineRule(this.handle, rule);
  }
  setCollisionGroups(groups) {
    this.rawSet.coSetCollisionGroups(this.handle, groups);
  }
  setSolverGroups(groups) {
    this.rawSet.coSetSolverGroups(this.handle, groups);
  }
  activeHooks() {
    this.rawSet.coActiveHooks(this.handle);
  }
  setActiveHooks(activeHooks) {
    this.rawSet.coSetActiveHooks(this.handle, activeHooks);
  }
  activeEvents() {
    return this.rawSet.coActiveEvents(this.handle);
  }
  setActiveEvents(activeEvents) {
    this.rawSet.coSetActiveEvents(this.handle, activeEvents);
  }
  activeCollisionTypes() {
    return this.rawSet.coActiveCollisionTypes(this.handle);
  }
  setActiveCollisionTypes(activeCollisionTypes) {
    this.rawSet.coSetActiveCollisionTypes(this.handle, activeCollisionTypes);
  }
  setTranslation(tra) {
    this.rawSet.coSetTranslation(this.handle, tra.x, tra.y, tra.z);
  }
  setTranslationWrtParent(tra) {
    this.rawSet.coSetTranslationWrtParent(this.handle, tra.x, tra.y, tra.z);
  }
  setRotation(rot) {
    this.rawSet.coSetRotation(this.handle, rot.x, rot.y, rot.z, rot.w);
  }
  setRotationWrtParent(rot) {
    this.rawSet.coSetRotationWrtParent(this.handle, rot.x, rot.y, rot.z, rot.w);
  }
  shapeType() {
    return this.rawSet.coShapeType(this.handle);
  }
  halfExtents() {
    return VectorOps.fromRaw(this.rawSet.coHalfExtents(this.handle));
  }
  radius() {
    return this.rawSet.coRadius(this.handle);
  }
  roundRadius() {
    return this.rawSet.coRoundRadius(this.handle);
  }
  halfHeight() {
    return this.rawSet.coHalfHeight(this.handle);
  }
  vertices() {
    return this.rawSet.coVertices(this.handle);
  }
  indices() {
    return this.rawSet.coIndices(this.handle);
  }
  heightfieldHeights() {
    return this.rawSet.coHeightfieldHeights(this.handle);
  }
  heightfieldScale() {
    let scale = this.rawSet.coHeightfieldScale(this.handle);
    return VectorOps.fromRaw(scale);
  }
  heightfieldNRows() {
    return this.rawSet.coHeightfieldNRows(this.handle);
  }
  heightfieldNCols() {
    return this.rawSet.coHeightfieldNCols(this.handle);
  }
  parent() {
    return this.rawSet.coParent(this.handle);
  }
  friction() {
    return this.rawSet.coFriction(this.handle);
  }
  density() {
    return this.rawSet.coDensity(this.handle);
  }
  collisionGroups() {
    return this.rawSet.coCollisionGroups(this.handle);
  }
  solverGroups() {
    return this.rawSet.coSolverGroups(this.handle);
  }
};
var ColliderDesc = class {
  constructor(shape) {
    this.shape = shape;
    this.useMassProps = false;
    this.density = 1;
    this.friction = 0.5;
    this.restitution = 0;
    this.rotation = RotationOps.identity();
    this.translation = VectorOps.zeros();
    this.isSensor = false;
    this.collisionGroups = 4294967295;
    this.solverGroups = 4294967295;
    this.frictionCombineRule = CoefficientCombineRule.Average;
    this.restitutionCombineRule = CoefficientCombineRule.Average;
    this.activeCollisionTypes = 15;
    this.activeEvents = 0;
    this.activeHooks = 0;
    this.mass = 0;
    this.centerOfMass = VectorOps.zeros();
    this.principalAngularInertia = VectorOps.zeros();
    this.angularInertiaLocalFrame = RotationOps.identity();
  }
  static ball(radius) {
    const shape = new Ball(radius);
    return new ColliderDesc(shape);
  }
  static capsule(halfHeight, radius) {
    const shape = new Capsule(halfHeight, radius);
    return new ColliderDesc(shape);
  }
  static segment(a, b) {
    const shape = new Segment(a, b);
    return new ColliderDesc(shape);
  }
  static triangle(a, b, c) {
    const shape = new Triangle(a, b, c);
    return new ColliderDesc(shape);
  }
  static roundTriangle(a, b, c, borderRadius) {
    const shape = new RoundTriangle(a, b, c, borderRadius);
    return new ColliderDesc(shape);
  }
  static polyline(vertices, indices) {
    const shape = new Polyline(vertices, indices);
    return new ColliderDesc(shape);
  }
  static trimesh(vertices, indices) {
    const shape = new TriMesh(vertices, indices);
    return new ColliderDesc(shape);
  }
  static cuboid(hx, hy, hz) {
    const shape = new Cuboid(hx, hy, hz);
    return new ColliderDesc(shape);
  }
  static roundCuboid(hx, hy, hz, borderRadius) {
    const shape = new RoundCuboid(hx, hy, hz, borderRadius);
    return new ColliderDesc(shape);
  }
  static heightfield(nrows, ncols, heights, scale) {
    const shape = new Heightfield(nrows, ncols, heights, scale);
    return new ColliderDesc(shape);
  }
  static cylinder(halfHeight, radius) {
    const shape = new Cylinder(halfHeight, radius);
    return new ColliderDesc(shape);
  }
  static roundCylinder(halfHeight, radius, borderRadius) {
    const shape = new RoundCylinder(halfHeight, radius, borderRadius);
    return new ColliderDesc(shape);
  }
  static cone(halfHeight, radius) {
    const shape = new Cone(halfHeight, radius);
    return new ColliderDesc(shape);
  }
  static roundCone(halfHeight, radius, borderRadius) {
    const shape = new RoundCone(halfHeight, radius, borderRadius);
    return new ColliderDesc(shape);
  }
  static convexHull(points) {
    const shape = new ConvexPolyhedron(points, null);
    return new ColliderDesc(shape);
  }
  static convexMesh(vertices, indices) {
    const shape = new ConvexPolyhedron(vertices, indices);
    return new ColliderDesc(shape);
  }
  static roundConvexHull(points, borderRadius) {
    const shape = new RoundConvexPolyhedron(points, null, borderRadius);
    return new ColliderDesc(shape);
  }
  static roundConvexMesh(vertices, indices, borderRadius) {
    const shape = new RoundConvexPolyhedron(vertices, indices, borderRadius);
    return new ColliderDesc(shape);
  }
  setTranslation(x, y, z) {
    if (typeof x != "number" || typeof y != "number" || typeof z != "number")
      throw TypeError("The translation components must be numbers.");
    this.translation = { x, y, z };
    return this;
  }
  setRotation(rot) {
    this.rotation = rot;
    return this;
  }
  setSensor(is) {
    this.isSensor = is;
    return this;
  }
  setDensity(density) {
    this.useMassProps = false;
    this.density = density;
    return this;
  }
  setMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame) {
    this.useMassProps = true;
    this.mass = mass;
    this.centerOfMass = centerOfMass;
    this.principalAngularInertia = principalAngularInertia;
    this.angularInertiaLocalFrame = angularInertiaLocalFrame;
    return this;
  }
  setRestitution(restitution) {
    this.restitution = restitution;
    return this;
  }
  setFriction(friction) {
    this.friction = friction;
    return this;
  }
  setFrictionCombineRule(rule) {
    this.frictionCombineRule = rule;
    return this;
  }
  setRestitutionCombineRule(rule) {
    this.restitutionCombineRule = rule;
    return this;
  }
  setCollisionGroups(groups) {
    this.collisionGroups = groups;
    return this;
  }
  setSolverGroups(groups) {
    this.solverGroups = groups;
    return this;
  }
  setActiveHooks(activeHooks) {
    this.activeHooks = activeHooks;
    return this;
  }
  setActiveEvents(activeEvents) {
    this.activeEvents = activeEvents;
    return this;
  }
  setActiveCollisionTypes(activeCollisionTypes) {
    this.activeCollisionTypes = activeCollisionTypes;
    return this;
  }
};

// geometry/collider_set.ts
var ColliderSet = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawColliderSet();
  }
  createCollider(bodies, desc, parentHandle) {
    let hasParent = parentHandle != void 0 && parentHandle != null;
    if (hasParent && isNaN(parentHandle))
      throw Error("Cannot create a collider with a parent rigid-body handle that is not a number.");
    let rawShape = desc.shape.intoRaw();
    let rawTra = VectorOps.intoRaw(desc.translation);
    let rawRot = RotationOps.intoRaw(desc.rotation);
    let rawCom = VectorOps.intoRaw(desc.centerOfMass);
    let rawPrincipalInertia = VectorOps.intoRaw(desc.principalAngularInertia);
    let rawInertiaFrame = RotationOps.intoRaw(desc.angularInertiaLocalFrame);
    let handle = this.raw.createCollider(rawShape, rawTra, rawRot, desc.useMassProps, desc.mass, rawCom, rawPrincipalInertia, rawInertiaFrame, desc.density, desc.friction, desc.restitution, desc.frictionCombineRule, desc.restitutionCombineRule, desc.isSensor, desc.collisionGroups, desc.solverGroups, desc.activeCollisionTypes, desc.activeHooks, desc.activeEvents, hasParent, hasParent ? parentHandle : 0, bodies.raw);
    rawShape.free();
    rawTra.free();
    rawRot.free();
    rawCom.free();
    rawPrincipalInertia.free();
    rawInertiaFrame.free();
    return handle;
  }
  remove(handle, islands, bodies, wakeUp) {
    this.raw.remove(handle, islands.raw, bodies.raw, wakeUp);
  }
  get(handle) {
    if (this.raw.contains(handle)) {
      return new Collider(this.raw, handle);
    } else {
      return null;
    }
  }
  len() {
    return this.raw.len();
  }
  contains(handle) {
    return this.raw.contains(handle);
  }
  forEachCollider(f) {
    this.forEachColliderHandle((handle) => {
      f(new Collider(this.raw, handle));
    });
  }
  forEachColliderHandle(f) {
    this.raw.forEachColliderHandle(f);
  }
};

// geometry/ray.ts
var Ray = class {
  constructor(origin, dir) {
    this.origin = origin;
    this.dir = dir;
  }
  pointAt(t) {
    return {
      x: this.origin.x + this.dir.x * t,
      y: this.origin.y + this.dir.y * t,
      z: this.origin.z + this.dir.z * t
    };
  }
};
var RayColliderIntersection = class {
  constructor(colliderHandle, toi, normal) {
    this.colliderHandle = colliderHandle;
    this.toi = toi;
    this.normal = normal;
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    const result = new RayColliderIntersection(raw.colliderHandle(), raw.toi(), VectorOps.fromRaw(raw.normal()));
    raw.free();
    return result;
  }
};
var RayColliderToi = class {
  constructor(colliderHandle, toi) {
    this.colliderHandle = colliderHandle;
    this.toi = toi;
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    const result = new RayColliderToi(raw.colliderHandle(), raw.toi());
    raw.free();
    return result;
  }
};

// geometry/point.ts
var PointColliderProjection = class {
  constructor(colliderHandle, point, isInside) {
    this.colliderHandle = colliderHandle;
    this.point = point;
    this.isInside = isInside;
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    const result = new PointColliderProjection(raw.colliderHandle(), VectorOps.fromRaw(raw.point()), raw.isInside());
    raw.free();
    return result;
  }
};

// geometry/toi.ts
var ShapeColliderTOI = class {
  constructor(colliderHandle, toi, witness1, witness2, normal1, normal2) {
    this.colliderHandle = colliderHandle;
    this.toi = toi;
    this.witness1 = witness1;
    this.witness2 = witness2;
    this.normal1 = normal1;
    this.normal2 = normal2;
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    const result = new ShapeColliderTOI(raw.colliderHandle(), raw.toi(), VectorOps.fromRaw(raw.witness1()), VectorOps.fromRaw(raw.witness2()), VectorOps.fromRaw(raw.normal1()), VectorOps.fromRaw(raw.normal2()));
    raw.free();
    return result;
  }
};

// pipeline/physics_pipeline.ts
var PhysicsPipeline = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawPhysicsPipeline();
  }
  step(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, joints, ccdSolver, eventQueue, hooks) {
    let rawG = VectorOps.intoRaw(gravity);
    if (!!eventQueue) {
      this.raw.stepWithEvents(rawG, integrationParameters.raw, islands.raw, broadPhase.raw, narrowPhase.raw, bodies.raw, colliders.raw, joints.raw, ccdSolver.raw, eventQueue.raw, hooks, !!hooks ? hooks.filterContactPair : null, !!hooks ? hooks.filterIntersectionPair : null);
    } else {
      this.raw.step(rawG, integrationParameters.raw, islands.raw, broadPhase.raw, narrowPhase.raw, bodies.raw, colliders.raw, joints.raw, ccdSolver.raw);
    }
    rawG.free();
  }
};

// pipeline/query_pipeline.ts
var QueryPipeline = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawQueryPipeline();
  }
  update(islands, bodies, colliders) {
    this.raw.update(islands.raw, bodies.raw, colliders.raw);
  }
  castRay(colliders, ray, maxToi, solid, groups) {
    let rawOrig = VectorOps.intoRaw(ray.origin);
    let rawDir = VectorOps.intoRaw(ray.dir);
    let result = RayColliderToi.fromRaw(this.raw.castRay(colliders.raw, rawOrig, rawDir, maxToi, solid, groups));
    rawOrig.free();
    rawDir.free();
    return result;
  }
  castRayAndGetNormal(colliders, ray, maxToi, solid, groups) {
    let rawOrig = VectorOps.intoRaw(ray.origin);
    let rawDir = VectorOps.intoRaw(ray.dir);
    let result = RayColliderIntersection.fromRaw(this.raw.castRayAndGetNormal(colliders.raw, rawOrig, rawDir, maxToi, solid, groups));
    rawOrig.free();
    rawDir.free();
    return result;
  }
  intersectionsWithRay(colliders, ray, maxToi, solid, groups, callback) {
    let rawOrig = VectorOps.intoRaw(ray.origin);
    let rawDir = VectorOps.intoRaw(ray.dir);
    let rawCallback = (rawInter) => {
      return callback(RayColliderIntersection.fromRaw(rawInter));
    };
    this.raw.intersectionsWithRay(colliders.raw, rawOrig, rawDir, maxToi, solid, groups, rawCallback);
    rawOrig.free();
    rawDir.free();
  }
  intersectionWithShape(colliders, shapePos, shapeRot, shape, groups) {
    let rawPos = VectorOps.intoRaw(shapePos);
    let rawRot = RotationOps.intoRaw(shapeRot);
    let rawShape = shape.intoRaw();
    let result = this.raw.intersectionWithShape(colliders.raw, rawPos, rawRot, rawShape, groups);
    rawPos.free();
    rawRot.free();
    rawShape.free();
    return result;
  }
  projectPoint(colliders, point, solid, groups) {
    let rawPoint = VectorOps.intoRaw(point);
    let result = PointColliderProjection.fromRaw(this.raw.projectPoint(colliders.raw, rawPoint, solid, groups));
    rawPoint.free();
    return result;
  }
  intersectionsWithPoint(colliders, point, groups, callback) {
    let rawPoint = VectorOps.intoRaw(point);
    this.raw.intersectionsWithPoint(colliders.raw, rawPoint, groups, callback);
    rawPoint.free();
  }
  castShape(colliders, shapePos, shapeRot, shapeVel, shape, maxToi, groups) {
    let rawPos = VectorOps.intoRaw(shapePos);
    let rawRot = RotationOps.intoRaw(shapeRot);
    let rawVel = VectorOps.intoRaw(shapeVel);
    let rawShape = shape.intoRaw();
    let result = ShapeColliderTOI.fromRaw(this.raw.castShape(colliders.raw, rawPos, rawRot, rawVel, rawShape, maxToi, groups));
    rawPos.free();
    rawRot.free();
    rawVel.free();
    rawShape.free();
    return result;
  }
  intersectionsWithShape(colliders, shapePos, shapeRot, shape, groups, callback) {
    let rawPos = VectorOps.intoRaw(shapePos);
    let rawRot = RotationOps.intoRaw(shapeRot);
    let rawShape = shape.intoRaw();
    this.raw.intersectionsWithShape(colliders.raw, rawPos, rawRot, rawShape, groups, callback);
    rawPos.free();
    rawRot.free();
    rawShape.free();
  }
  collidersWithAabbIntersectingAabb(aabbCenter, aabbHalfExtents, callback) {
    let rawCenter = VectorOps.intoRaw(aabbCenter);
    let rawHalfExtents = VectorOps.intoRaw(aabbHalfExtents);
    this.raw.collidersWithAabbIntersectingAabb(rawCenter, rawHalfExtents, callback);
    rawCenter.free();
    rawHalfExtents.free();
  }
};

// pipeline/serialization_pipeline.ts
var SerializationPipeline = class {
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  constructor(raw) {
    this.raw = raw || new RawSerializationPipeline();
  }
  serializeAll(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, joints) {
    let rawGra = VectorOps.intoRaw(gravity);
    const res = this.raw.serializeAll(rawGra, integrationParameters.raw, islands.raw, broadPhase.raw, narrowPhase.raw, bodies.raw, colliders.raw, joints.raw);
    rawGra.free();
    return res;
  }
  deserializeAll(data) {
    return World.fromRaw(this.raw.deserializeAll(data));
  }
};

// pipeline/world.ts
var World = class {
  free() {
    this.integrationParameters.free();
    this.islands.free();
    this.broadPhase.free();
    this.narrowPhase.free();
    this.bodies.free();
    this.colliders.free();
    this.joints.free();
    this.ccdSolver.free();
    this.queryPipeline.free();
    this.physicsPipeline.free();
    this.serializationPipeline.free();
    this.integrationParameters = void 0;
    this.islands = void 0;
    this.broadPhase = void 0;
    this.narrowPhase = void 0;
    this.bodies = void 0;
    this.colliders = void 0;
    this.ccdSolver = void 0;
    this.joints = void 0;
    this.queryPipeline = void 0;
    this.physicsPipeline = void 0;
    this.serializationPipeline = void 0;
  }
  constructor(gravity, rawIntegrationParameters, rawIslands, rawBroadPhase, rawNarrowPhase, rawBodies, rawColliders, rawJoints, rawCCDSolver, rawQueryPipeline, rawPhysicsPipeline, rawSerializationPipeline) {
    this.gravity = gravity;
    this.integrationParameters = new IntegrationParameters(rawIntegrationParameters);
    this.islands = new IslandManager(rawIslands);
    this.broadPhase = new BroadPhase(rawBroadPhase);
    this.narrowPhase = new NarrowPhase(rawNarrowPhase);
    this.bodies = new RigidBodySet(rawBodies);
    this.colliders = new ColliderSet(rawColliders);
    this.joints = new JointSet(rawJoints);
    this.ccdSolver = new CCDSolver(rawCCDSolver);
    this.queryPipeline = new QueryPipeline(rawQueryPipeline);
    this.physicsPipeline = new PhysicsPipeline(rawPhysicsPipeline);
    this.serializationPipeline = new SerializationPipeline(rawSerializationPipeline);
  }
  static fromRaw(raw) {
    if (!raw)
      return null;
    return new World(VectorOps.fromRaw(raw.takeGravity()), raw.takeIntegrationParameters(), raw.takeIslandManager(), raw.takeBroadPhase(), raw.takeNarrowPhase(), raw.takeBodies(), raw.takeColliders(), raw.takeJoints());
  }
  takeSnapshot() {
    return this.serializationPipeline.serializeAll(this.gravity, this.integrationParameters, this.islands, this.broadPhase, this.narrowPhase, this.bodies, this.colliders, this.joints);
  }
  static restoreSnapshot(data) {
    let deser = new SerializationPipeline();
    return deser.deserializeAll(data);
  }
  step(eventQueue, hooks) {
    this.physicsPipeline.step(this.gravity, this.integrationParameters, this.islands, this.broadPhase, this.narrowPhase, this.bodies, this.colliders, this.joints, this.ccdSolver, eventQueue, hooks);
    this.queryPipeline.update(this.islands, this.bodies, this.colliders);
  }
  get timestep() {
    return this.integrationParameters.dt;
  }
  set timestep(dt) {
    this.integrationParameters.dt = dt;
  }
  get maxVelocityIterations() {
    return this.integrationParameters.maxVelocityIterations;
  }
  set maxVelocityIterations(niter) {
    this.integrationParameters.maxVelocityIterations = niter;
  }
  get maxPositionIterations() {
    return this.integrationParameters.maxPositionIterations;
  }
  set maxPositionIterations(niter) {
    this.integrationParameters.maxPositionIterations = niter;
  }
  createRigidBody(body) {
    return this.bodies.get(this.bodies.createRigidBody(body));
  }
  createCollider(desc, parentHandle) {
    return this.colliders.get(this.colliders.createCollider(this.bodies, desc, parentHandle));
  }
  createJoint(params, parent1, parent2) {
    return this.joints.get(this.joints.createJoint(this.bodies, params, parent1.handle, parent2.handle));
  }
  getRigidBody(handle) {
    return this.bodies.get(handle);
  }
  getCollider(handle) {
    return this.colliders.get(handle);
  }
  getJoint(handle) {
    return this.joints.get(handle);
  }
  removeRigidBody(body) {
    this.bodies.remove(body.handle, this.islands, this.colliders, this.joints);
  }
  removeCollider(collider, wakeUp) {
    this.colliders.remove(collider.handle, this.islands, this.bodies, wakeUp);
  }
  removeJoint(joint, wakeUp) {
    this.joints.remove(joint.handle, this.islands, this.bodies, wakeUp);
  }
  forEachCollider(f) {
    this.colliders.forEachCollider(f);
  }
  forEachColliderHandle(f) {
    this.colliders.forEachColliderHandle(f);
  }
  forEachRigidBody(f) {
    this.bodies.forEachRigidBody(f);
  }
  forEachRigidBodyHandle(f) {
    this.bodies.forEachRigidBodyHandle(f);
  }
  forEachActiveRigidBody(f) {
    this.bodies.forEachActiveRigidBody(this.islands, f);
  }
  forEachActiveRigidBodyHandle(f) {
    this.islands.forEachActiveRigidBodyHandle(f);
  }
  castRay(ray, maxToi, solid, groups) {
    return this.queryPipeline.castRay(this.colliders, ray, maxToi, solid, groups);
  }
  castRayAndGetNormal(ray, maxToi, solid, groups) {
    return this.queryPipeline.castRayAndGetNormal(this.colliders, ray, maxToi, solid, groups);
  }
  intersectionsWithRay(ray, maxToi, solid, groups, callback) {
    this.queryPipeline.intersectionsWithRay(this.colliders, ray, maxToi, solid, groups, callback);
  }
  intersectionWithShape(shapePos, shapeRot, shape, groups) {
    return this.queryPipeline.intersectionWithShape(this.colliders, shapePos, shapeRot, shape, groups);
  }
  projectPoint(point, solid, groups) {
    return this.queryPipeline.projectPoint(this.colliders, point, solid, groups);
  }
  intersectionsWithPoint(point, groups, callback) {
    this.queryPipeline.intersectionsWithPoint(this.colliders, point, groups, callback);
  }
  castShape(shapePos, shapeRot, shapeVel, shape, maxToi, groups) {
    return this.queryPipeline.castShape(this.colliders, shapePos, shapeRot, shapeVel, shape, maxToi, groups);
  }
  intersectionsWithShape(shapePos, shapeRot, shape, groups, callback) {
    this.queryPipeline.intersectionsWithShape(this.colliders, shapePos, shapeRot, shape, groups, callback);
  }
  collidersWithAabbIntersectingAabb(aabbCenter, aabbHalfExtents, callback) {
    this.queryPipeline.collidersWithAabbIntersectingAabb(aabbCenter, aabbHalfExtents, callback);
  }
  contactsWith(collider1, f) {
    this.narrowPhase.contactsWith(collider1, f);
  }
  intersectionsWith(collider1, f) {
    this.narrowPhase.intersectionsWith(collider1, f);
  }
  contactPair(collider1, collider2, f) {
    this.narrowPhase.contactPair(collider1, collider2, f);
  }
  intersectionPair(collider1, collider2) {
    return this.narrowPhase.intersectionPair(collider1, collider2);
  }
};

// pipeline/event_queue.ts
var ActiveEvents;
(function(ActiveEvents2) {
  ActiveEvents2[ActiveEvents2["INTERSECTION_EVENTS"] = 1] = "INTERSECTION_EVENTS";
  ActiveEvents2[ActiveEvents2["CONTACT_EVENTS"] = 2] = "CONTACT_EVENTS";
})(ActiveEvents || (ActiveEvents = {}));
var EventQueue = class {
  constructor(autoDrain, raw) {
    this.raw = raw || new RawEventQueue(autoDrain);
  }
  free() {
    this.raw.free();
    this.raw = void 0;
  }
  drainContactEvents(f) {
    this.raw.drainContactEvents(f);
  }
  drainIntersectionEvents(f) {
    this.raw.drainIntersectionEvents(f);
  }
  clear() {
    this.raw.clear();
  }
};

// pipeline/physics_hooks.ts
var ActiveHooks;
(function(ActiveHooks2) {
  ActiveHooks2[ActiveHooks2["FILTER_CONTACT_PAIRS"] = 1] = "FILTER_CONTACT_PAIRS";
  ActiveHooks2[ActiveHooks2["FILTER_INTERSECTION_PAIRS"] = 2] = "FILTER_INTERSECTION_PAIRS";
})(ActiveHooks || (ActiveHooks = {}));
var SolverFlags;
(function(SolverFlags2) {
  SolverFlags2[SolverFlags2["EMPTY"] = 0] = "EMPTY";
  SolverFlags2[SolverFlags2["COMPUTE_IMPULSE"] = 1] = "COMPUTE_IMPULSE";
})(SolverFlags || (SolverFlags = {}));

// rapier.ts
function version3() {
  return version2();
}
export {
  ActiveCollisionTypes,
  ActiveEvents,
  ActiveHooks,
  Ball,
  BallJoint,
  BroadPhase,
  CCDSolver,
  Capsule,
  CoefficientCombineRule,
  Collider,
  ColliderDesc,
  ColliderSet,
  Cone,
  ConvexPolyhedron,
  Cuboid,
  Cylinder,
  EventQueue,
  FixedJoint,
  Heightfield,
  IntegrationParameters,
  IslandManager,
  Joint,
  JointParams,
  JointSet,
  JointType,
  NarrowPhase,
  PhysicsPipeline,
  PointColliderProjection,
  Polyline,
  PrismaticJoint,
  Quaternion,
  Ray,
  RayColliderIntersection,
  RayColliderToi,
  RevoluteJoint,
  RigidBody,
  RigidBodyDesc,
  RigidBodySet,
  RigidBodyType,
  RotationOps,
  RoundCone,
  RoundConvexPolyhedron,
  RoundCuboid,
  RoundCylinder,
  RoundTriangle,
  Segment,
  SerializationPipeline,
  ShapeColliderTOI,
  ShapeType,
  SolverFlags,
  SpringModel,
  TempContactManifold,
  TriMesh,
  Triangle,
  UnitJoint,
  Vector3,
  VectorOps,
  World,
  version3 as version
};
