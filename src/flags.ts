// NOTE: this file is not allowed to import anything! b/c it can be included anywhere

// General
export const RUN_UNIT_TESTS = false;
export const VERBOSE_LOG = false;
export const DBG_ASSERT = true;

// Network
export const DONT_SMOOTH_WORLD_FRAME = true; // TODO(@darzu): PERF HACK for single player
export const ENABLE_NET = true;
export const VERBOSE_NET_LOG = false;

// Ocean
export const DISABLE_GERSTNER = false;

// Render
export const VERBOSE_MESH_POOL_STATS = false;
export const ASSET_LOG_VERT_CHANGES = false;
export const PERF_DBG_GPU = false;
export const PERF_DBG_GPU_BLAME = false;
export const PERF_DBG_EM = false;

// Audio
export const ENABLE_AUDIO = true;

// Asset
export const DBG_FANG_SHIP = false;
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
// prints when 'PositionDef' on '10017' changes after a system call, init fn, or entity promise
// TODO(@darzu): GENERALIZE THIS! for other entities and components
export const DBG_ENITITY_10017_POSITION_CHANGES = true;

// Input
export const DEBUG_INPUTS = false;

// Vectors
export const PERF_DBG_F32S = false;
export const PERF_DBG_F32S_BLAME = false;
export const PERF_DBG_F32S_TEMP_BLAME = false;

// Physics
export const DBG_PHYSICS_AABBS = false;
