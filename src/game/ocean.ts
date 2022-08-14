import { AnimateToDef } from "../animate-to.js";
import { ColorDef } from "../color.js";
import { createRef, Ref } from "../em_helpers.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, vec2 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { clamp } from "../math.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import {
  unwrapPipeline,
  unwrapPipeline2,
  uvMaskTex,
  uvToNormTex,
  uvToPosTex,
  UVUNWRAP_MASK,
} from "../render/pipelines/xp-uv-unwrap.js";
import {
  RenderableConstructDef,
  RenderableOceanDef,
  RenderableStdDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "../temp-pool.js";
import { asyncTimeout, range } from "../util.js";
import { quatDbg, quatFromUpForward, vec2Dbg, vec3Dbg } from "../utils-3d.js";
import { AssetsDef } from "./assets.js";

export interface Ocean {
  ent: Ref<[typeof PositionDef]>;
  // TODO(@darzu): uvDistanceToEdge, read the SDF
  uvToPos: (out: vec3, uv: vec2) => vec3;
  uvToNorm: (out: vec3, uv: vec2) => vec3;
  uvToEdgeDist: (uv: vec2) => number;
}

export const OceanDef = EM.defineComponent("ocean", (o: Ocean) => {
  return o;
});

export const UVPosDef = EM.defineComponent(
  "uvPos",
  (uv?: vec2) => uv ?? vec2.create()
);
EM.registerSerializerPair(
  UVPosDef,
  (o, buf) => buf.writeVec2(o),
  (o, buf) => buf.readVec2(o)
);

export const UVDirDef = EM.defineComponent(
  "uvDir",
  (dir?: vec2) => dir ?? vec2.fromValues(0, 1)
);
EM.registerSerializerPair(
  UVDirDef,
  (o, buf) => buf.writeVec2(o),
  (o, buf) => buf.readVec2(o)
);

// const BouyDef = EM.defineComponent(
//   "bouy",
//   (uv: vec2 = [0, 0], child?: Ref<[typeof PositionDef]>) => ({
//     uv: uv,
//     child: child ?? createRef(0, [PositionDef]),
//   })
// );

export const oceanJfa = createJfaPipelines(uvMaskTex, "exterior");

export async function initOcean() {
  const res = await EM.whenResources(RendererDef, AssetsDef);

  const ocean = EM.newEntity();
  let oceanEntId = ocean.id; // hacky?
  EM.ensureComponentOn(
    ocean,
    RenderableConstructDef,
    res.assets.ocean.mesh,
    // TODO(@darzu): needed?
    true,
    0,
    UVUNWRAP_MASK,
    "ocean"
  );
  EM.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
  // em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
  EM.ensureComponentOn(ocean, PositionDef);

  let ocean2 = await EM.whenEntityHas(ocean, RenderableOceanDef);

  // TODO(@darzu):
  const preOceanGPU = performance.now();
  res.renderer.renderer.submitPipelines(
    [],
    [ocean2.renderableOcean.meshHandle],
    // [unwrapPipeline, unwrapPipeline2]
    [unwrapPipeline, unwrapPipeline2, ...oceanJfa.allPipes()]
  );

  // read from one-time jobs
  // TODO(@darzu): what's the right way to handle these jobs
  const readPromises = [
    res.renderer.renderer.readTexture(uvToPosTex),
    res.renderer.renderer.readTexture(uvToNormTex),
    res.renderer.renderer.readTexture(oceanJfa.sdfTex),
  ];

  const [uvToPosData, uvToNormData, sdfData] = await Promise.all(readPromises);

  const timeOceanGPU = performance.now() - preOceanGPU;
  console.log(`ocean GPU round-trip: ${timeOceanGPU.toFixed(2)}ms`);

  // TODO(@darzu): Account for the 1px border in the texture!!!
  const uvToPosReader = createTextureReader(
    uvToPosData,
    uvToPosTex.size,
    3,
    uvToPosTex.format
  );

  const uvToNormReader = createTextureReader(
    uvToNormData,
    uvToNormTex.size,
    3,
    uvToNormTex.format
  );

  const sdfReader = createTextureReader(
    sdfData,
    oceanJfa.sdfTex.size,
    1,
    oceanJfa.sdfTex.format
  );

  // console.log("adding OceanDef");

  // TODO(@darzu): hacky hacky way to do this
  EM.addSingletonComponent(OceanDef, {
    ent: createRef(oceanEntId, [PositionDef]),
    uvToPos: (out, uv) => {
      const x = uv[0] * uvToPosReader.size[0];
      const y = uv[1] * uvToPosReader.size[1];
      // console.log(`${x},${y}`);
      return uvToPosReader.sample(out, x, y);
    },
    uvToNorm: (out, uv) => {
      const x = uv[0] * uvToNormReader.size[0];
      const y = uv[1] * uvToNormReader.size[1];
      // console.log(`${x},${y}`);
      return uvToNormReader.sample(out, x, y);
    },
    uvToEdgeDist: (uv) => {
      const x = uv[0] * uvToNormReader.size[0];
      const y = uv[1] * uvToNormReader.size[1];
      return sdfReader.sample(NaN, x, y);
    },
  });
}

EM.registerSystem(
  [UVPosDef, PositionDef],
  [OceanDef],
  (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
      // TODO(@darzu): need some notion of UV parenting?
      if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0) continue;
      if (AnimateToDef.isOn(e)) continue;
      // console.log(`copying: ${e.id}`);
      const newPos = res.ocean.uvToPos(tempVec3(), e.uvPos);

      // if (e.id > 10001) {
      //   // [-347.83,25.77,126.72]
      //   // [-347.83,25.77,126.72]
      //   console.log(
      //     `moving: ${e.id} at uv ${vec2Dbg(e.uvPos)} from ${vec3Dbg(
      //       e.position
      //     )} to ${vec3Dbg(newPos)}`
      //   );
      // }

      if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
        vec3.copy(e.position, newPos);
        // console.log(`moving to: ${vec3Dbg(e.position)}`);
      }
    }
  },
  "oceanUVtoPos"
);

