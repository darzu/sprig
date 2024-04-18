// used in a createRenderTextureToQuad fragSnippet
// TODO(@darzu): better support for this pattern?

override stepSize: i32;

 @fragment
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec2<u32> {
  let dims = vec2<i32>(textureDimensions(inTex));
  let dimsF = vec2<f32>(dims);
  let fragXY = vec2<i32>(fragUV * dimsF);

  // let cSeedUV = textureLoad(inTex, fragXY, 0).xy;
  // let cSeedXY = vec2<i32>(cSeedUV * dimsF);

  let fragObj: u32 = textureLoad(surfTex, fragXY, 0).g;
  // let fragDep: f32 = textureLoad(depthTex, fragXY, 0);

  // let cSeedUV = textureLoad(inTex, fragXY, 0).xy;
  // let cSeedXY = vec2<i32>(cSeedUV * dimsF);

  // let cSeedObj: u32 = textureLoad(surfTex, cSeedXY, 0).g;
  // let cSeedDep: f32 = textureLoad(depthTex, cSeedXY, 0);

  // const maxInnerDist = 0.02; // TODO(@darzu): tweak
  // const maxOuterDist = 0.01; // TODO(@darzu): tweak
  // const maxDist = 0.01; // TODO(@darzu): tweak
  // const maxDist = 0.02; // TODO(@darzu): tweak
  // const maxDist = 0.05; // TODO(@darzu): tweak
  const maxDist = 0.01; // TODO(@darzu): tweak
  // const diffObjMaxDist = 0.01; // TODO(@darzu): tweak

  var bestDist = 999999.9;
  var bestUV = vec2(0.0);
  var bestDep = 999.9;
  var bestObj: u32 = 99999;
  var bestSurf: u32 = 99999;
  // var first = false;

  for (var x = -1; x <= 1; x++) 
  {
    // var y = 0;
    for (var y = -1; y <= 1; y++)
    {
      let sampXY = fragXY + vec2(x,y) * stepSize;
      // let sSeedUV = textureLoad(inTex, sampXY, 0).xy;
      // let sSeedXY = vec2<i32>(sSeedUV * dimsF);
      let sSeedXY = vec2<i32>(textureLoad(inTex, sampXY, 0).xy);
      let sSeedUV = vec2<f32>(sSeedXY) / dimsF;
      // TODO(@darzu): check surface too
      let sSeedSurfAndObj: vec2<u32> = textureLoad(surfTex, sSeedXY, 0).rg;
      let sSeedObj = sSeedSurfAndObj.g;
      let sSeedSurf = sSeedSurfAndObj.r;
      let sSeedDep: f32 = textureLoad(depthTex, sSeedXY, 0);
      let sSeedSize: f32 = textureLoad(maskTex, sSeedXY, 0).g;
      let dist = distance(sSeedUV, fragUV); 

      // sample bounds check
      if (!(
        // TODO(@darzu): remove the sampXY if u know content won't touch the edge
           sampXY.x < dims.x
        && sampXY.y < dims.y
        && sampXY.x >= 0
        && sampXY.y >= 0
        && sSeedUV.x > 0.0
        && sSeedUV.y > 0.0)
      ) {
        // invalid sample
        continue;
      }

      // // DEBUGGING
      // if (sSeedSize < dist) {
      //   continue;
      // }
      // if (sSeedDep < bestDep && dist < bestDist) {
      //   bestDist = dist;
      //   bestUV = sSeedUV;
      //   bestObj = sSeedObj;
      //   bestDep = min(bestDep, sSeedDep);
      //   bestDep = sSeedDep;
      //   continue;
      // }
      // continue;

      
      // clamp radius
      if (sSeedSize < dist 
      && sSeedObj != fragObj
      ) {
        continue;
      }

      if (sSeedObj != bestObj) {
        if (sSeedDep < bestDep) {
          // take new nearer
          bestDist = dist;
          bestUV = sSeedUV;
          bestObj = sSeedObj;
          bestSurf = sSeedSurf;
          bestDep = sSeedDep;
          continue;
        }
        // keep old nearer
        continue;
      }

      // same object

      // TODO(@darzu): BUG. this condition definitely violates JFA and introduces some noise-like 
      //    artifacts (they kinda look cool tbh, and they're stable)
      // if (bestSurf != sSeedSurf && sSeedDep < bestDep && dist < sSeedSize) {
      if (sSeedDep < bestDep && dist < sSeedSize) {
        // take new nearer
        bestDist = dist;
        bestUV = sSeedUV;
        bestObj = sSeedObj;
        bestSurf = sSeedSurf;
        bestDep = sSeedDep;
        continue;
      }

      if (dist < bestDist) {
        bestDist = dist;
        bestUV = sSeedUV;
        bestObj = sSeedObj;
        bestSurf = sSeedSurf;
        // bestDep = min(bestDep, sSeedDep);
        bestDep = sSeedDep;
        continue;
      }

    }
  }

  // TODO(@darzu): store and return bestXY
  return vec2<u32>(bestUV * dimsF);
}


      // if (sSeedObj == bestObj) {
      //   if (dist < bestDist) 
      //   {
      //     bestDist = dist;
      //     bestUV = sSeedUV;
      //   }
      //   bestDep = min(bestDep, sSeedDep);
      //   continue;
      // }

      // if (dist <= diffObjMaxDist && diffObjMaxDist < bestDist) {
      //   bestDist = dist;
      //   bestUV = sSeedUV;
      //   bestObj = sSeedObj;
      //   bestDep = sSeedDep;
      //   continue;
      // }

      // if (bestDist <= diffObjMaxDist && diffObjMaxDist < dist) {
      //   continue;
      // }

      // if (sSeedDep < bestDep) {
      //   bestDist = dist;
      //   bestUV = sSeedUV;
      //   bestObj = sSeedObj;
      //   bestDep = sSeedDep;
      //   continue;
      // }

        // && (dist < bestDist || sSeedDep > cSeedDep)
        // && sSeedObj == cSeedObj
        // && objFuz
        // && sSeedObj <= cSeedObj
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