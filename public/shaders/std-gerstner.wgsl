fn gerstner(uv: vec2<f32>, t: f32) -> mat2x3<f32> {
    var displacement = vec3<f32>(0.0, 0.0, 0.0);
    var normal = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < scene.numGerstnerWaves; i++) {
        let wave = gerstnerWaves.ms[i];
        let dot_w_d_uv_phi_t = dot(wave.w * wave.D, uv) + wave.phi * t;
        let _cos = cos(dot_w_d_uv_phi_t);
        let _sin = sin(dot_w_d_uv_phi_t);
        displacement.x += wave.Q * wave.A + wave.D.x * _cos;
        displacement.z += wave.Q * wave.A + wave.D.y * _cos;
        displacement.y += wave.A * _sin;
        normal.x += -1.0 * wave.D.x * wave.w * wave.A * _cos;
        normal.z += -1.0 * wave.D.y * wave.w * wave.A * _cos;
        normal.y += wave.Q * wave.w * wave.A * _sin;
    }
    normal.y = 1.0 - normal.y;
    normalize(normal);
    return mat2x3(displacement, normal);
}