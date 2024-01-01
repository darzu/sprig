// IMPORTANT: MUST MATCH gerstner.ts
fn gerstner(uv: vec2<f32>, t: f32) -> mat2x3<f32> {
     var displacement = vec3(0.0, 0.0, 0.0);
     var normal = vec3(0.0, 0.0, 0.0);
     for (var i = 0u; i < scene.numGerstnerWaves; i++) {
         let wave = gerstnerWaves.ms[i];
         let D = wave.D;
         let dot_w_d_uv_phi_t = wave.w * dot(D, uv) + wave.phi * t;
         let _cos = cos(dot_w_d_uv_phi_t);
         let _sin = sin(dot_w_d_uv_phi_t);
         displacement.x += wave.Q * wave.A * D.x * _cos;
         displacement.y += wave.Q * wave.A * D.y * _cos;
        // TODO(@darzu): HACKY. Pre-Z-up had .y -= instead of += . Why?
         displacement.z += wave.A * _sin;
        //  displacement.z -= wave.A * _sin;
         normal.x += -1.0 * D.x * wave.w * wave.A * _cos * wave.normalWeight;
         normal.y += -1.0 * D.y * wave.w * wave.A * _cos * wave.normalWeight;
         normal.z += wave.Q * wave.w * wave.A * _sin * wave.normalWeight;
     }
     // TODO(@darzu): "1.0 -" before normalization seems very sus.
     normal.z = (1.0 - normal.z);
     normal = normalize(normal);
     return mat2x3(displacement, normal);
}

/*
OLD:

fn gerstner(uv: vec2<f32>, t: f32) -> mat2x3<f32> {
    var displacement = vec3<f32>(0.0, 0.0, 0.0);
    var normal = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < scene.numGerstnerWaves; i++) {
        let wave = gerstnerWaves.ms[i];
        displacement = displacement +
            vec3<f32>(wave.Q * wave.A + wave.D.x * cos(dot(wave.w * wave.D, uv) + wave.phi * t),
                      wave.A * sin(dot(wave.w * wave.D, uv) + wave.phi * t),
                      wave.Q * wave.A + wave.D.y * cos(dot(wave.w * wave.D, uv) + wave.phi * t));
        normal = normal +
            vec3<f32>(-1.0 * wave.D.x * wave.w * wave.A * cos(wave.w * dot(wave.D, uv) + wave.phi * t),
                      wave.Q * wave.w * wave.A * sin(wave.w * dot(wave.D, uv) + wave.phi * t),
                      -1.0 * wave.D.y * wave.w * wave.A * cos(wave.w * dot(wave.D, uv) + wave.phi * t));
    }
    normal.y = 1.0 - normal.y;
    normalize(normal);
    return mat2x3(displacement, normal);

    // TODO(@darzu): hack disable gerstner
    // return mat2x3(
    //     vec3<f32>(0.0, 0.0, 0.0),
    //     vec3<f32>(0.0, 1.0, 0.0)
    // );
}
*/