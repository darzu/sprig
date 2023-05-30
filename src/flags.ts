// NOTE: this file is not allowed to import anything! b/c it can be included anywhere

// General
export const RUN_UNIT_TESTS = false;
export const VERBOSE_LOG = false;
export const DBG_ASSERT = true;

// Network
export const DONT_SMOOTH_WORLD_FRAME = true; // TODO(@darzu): PERF HACK for single player
export const ENABLE_NET = false; // TODO(@darzu): was for LD52

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

// ECS
export const DBG_INIT = false;
export const WARN_DEAD_CLEANUP = false;
export const DBG_SYSTEM_ORDER = false;

// Input
export const DEBUG_INPUTS = false;

// Vectors
export const PERF_DBG_F32S = false;
export const PERF_DBG_F32S_BLAME = false;
export const PERF_DBG_F32S_TEMP_BLAME = false;

// Physics
export const DBG_PHYSICS_AABBS = false;
