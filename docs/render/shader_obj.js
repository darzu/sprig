import { mat4, vec3 } from "../gl-matrix.js";
import { align, sum } from "../math.js";
import { Vertex } from "./mesh-pool.js";
import { shaderSceneStruct } from "./render_webgpu.js";
export var MeshUniformMod;
(function (MeshUniformMod) {
    const _counts = [
        align(4 * 4, 4),
        align(3, 4),
        align(3, 4),
        align(3, 4), // tint
    ];
    const _names = ["transform", "aabbMin", "aabbMax", "tint"];
    const _types = ["mat4x4<f32>", "vec3<f32>", "vec3<f32>", "vec3<f32>"];
    const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);
    MeshUniformMod.byteSizeExact = sum(_counts) * Float32Array.BYTES_PER_ELEMENT;
    MeshUniformMod.byteSizeAligned = align(MeshUniformMod.byteSizeExact, 256); // uniform objects must be 256 byte aligned
    const scratch_f32 = new Float32Array(sum(_counts));
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    function serialize(buffer, byteOffset, d) {
        scratch_f32.set(d.transform, _offsets[0]);
        scratch_f32.set(d.aabbMin, _offsets[1]);
        scratch_f32.set(d.aabbMax, _offsets[2]);
        scratch_f32.set(d.tint, _offsets[3]);
        buffer.set(scratch_f32_as_u8, byteOffset);
    }
    MeshUniformMod.serialize = serialize;
    function generateWGSLUniformStruct() {
        // Example:
        //     transform: mat4x4<f32>;
        //     aabbMin: vec3<f32>;
        //     aabbMax: vec3<f32>;
        //     tint: vec3<f32>;
        if (_names.length !== _types.length)
            throw `mismatch between names and sizes for mesh uniform format`;
        let res = ``;
        for (let i = 0; i < _names.length; i++) {
            const n = _names[i];
            const t = _types[i];
            res += `${n}: ${t};\n`;
        }
        return res;
    }
    MeshUniformMod.generateWGSLUniformStruct = generateWGSLUniformStruct;
    function CloneData(d) {
        return {
            aabbMin: vec3.clone(d.aabbMin),
            aabbMax: vec3.clone(d.aabbMax),
            transform: mat4.clone(d.transform),
            tint: vec3.clone(d.tint),
        };
    }
    MeshUniformMod.CloneData = CloneData;
})(MeshUniformMod || (MeshUniformMod = {}));
export const obj_vertShader = () => shaderSceneStruct() +
    `
    struct Model {
        ${MeshUniformMod.generateWGSLUniformStruct()}
    };

    @group(0) @binding(0) var<uniform> scene : Scene;
    @group(1) @binding(0) var<uniform> model : Model;

    struct VertexOutput {
        @location(0) @interpolate(flat) normal : vec3<f32>;
        @location(1) @interpolate(flat) color : vec3<f32>;
        @builtin(position) position : vec4<f32>;
    };

    @stage(vertex)
    fn main(
        ${Vertex.GenerateWGSLVertexInputStruct(",")}
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.transform * vec4<f32>(position, 1.0);
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.transform * vec4<f32>(normal, 0.0)).xyz;
        output.color = color + model.tint;
        return output;
    }
`;
export const obj_fragShader = () => shaderSceneStruct() +
    `
    @group(0) @binding(0) var<uniform> scene : Scene;

    struct VertexOutput {
        @location(0) @interpolate(flat) normal : vec3<f32>;
        @location(1) @interpolate(flat) color : vec3<f32>;
    };

    @stage(fragment)
    fn main(input: VertexOutput) -> @location(0) vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;
//# sourceMappingURL=shader_obj.js.map