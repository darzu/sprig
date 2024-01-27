import { EM } from "../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";

// const MAX_POINT_LIGHTS = 1;
const MAX_POINT_LIGHTS = 3;

export const PointLightStruct = createCyStruct(
  {
    // TODO(@darzu): 1 per cascade; better way to do this?
    viewProjAll: "mat4x4<f32>",
    viewProj0: "mat4x4<f32>",
    viewProj1: "mat4x4<f32>",
    position: "vec3<f32>",
    ambient: "vec3<f32>",
    diffuse: "vec3<f32>",
    specular: "vec3<f32>",

    constant: "f32",
    linear: "f32",
    quadratic: "f32",

    // TODO(@darzu): for cascades, need better generalization
    depth0: "f32",
    depth1: "f32",
  },
  // TODO(@darzu): HACK:
  { isUniform: true, hackArray: true }
);

export type PointLightTS = CyToTS<typeof PointLightStruct.desc>;

function createDefaultPointLight(): PointLightTS {
  return {
    viewProjAll: mat4.create(),
    viewProj0: mat4.create(),
    viewProj1: mat4.create(),
    position: V3.mk(),
    ambient: V3.mk(),
    diffuse: V3.mk(),
    specular: V3.mk(),
    constant: 1.0,
    linear: 0.0,
    quadratic: 0.0,
    depth0: 0.0,
    depth1: 0.0,
  };
}

export const PointLightDef = EM.defineComponent(
  "pointLight",
  createDefaultPointLight,
  // TODO(@darzu): PERF. really we should copy the vectors and use vec3.inputT, ugh
  (p, n?: Partial<PointLightTS>) => (n ? Object.assign(p, n) : p)
);

export const pointLightsPtr = CY.createArray("pointLight", {
  struct: PointLightStruct,
  init: MAX_POINT_LIGHTS,
  forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});
