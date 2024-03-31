
override stepSize: i32;

 @fragment
fn frag_main(@location(0) centerUV : vec2<f32>) -> @location(0) vec2<f32> {
  let dimsI : vec2<i32> = vec2<i32>(textureDimensions(inTex));
  let dimsF = vec2<f32>(dimsI);
  let centerXY = vec2<i32>(centerUV * dimsF);

  var minDist = 9999.9;
  var minUV = vec2(0.0);

  for (var x = -1; x <= 1; x++) 
  {
    for (var y = -1; y <= 1; y++)
    {
      let neighXY = centerXY + vec2(x,y) * stepSize;
      let neighUV = textureLoad(inTex, neighXY, 0).xy;

      // let uv2 = centerUV + vec2(f32(x),f32(y)) * f32(stepSize) / dimsF;
      // // let neighUV = textureLoad(inTex, neighXY, 0).xy;
      // let neighUV = textureSample(inTex, nearestSampler, uv2).xy;

      let dist = length(neighUV - centerUV)
         * 4.0; // TODO(@darzu): make configurable
      if (
        // TODO(@darzu): remove the neighXY if u know content won't touch the edge
           neighXY.x < dimsI.x
        && neighXY.y < dimsI.y
        && neighXY.x >= 0
        && neighXY.y >= 0
        && neighUV.x > 0.0
        && neighUV.y > 0.0
        && dist < minDist
      ) 
      {
        minDist = dist;
        minUV = neighUV;
      }
    }
  }

  return minUV;
}
