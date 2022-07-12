// used in a createRenderTextureToQuad fragSnippet
// TODO(@darzu): better support for this pattern?
 @fragment
fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let dimsI : vec2<i32> = textureDimensions(inTex);
  let dimsF = vec2<f32>(dimsI);
  let xy = vec2<i32>(uv * dimsF);
  let inPx = textureLoad(inTex, xy, 0);
  // return vec4(inPx);

  // let centerXY = vec2<i32>(GlobalInvocationID.xy);
  // // let centerXY = vec2<i32>(32, 32);
  // // let centerXY = vec2<i32>(
  // //   WorkGroupID.xy * vec2<u32>(8u, 8u) +
  // //   LocalInvocationID.xy
  // // );
  let centerXY = xy;
  let centerUV = uv;
  // let centerUV = vec2<f32>(centerXY) / dimsF;

  let stepSize = 16;

  var minDist = 9999.9;
  var minUV = inPx.xy;

  // for (var x = -1; x <= 1; x++) 
  {
    for (var y = -1; y <= 1; y++)
     {
    var x = 0;
    // var y = 0;

    let neighXY = centerXY + vec2(x,y) * stepSize;
    let neighUV = textureLoad(inTex, neighXY, 0).xy;
  //     // textureStore(outTex, centerXY, vec4(neighUV, 0.0, 1.0));

  //     // let neighUV = textureLoad(inTex, neighXY, 0).xy;
      let dist = length(neighUV - centerUV);
  //     let foo = neighUV.x - 0.5 ;
  //     // if (true) 
      if (
        true
  //       && foo > 0.0
        && neighUV.x > 0.0
        && neighUV.y > 0.0 
        && dist < minDist
      ) 
      {
        minDist = dist;
        minUV = neighUV;

        // textureStore(outTex, centerXY, vec4(minUV, 0.0, 1.0));
        // textureStore(outTex, centerXY, vec4(neighUV, 0.0, 1.0));
        // textureStore(outTex, centerXY, vec4(centerUV, 0.0, 1.0));
      }
  // //     // let foo2 = textureLoad(inPosTex, centerXY, 0);
  // //     // textureStore(outSdfTex, centerXY, vec4(dist));
    }
  }

  // // // TODO(@darzu): don't use rgba, just rg
  return vec4(minUV, 0.0, 1.0);
}
