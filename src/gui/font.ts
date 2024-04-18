import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { EntityW, EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V4, V3 } from "../matrix/sprig-matrix.js";
import { mkLineSegs } from "../meshes/primatives.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef } from "../physics/transform.js";
import { createRenderTextureToQuad } from "../render/gpu-helper.js";
import { CY, CyTexturePtr } from "../render/gpu-registry.js";
import { FONT_JFA_MASK } from "../render/pipeline-masks.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { lineMeshPoolPtr, LineUniDef } from "../render/pipelines/std-line.js";
import {
  RendererDef,
  RenderableDef,
  RenderableConstructDef,
} from "../render/renderer-ecs.js";
import { SVG, svgToLineSeg, compileSVG } from "../utils/svg.js";
import { CHAR_SVG, MISSING_CHAR_SVG } from "./svg-font.js";

const CHAR_STR = `1023456789JQKA`;
const CHARS = CHAR_STR.split("");

const svg_x: SVG = [
  { i: "M", x: -0.5, y: -0.5 },
  { i: "m", dx: 1, dy: 1 },
  { i: "M", x: -0.5, y: 0.5 },
  { i: "m", dx: 1, dy: -1 },
];

const charWorldWidth = 2;
const charWorldHeight = 2;
const charPerRow = 5;
const numRows = Math.ceil(CHARS.length / charPerRow);

const fontLineWorldWidth = charPerRow * charWorldWidth;
const fontLineWorldHeight = numRows * charWorldHeight;
const fontLineWorldSize = Math.max(fontLineWorldWidth, fontLineWorldHeight);
console.log("fontLineWorldSize:" + fontLineWorldSize);

const shader_fontLine = `
struct VertexOutput {
  @builtin(position) fragPos : vec4<f32>,
}

@vertex
fn vertMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = meshUni.transform * vec4<f32>(input.position, 1.0);

  let x = (worldPos.x / ${fontLineWorldSize}) * 2.0 - 1.0;
  let y = (worldPos.y / ${fontLineWorldSize}) * 2.0 - 1.0;

  output.fragPos = vec4(x, y, 0.0, 1.0);
  return output;
}

struct FragOut {
  @location(0) color: f32,
  // @location(0) color: vec4<f32>,
}

@fragment fn fragMain(input: VertexOutput) -> FragOut {
  var output: FragOut;
  output.color = 1.0;
  // output.color = vec4(1.0);
  return output;
}
`;

export const fontLineMaskTex = CY.createTexture("fontLineMaskTex", {
  size: [fontLineWorldSize * 128, fontLineWorldSize * 128],
  format: "r8unorm",
  // format: "rgba8unorm",
});
// console.log("fontLineMaskTex.size:" + fontLineMaskTex.size[0]);

export const pipeFontLineRender = CY.createRenderPipeline(
  "pipeFontLineRender",
  {
    globals: [],
    shader: () => `
  ${shader_fontLine}
  `,
    shaderVertexEntry: "vertMain",
    shaderFragmentEntry: "fragMain",
    meshOpt: {
      pool: lineMeshPoolPtr,
      meshMask: FONT_JFA_MASK,
      stepMode: "per-mesh-handle",
    },
    topology: "line-list",
    cullMode: "none",
    output: [
      {
        ptr: fontLineMaskTex,
        clear: "once",
        // defaultColor: V4.clone([0.1, 0.1, 0.1, 0.0]),
        defaultColor: V4.clone([0.0, 0.0, 0.0, 0.0]),
      },
    ],
  }
);

export const fontJfa = createJfaPipelines({
  name: "fontJfa",
  maskTex: fontLineMaskTex,
  maskMode: "interior",
  sdfDistFact: 10.0,
  maxDist: 512,
  size: 512 * 8,
});

