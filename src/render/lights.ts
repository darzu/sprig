import { EM } from "../entity-manager.js";
import { vec3, mat4 } from "../gl-matrix.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";

const MAX_POINT_LIGHTS = 12;

export const PointLightStruct = createCyStruct(
  {
    viewProj: "mat4x4<f32>",
    position: "vec3<f32>",
    ambient: "vec3<f32>",
    diffuse: "vec3<f32>",
    specular: "vec3<f32>",

    constant: "f32",
    linear: "f32",
    quadratic: "f32",
  },
  { isUniform: true, hackArray: true }
);

export type PointLightTS = CyToTS<typeof PointLightStruct.desc>;

function createDefaultPointLight(): Omit<PointLightTS, "position"> {
  return {
    viewProj: mat4.create(),
    ambient: vec3.create(),
    diffuse: vec3.create(),
    specular: vec3.create(),
    constant: 1.0,
    linear: 0.0,
    quadratic: 0.0,
  };
}

export const PointLightDef = EM.defineComponent(
  "pointLight",
  createDefaultPointLight
);

export const pointLightsPtr = CY.createArray("pointLight", {
  struct: PointLightStruct,
  init: MAX_POINT_LIGHTS,
  forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});
