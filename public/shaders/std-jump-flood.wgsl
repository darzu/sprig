// used in a createRenderTextureToQuad fragSnippet
// TODO(@darzu): better support for this pattern?

override stepSize: i32;

 @fragment
fn frag_main(@location(0) centerUV : vec2<f32>) -> @location(0) vec2<f32> {
  let dims = vec2<i32>(textureDimensions(inTex));
  let centerXY = vec2<i32>(centerUV * vec2<f32>(dims));

  let centerObj: u32 = textureLoad(surfTex, centerXY, 0).g;

  var minDist = 9999.9;
  var minUV = vec2(0.0);

  for (var x = -1; x <= 1; x++) 
  {
    for (var y = -1; y <= 1; y++)
    {
      let neighXY = centerXY + vec2(x,y) * stepSize;
      let neighUV = textureLoad(inTex, neighXY, 0).xy;
      let neighObj = textureLoad(surfTex, neighXY, 0).g;
      let dist = length(neighUV - centerUV)
      // TODO(@darzu): wait, what is this *4?
          * 4.0; // TODO(@darzu): make configurable
      if (
        // TODO(@darzu): remove the neighXY if u know content won't touch the edge
           neighXY.x < dims.x
        && neighXY.y < dims.y
        && neighXY.x >= 0
        && neighXY.y >= 0
        && neighUV.x > 0.0
        && neighUV.y > 0.0
        && dist < minDist
        && neighObj == centerObj
      ) 
      {
        minDist = dist;
        minUV = neighUV;
      }
    }
  }

  return minUV;
}
