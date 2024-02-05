// used in a createRenderTextureToQuad fragSnippet
// TODO(@darzu): better support for this pattern?

override stepSize: i32;

 @fragment
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec2<f32> {
  let dims = vec2<i32>(textureDimensions(inTex));
  let fragXY = vec2<i32>(fragUV * vec2<f32>(dims));
  let cSeedUV = textureLoad(inTex, fragXY, 0).xy;
  let cSeedXY = vec2<i32>(cSeedUV * vec2<f32>(dims));

  let cSeedObj: u32 = textureLoad(surfTex, cSeedXY, 0).g;
  let cSeedDep: f32 = textureLoad(depthTex, cSeedXY, 0);

  var bestDist = 9999.9;
  var bestUV = vec2(0.0);

  for (var x = -1; x <= 1; x++) 
  {
    for (var y = -1; y <= 1; y++)
    {
      let neighXY = fragXY + vec2(x,y) * stepSize;
      let nSeedUV = textureLoad(inTex, neighXY, 0).xy;
      let nSeedXY = vec2<i32>(nSeedUV * vec2<f32>(dims));
      let nSeedObj = textureLoad(surfTex, nSeedXY, 0).g;
      let nSeedDep: f32 = textureLoad(depthTex, nSeedXY, 0);
      var dist = distance(nSeedUV, fragUV);
      if (
        // TODO(@darzu): remove the neighXY if u know content won't touch the edge
           neighXY.x < dims.x
        && neighXY.y < dims.y
        && neighXY.x >= 0
        && neighXY.y >= 0
        && nSeedUV.x > 0.0
        && nSeedUV.y > 0.0
        && dist < bestDist
      ) 
      {
        bestDist = dist;
        bestUV = nSeedUV;
      }
    }
  }

  return bestUV;
}


        // && (dist < bestDist || nSeedDep > cSeedDep)
        // && nSeedObj == cSeedObj
        // && objFuz
        // && nSeedObj <= cSeedObj
      // let diffObj = nSeedObj != cSeedObj;
      // var objFuz = true;
      // if (diffObj && nSeedDep < cSeedDep && dist < 0.05) {
      //   dist = 0.0;
      //   // objFuz = dist < 0.05;
      //   // // objFuz = dist < (0.05 * nSeedDep * tBounce) && (nSeedDep >= cSeedDep);
      //   // // objFuz = dist < (0.05 * tBounce) && (cSeedDep > nSeedDep);
      //   // // dist *= 1.0 + abs(nSeedDep - cSeedDep) * 1000000000.0 * tBounce;
      //   // dist *= 1.0 + abs(nSeedDep - cSeedDep) * 100.0 * tBounce;
      // }
          // * 4.0; // TODO(@darzu): make configurable