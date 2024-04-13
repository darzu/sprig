import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { createObj } from "../graybox/objects.js";
import { V, V2, V3, V4 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { createRenderTextureToQuad } from "../render/gpu-helper.js";
import { CY } from "../render/gpu-registry.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import {
  LineUniDef,
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  sketch,
  sketchDot,
  sketchEntNow,
  sketchLine,
  sketchSvg,
} from "../utils/sketch.js";
import { PIn2 } from "../utils/util-no-import.js";
import { dbgLogOnce, dbgOnce } from "../utils/util.js";
import { vec2Dbg } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";

const DBG_GHOST = true;

const radius = 10;
const diam = radius * 2;

const radiusPlusWidth = radius + 6;

export const GamepadDef = EM.defineResource("gamepad", () => {
  return {
    leftStick: V(0, 0),
    rightStick: V(0, 0),
    btnClicks: {} as { [key: string]: number },
    btnDowns: {} as { [key: string]: boolean },
  };
});

const shader_lineJfaMask = `
struct VertexOutput {
  @builtin(position) fragPos : vec4<f32>,
}

@vertex
fn vertMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = meshUni.transform * vec4<f32>(input.position, 1.0);

  let x = (worldPos.x / ${radiusPlusWidth}); // -1,1
  let y = (worldPos.y / ${radiusPlusWidth}); // -1,1

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

const jfaMaskTex = CY.createTexture("summonMaskTex", {
  size: [diam * 128, diam * 128],
  format: "r8unorm",
});
console.log("summonMaskTex.size:" + jfaMaskTex.size[0]);

const jfaMaskLineRender = CY.createRenderPipeline("jfaMaskLineRender", {
  globals: [],
  shader: () => `
  ${shader_lineJfaMask}
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
      ptr: jfaMaskTex,
      clear: "once",
      // defaultColor: V4.clone([0.1, 0.1, 0.1, 0.0]),
      defaultColor: V4.clone([0.0, 0.0, 0.0, 0.0]),
    },
  ],
});

const summonJfa = createJfaPipelines({
  maskTex: jfaMaskTex,
  maskMode: "interior",
  sdfDistFact: 10.0,
  maxDist: 512,
  size: 512 * 8,
});

const summonSdfExampleTex = CY.createTexture("summonSdfExampleTex", {
  size: jfaMaskTex.size,
  format: "r8unorm",
  // format: "r16float",
  // format: "rgba8unorm",
});

console.log("summonSdfExampleTex.size:" + summonSdfExampleTex.size[0]);
const pipeSummonJfaLineSdfExample = createRenderTextureToQuad(
  "pipeSummonJfaLineSdfExample",
  summonJfa.sdfTex,
  summonSdfExampleTex,
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

// prittier-ignore
const dbgGrid = [
  [summonJfa._inputMaskTex, summonJfa._uvMaskTex],
  [summonJfa.sdfTex, summonSdfExampleTex],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

export async function initLd55() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

  let didDraw = false;

  let _frame = 0; // TODO(@darzu): HACK. idk what the dependency is..
  EM.addSystem(
    "summonLineJfa",
    Phase.GAME_WORLD,
    [LineUniDef, RenderableDef],
    [RendererDef],
    (es, res) => {
      _frame++;
      if (_frame > 2 && !didDraw) return;

      const handles = es.map((e) => e.renderable.meshHandle);

      res.renderer.renderer.submitPipelines(handles, [
        jfaMaskLineRender,
        ...summonJfa.allPipes(),
        pipeSummonJfaLineSdfExample,
      ]);
    }
  );

  EM.addSystem(
    "ld55Pipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        stdMeshPipe,
        outlineRender,
        deferredPipeline,
        pointPipe,
        linePipe,

        stdGridRender,

        postProcess,

        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    }
  );

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // sun
  createSun();

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, -2],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  // pedestal
  const pedestal = EM.new();
  EM.set(pedestal, RenderableConstructDef, CubeMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
  EM.set(pedestal, PositionDef, V(0, 0, -10));
  EM.set(pedestal, ScaleDef, V(20, 20, 10));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });

  // gizmo
  // addWorldGizmo(V(0, 0, 0), 5);

  // line box
  // const lineBox = createObj(
  //   [RenderableConstructDef, PositionDef, ColorDef, ScaleDef] as const,
  //   {
  //     renderableConstruct: [
  //       mkCubeMesh(),
  //       true,
  //       undefined,
  //       undefined,
  //       lineMeshPoolPtr,
  //     ],
  //     position: [10, 10, 10],
  //     scale: [5, 5, 5],
  //     color: ENDESGA16.lightGreen,
  //   }
  // );

  // line test
  // sketch({
  //   shape: "line",
  //   color: ENDESGA16.orange,
  //   start: [-10, -10, -10],
  //   end: [10, 10, 10],
  // });

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  sketchSvg(
    [
      { i: "M", x: -radius, y: 0 },
      { i: "a", rx: radius, dx: diam, dy: 0, largeArc: true },
      { i: "a", rx: radius, dx: -diam, dy: 0, largeArc: true },
    ],
    {
      origin: [0, 0, 0],
      color: ENDESGA16.lightGreen,
      numPerInstr: 20,
    }
  );

  gamepadStuff();

  const leftDot = createObj(
    [PositionDef, ColorDef, RenderableConstructDef, ScaleDef] as const,
    {
      position: [0, 0, 2],
      color: ENDESGA16.red,
      renderableConstruct: [BallMesh],
      scale: [0.2, 0.2, 1],
    }
  );
  const rightDot = createObj(
    [PositionDef, ColorDef, RenderableConstructDef, ScaleDef] as const,
    {
      position: [0, 0, 2],
      color: ENDESGA16.blue,
      renderableConstruct: [BallMesh],
      scale: [0.2, 0.2, 1],
    }
  );

  const SYMMETRY = 5;
  const SYM_ANGLE = PIn2 / 5;

  EM.addSystem(
    "updateStickDots",
    Phase.GAME_WORLD,
    null,
    [GamepadDef],
    (_, { gamepad }) => {
      didDraw = false;

      leftDot.position[0] = gamepad.leftStick[0] * radius;
      leftDot.position[1] = gamepad.leftStick[1] * radius;

      rightDot.position[0] = gamepad.rightStick[0] * radius;
      rightDot.position[1] = gamepad.rightStick[1] * radius;

      const doPlace = gamepad.btnClicks["lt"] || gamepad.btnClicks["rt"];

      for (let i = 0; i < SYMMETRY; i++) {
        let a = SYM_ANGLE * i;
        const left = V3.yaw([leftDot.position[0], leftDot.position[1], 0], a);
        const right = V3.yaw(
          [rightDot.position[0], rightDot.position[1], 0],
          a
        );

        let hoverColor = i === 0 ? ENDESGA16.lightBlue : ENDESGA16.blue;

        sketchLine(left, right, {
          key: `hoverLine_${i}`,
          color: hoverColor,
        });

        if (doPlace) {
          sketchLine(left, right, {
            color: ENDESGA16.lightGreen,
          });
          didDraw = true;
        }
      }
    }
  );
}

