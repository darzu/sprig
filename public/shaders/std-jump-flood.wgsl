
override stepSize: i32;

 @fragment
fn frag_main(@location(0) centerUV : vec2<f32>) -> @location(0) vec2<f32> {
  // TODO(@darzu): PERF. move constants out
  let dimsI : vec2<i32> = vec2<i32>(textureDimensions(inTex)); 
  let dimsF = vec2<f32>(dimsI);
  let centerXY = vec2<i32>(centerUV * dimsF);

  var minDist = 9999.9;
  var minUV = vec2(0.0);

  for (var x = -1; x <= 1; x++) 
  {
    for (var y = -1; y <= 1; y++)
    {
      let sampleXY = centerXY + vec2(x,y) * stepSize;

      if (sampleXY.x >= dimsI.x
        && sampleXY.y >= dimsI.y
        && sampleXY.x < 0
        && sampleXY.y < 0) {
        continue;
      }

      let dataUV = textureLoad(inTex, sampleXY, 0).xy;

      // let uv2 = centerUV + vec2(f32(x),f32(y)) * f32(stepSize) / dimsF;
      // // let dataUV = textureLoad(inTex, sampleXY, 0).xy;
      // let dataUV = textureSample(inTex, nearestSampler, uv2).xy;

      let dist = length(dataUV - centerUV); // * 4.0; // TODO(@darzu): make configurable
      if (
           dataUV.x > 0.0
        && dataUV.y > 0.0
        && dist < minDist
      ) 
      {
        minDist = dist;
        minUV = dataUV;
      }
    }
  }

  return minUV;
}