EM.registerSystem(
  [UVPosDef, UVDirDef, PositionDef, RotationDef],
  [OceanDef],
  (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
      // TODO(@darzu): need some notion of UV parenting?
      if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0) continue;
      if (AnimateToDef.isOn(e)) continue;
      // console.log(`copying: ${e.id}`);

      // vec2.normalize(e.uvDir, e.uvDir);
      const scaledUVDir = vec2.scale(tempVec2(), e.uvDir, 0.0001);
      const aheadUV = vec2.add(tempVec2(), e.uvPos, scaledUVDir);
      const aheadPos = res.ocean.uvToPos(tempVec3(), aheadUV);

      // TODO(@darzu): want SDF-based bounds checking
      if (!vec3.exactEquals(aheadPos, vec3.ZEROS)) {
        const forwardish = vec3.sub(tempVec3(), aheadPos, e.position);
        const newNorm = res.ocean.uvToNorm(tempVec3(), e.uvPos);
        quatFromUpForward(e.rotation, newNorm, forwardish);
        // console.log(
        //   `UVDir ${[e.uvDir[0], e.uvDir[1]]} -> ${quatDbg(e.rotation)}`
        // );
      }
    }
  },
  "oceanUVDirToRot"
);

// TODO(@darzu): debug movement on the ocean
// EM.registerSystem(
//   [UVPosDef, UVDirDef, PositionDef, RotationDef],
//   [OceanDef, InputsDef],
//   (es, res) => {
//     // console.log("runOcean");
//     for (let e of es) {
//       // TODO(@darzu): debug moving
//       // console.log("moving buoy!");
//       let speed = 0.001;
//       const deltaUV = vec2.zero(tempVec2());
//       if (res.inputs.keyDowns["shift"]) speed *= 5;
//       if (res.inputs.keyDowns["arrowright"]) deltaUV[1] -= speed;
//       if (res.inputs.keyDowns["arrowleft"]) deltaUV[1] += speed;
//       if (res.inputs.keyDowns["arrowup"]) deltaUV[0] += speed;
//       if (res.inputs.keyDowns["arrowdown"]) deltaUV[0] -= speed;
//       if (deltaUV[0] !== 0.0 || deltaUV[1] !== 0.0) {
//         const newUV = vec2.add(tempVec2(), e.uvPos, deltaUV);

//         // TODO(@darzu): need a better way to see if UV is out of map bounds
//         const newPos = res.ocean.uvToPos(tempVec3(), newUV);
//         if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
//           vec2.copy(e.uvPos, newUV);
//           vec2.copy(e.uvDir, deltaUV);
//         }
//       }
//     }
//   },
//   "runOcean"
// );

// TODO(@darzu): ocean texture posibilities:
// [x] 2D voronoi texture to CPU
// [x] 2D normals texture
// [ ] 3D->3D voronoi texture
// [ ] 3D->2D voronoi seeds lookup texture
// [ ] 3D normals texture ?