const xboxLayout = [
  "up",
  "down",
  "left",
  "right",
  "start",
  "back",
  "lt",
  "rt",
  "lb",
  "rb",
  "power",
  "a",
  "b",
  "x",
  "y",
];

function gamepadStuff() {
  // https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API

  const gamepads = navigator.getGamepads();
  console.log("gamepads");
  console.dir(gamepads);

  window.addEventListener("gamepadconnected", (e) => {
    console.log(
      "Gamepad connected at index %d: %s. %d buttons, %d axes.",
      e.gamepad.index,
      e.gamepad.id,
      e.gamepad.buttons.length,
      e.gamepad.axes.length
    );
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    console.log(
      "Gamepad disconnected from index %d: %s",
      e.gamepad.index,
      e.gamepad.id
    );
  });

  {
    // init xbox layout
    const gamepad = EM.addResource(GamepadDef);
    for (let name of xboxLayout) {
      gamepad.btnClicks[name] = 0;
      gamepad.btnDowns[name] = false;
    }
  }

  EM.addSystem(
    "gamepad",
    Phase.READ_INPUTS,
    null,
    [GamepadDef],
    (_, { gamepad }) => {
      const rawGamepads = navigator.getGamepads().filter((g) => !!g);
      const rawPad = rawGamepads[0];
      if (!rawPad) {
        // console.log("no valid pad");
        // console.dir(navigator.getGamepads());
        return;
      }

      if (dbgOnce("gamepad")) console.dir(rawPad);

      if (rawPad.axes.length !== 4) {
        dbgLogOnce("gamepadAxes", `gamepad needs 4 axis`, true);
        return;
      }

      if (rawPad.buttons.length < xboxLayout.length) {
        dbgLogOnce(
          "gamepadButtons",
          `assuming xbox layout, number of buttons: ${rawPad.buttons.length} vs. xbox num: ${xboxLayout.length}`,
          true
        );
        return;
      }

      gamepad.leftStick[0] = rawPad.axes[0];
      gamepad.leftStick[1] = -rawPad.axes[1];
      const lLen = V2.len(gamepad.leftStick);
      if (lLen > 1.0) V2.scale(gamepad.leftStick, 1 / lLen, gamepad.leftStick);

      // V2.norm(gamepad.leftStick, gamepad.leftStick);
      gamepad.rightStick[0] = rawPad.axes[2];
      gamepad.rightStick[1] = -rawPad.axes[3];
      const rLen = V2.len(gamepad.rightStick);
      if (rLen > 1.0)
        V2.scale(gamepad.rightStick, 1 / rLen, gamepad.rightStick);
      // V2.norm(gamepad.rightStick, gamepad.rightStick);

      // console.log(
      //   `l: ${vec2Dbg(res.gamepad.leftStick)}, r: ${vec2Dbg(
      //     res.gamepad.rightStick
      //   )}`
      // );

      // reset clicks
      for (let name of xboxLayout) {
        gamepad.btnClicks[name] = 0;
      }

      // check clicks and down
      for (let i = 0; i < rawPad.buttons.length; i++) {
        const btn = rawPad.buttons[i];

        const name = xboxLayout[i]; // TODO(@darzu): different layouts

        const wasPressed = gamepad.btnDowns[name];

        if (wasPressed && !btn.pressed) gamepad.btnClicks[name] += 1;

        gamepad.btnDowns[name] = btn.pressed;
      }
    }
  );
}
