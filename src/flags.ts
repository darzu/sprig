// NOTE: this file is not allowed to import anything! b/c it can be included anywhere

// GENERAL
export const RUN_UNIT_TESTS = false;
export const VERBOSE_LOG = false;
export const DBG_ASSERT = true;

// NETWORK
export const DONT_SMOOTH_WORLD_FRAME = true; // TODO(@darzu): PERF HACK for single player
export const ENABLE_NET = true; // TODO(@darzu): Move out of global flags, need this enabled per-game
export const VERBOSE_NET_LOG = false;

// OCEAN
export const DISABLE_GERSTNER = false;

// RENDER
export const VERBOSE_MESH_POOL_STATS = false;
export const ASSET_LOG_VERT_CHANGES = false;
export const PERF_DBG_GPU = false;
export const PERF_DBG_REBUNDLE = true;
// tries to track who's allocating GPU resources
export const PERF_DBG_GPU_BLAME = false;
export const LOG_WEBGPU_AVAILABLE_FEATURES = true;

// AUDIO
export const ENABLE_AUDIO = true;

// ASSET
export const DBG_FANG_SHIP = false;
// does a deep scan to look for temp vecs/mats/quats inside meshes
export const DBG_CHECK_FOR_TMPS_IN_XY = false;

// ECS
// prints when a lazy init fn is forced to run and the cause (resource promise,
//  other init fn, or system)
export const DBG_INIT_CAUSATION = false;
// prints each time an init fn progresses from lazy->eager->started->finished
export const DBG_VERBOSE_INIT_SEQ = false;
// prints the callsites of entity / resource promises.
export const DBG_VERBOSE_ENTITY_PROMISE_CALLSITES = false;
// prints the callsites of init functions
export const DBG_VERBOSE_INIT_CALLSITES = false;
// prints a warning if an entity with Dead isn't 'processed' by POST_GAME_WORLD phase
export const WARN_DEAD_CLEANUP = false;
// prints out all systems in order in their phases, whether they are active/deactive
//    and reprints that every time new systems are added.
export const DBG_SYSTEM_ORDER = false;

// INPUT
// prints out key codes for each key pressed (first time)
export const DEBUG_INPUTS = false;

// VECTORS
// tracks quantity of vec3s, mat4s, etc.
export const PERF_DBG_F32S = false;
// tracks who's creating vec3s, mat4s, etc.
export const PERF_DBG_F32S_BLAME = false;
// tracks who's using tmps (doesn't account for tmpStack's)
export const PERF_DBG_F32S_TEMP_BLAME = false;
// checks to make sure uses of tmpStack and .pop() are matched; incurs some bookkeeping overhead
export const DBG_TMP_STACK_MATCH = false;
// tracks if tmp vecs are being leaked. expensive? Proxy's every .tmp()
export const DBG_TMP_LEAK = false;

// PHYSICS
export const DBG_PHYSICS_AABBS = false;