export const fontLineSdfExampleTex = CY.createTexture("fontLineSdfExampleTex", {
  size: fontLineMaskTex.size,
  format: "r8unorm",
  // format: "r16float",
  // format: "rgba8unorm",
});
// console.log("fontLineSdfExampleTex.size:" + fontLineSdfExampleTex.size[0]);
const pipeFontLineSdfExample = createRenderTextureToQuad(
  "pipeFontLineSdfExample",
  fontJfa.sdfTex,
  fontLineSdfExampleTex,
  -1,
  1,
  -1,
  1,
  true,
  () => `
    // let c = textureLoad(inTex, xy, 0).x;
    // let c = textureSample(inTex, samp, uv).x;
    let c = inPx;
    // if (c < 0.05) {
    return 1.0 - smoothstep(0.03, 0.05, c);
      // return 1.0;
    // } else {
    //   return 0.0;
    // }
  `
).pipeline;

export interface FontResource {
  fontSdfTex: CyTexturePtr;
}

export const FontDef = defineResourceWithInit(
  "font",
  [RendererDef],
  async (res) => {
    return new Promise<FontResource>(async (resolve, reject) => {
      // const charOrigin: V3.InputT = [charWorldWidth / 2, charWorldHeight / 2, 0];

      const promises: Promise<
        EntityW<
          [
            typeof RenderableDef,
            typeof PositionDef,
            typeof WorldFrameDef,
            typeof LineUniDef
            // typeof ColorDef
          ]
        >
      >[] = [];

      for (let i = 0; i < CHARS.length; i++) {
        const c = CHARS[i];

        let svg = CHAR_SVG[c];
        if (!svg) svg = MISSING_CHAR_SVG;
        const segs = svgToLineSeg(compileSVG(svg), { numPerInstr: 10 });
        const mesh = mkLineSegs(segs.length);
        for (let i = 0; i < segs.length; i++) {
          V3.copy(mesh.pos[i * 2], segs[i][0]);
          V3.copy(mesh.pos[i * 2 + 1], segs[i][1]);
        }

        const ent = EM.new();
        EM.set(
          ent,
          RenderableConstructDef,
          mesh,
          true,
          undefined,
          FONT_JFA_MASK,
          lineMeshPoolPtr
        );
        EM.set(ent, ColorDef, ENDESGA16.yellow);

        const row = Math.floor(i / charPerRow);
        const col = i % charPerRow;
        const x = col * charWorldWidth + charWorldWidth / 2;
        const y = row * charWorldHeight + charWorldHeight / 2;

        EM.set(ent, PositionDef, [x, y, 0.1]);

        promises.push(
          EM.whenEntityHas(
            ent,
            RenderableDef,
            WorldFrameDef,
            PositionDef,
            LineUniDef
            // ColorDef
          )
        );
      }

      const allEnts = await Promise.all(promises);

      // allEnts.forEach((e) => {
      //   e.renderable.meshHandle.pool.updateMeshVertices(
      //     e.renderable.meshHandle,
      //     e.renderable.meshHandle.mesh
      //   );
      //   quat.identity(e.world.rotation);
      //   V3.copy(e.world.scale, V3.ONES);
      //   V3.copy(e.world.position, e.position);
      //   updateFrameFromPosRotScale(e.world);
      //   mat4.copy(e.lineUni.transform, e.world.transform);
      //   // V3.copy(e.lineUni.tint, e.color);
      // });

      const handles = allEnts.map((e) => e.renderable.meshHandle);

      let _frame = 0; // TODO(@darzu): HACK. idk what the dependency is..
      EM.addSystem("pipeFontLineRender_HACK", Phase.GAME_WORLD, [], [], () => {
        if (_frame === 2) {
          const result: FontResource = {
            fontSdfTex: fontJfa.sdfTex,
          };
          resolve(result);
        }
        if (_frame > 1) return;

        res.renderer.renderer.submitPipelines(handles, [
          pipeFontLineRender,
          ...fontJfa.allPipes(),
          pipeFontLineSdfExample,
        ]);

        _frame++;
      });
    });
  }
);
