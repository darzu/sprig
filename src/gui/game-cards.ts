import { CameraDef } from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { V3, V4, V } from "../matrix/sprig-matrix.js";
import { ButtonsStateDef } from "./button.js";
import { PositionDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { BallMesh } from "../meshes/mesh-list.js";
import { makePlaneMesh, mkLineSegs } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { SVG, compileSVG, svgToLineSeg } from "../utils/svg.js";
import {
  LineUniDef,
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { CHAR_SVG, MISSING_CHAR_SVG } from "./svg-font.js";
import { registerUICameraSys } from "./game-font.js";
import { initGhost } from "../graybox/graybox-helpers.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { CY } from "../render/gpu-registry.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { DevConsoleDef } from "../debug/console.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { createRenderTextureToQuad } from "../render/gpu-helper.js";

const DBG_GIZMOS = true;

const DBG_3D = true; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

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

const fontLineWorldWidth = CHARS.length * charWorldWidth;
// const fontLineWorldHeight = charWorldHeight;
const fontLineWorldHeight = fontLineWorldWidth;
console.log("fontLineWorldWidth:" + fontLineWorldWidth);

const shader_fontLine = `
struct VertexOutput {
  @builtin(position) fragPos : vec4<f32>,
}

@vertex
fn vertMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = meshUni.transform * vec4<f32>(input.position, 1.0);

  let x = (worldPos.x / ${fontLineWorldWidth}) * 2.0 - 1.0;
  let y = (worldPos.y / ${fontLineWorldHeight}) * 2.0 - 1.0;

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
  size: [fontLineWorldWidth * 32, fontLineWorldHeight * 32],
  format: "r8unorm",
  // format: "rgba8unorm",
});
console.log("fontLineMaskTex.size:" + fontLineMaskTex.size[0]);

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
      // meshMask: FONT_JFA_MASK,
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

const fontJfa = createJfaPipelines({
  maskTex: fontLineMaskTex,
  maskMode: "interior",
  sdfDistFact: 40.0,
  // maxDist: 16,
});

export const fontLineSdfExampleTex = CY.createTexture("fontLineSdfExampleTex", {
  size: fontLineMaskTex.size,
  format: "r8unorm",
  // format: "r16float",
  // format: "rgba8unorm",
});
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
    if (c < 0.1) {
      return 1.0;
    } else {
      return 0.0;
    }
  `
).pipeline;

// prittier-ignore
const dbgGrid = [
  [fontJfa._inputMaskTex, fontJfa._uvMaskTex],
  [fontJfa.sdfTex, fontLineSdfExampleTex],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

export async function initCardsGame() {
  // console.log(`panel ${PANEL_W}x${PANEL_H}`);

  const res = await EM.whenResources(RendererDef, ButtonsStateDef);

  // res.renderer.pipelines = [
  //   // ...shadowPipelines,
  //   stdRenderPipeline,
  //   alphaRenderPipeline,
  //   outlineRender,
  //   deferredPipeline,
  //   postProcess,
  // ];
  EM.addSystem(
    "gameCardsPipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        stdMeshPipe,
        alphaRenderPipeline,
        outlineRender,
        deferredPipeline,

        pointPipe,
        linePipe,

        postProcess,

        // pipeFontLineRender,
        // ...fontJfa.allPipes(),

        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    }
  );

  const sunlight = EM.new();
  EM.set(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  V3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  EM.set(sunlight, PositionDef, V(10, 10, 100));
  // TODO(@darzu): weird, why does renderable need to be on here?
  EM.set(sunlight, RenderableConstructDef, BallMesh, false);

  const panel = EM.new();
  const panelMesh = makePlaneMesh(
    -PANEL_W * 0.5,
    PANEL_W * 0.5,
    -PANEL_H * 0.5,
    PANEL_H * 0.5
  );
  // panelMesh.colors[0] = [0.1, 0.3, 0.1];
  // panelMesh.colors[1] = [0.1, 0.1, 0.3];
  panelMesh.colors[0] = V3.clone(ENDESGA16.darkGreen);
  panelMesh.colors[1] = V3.clone(ENDESGA16.darkRed); // underside
  EM.set(panel, RenderableConstructDef, panelMesh);
  // EM.set(panel, ColorDef, ENDESGA16.red);
  EM.set(panel, PositionDef, V(0, 0, 0));

  if (DBG_GIZMOS) addWorldGizmo(V(-PANEL_W * 0.5, -PANEL_H * 0.5, 0));

  if (DBG_3D) {
    // const g = createGhost(BallMesh);
    // V3.copy(g.position, [-21.83, -25.01, 21.79]);
    // quat.copy(g.rotation, [0.0, 0.0, -0.31, 0.95]);
    // V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.685;
    const g = initGhost();
    g.controllable.speed *= 0.4;
  }

  {
    const { camera } = await EM.whenResources(CameraDef);
    camera.fov = Math.PI * 0.5;
    camera.targetId = 0;
    // const cameraTarget = EM.new();
    // EM.set(cameraTarget, PositionDef, V(0, 0, 0));
    // EM.set(cameraTarget, RotationDef);
    // EM.set(cameraTarget, CameraFollowDef);
    // cameraTarget.cameraFollow.pitchOffset = -0.5 * Math.PI;
  }

  // TODO(@darzu): mouse lock?
  if (!DBG_3D)
    EM.whenResources(CanvasDef).then((canvas) =>
      canvas.htmlCanvas.unlockMouse()
    );

  registerUICameraSys();

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

  const charOrigin: V3.InputT = [charWorldWidth / 2, charWorldHeight / 2, 0];

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
      undefined,
      // FONT_JFA_MASK | DEFAULT_MASK,
      lineMeshPoolPtr
    );
    EM.set(ent, ColorDef, ENDESGA16.yellow);
    EM.set(ent, PositionDef, [
      i * charWorldWidth + charOrigin[0],
      0 + charOrigin[1],
      0.1,
    ]);

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
    if (_frame > 1) return;

    res.renderer.renderer.submitPipelines(handles, [
      pipeFontLineRender,
      ...fontJfa.allPipes(),
      pipeFontLineSdfExample,
    ]);

    _frame++;
  });
}
