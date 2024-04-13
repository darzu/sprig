import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { createObj } from "../graybox/objects.js";
import { V, V2, V3 } from "../matrix/sprig-matrix.js";
import { BallMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import {
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  sketch,
  sketchDot,
  sketchEntNow,
  sketchLine,
  sketchSvg,
} from "../utils/sketch.js";
import { dbgLogOnce, dbgOnce } from "../utils/util.js";
import { vec2Dbg } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";

const DBG_GHOST = true;

export const GamepadDef = EM.defineResource("gamepad", () => {
  return {
    leftStick: V(0, 0),
    rightStick: V(0, 0),
    btnClicks: {} as { [key: string]: number },
    btnDowns: {} as { [key: string]: boolean },
  };
});

export async function initLd55() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

  EM.addEagerInit([], [RendererDef], [], (res) => {
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
    ];
  });

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
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
  EM.set(pedestal, PositionDef, V(0, 0, -10 - 1));
  EM.set(pedestal, ScaleDef, V(20, 20, 10));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });

  // gizmo
  addWorldGizmo(V(0, 0, 0), 5);

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

  const radius = 10;
  const diam = radius * 2;
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
      position: [0, 0, 0],
      color: ENDESGA16.red,
      renderableConstruct: [BallMesh],
      scale: [0.2, 0.2, 1],
    }
  );
  const rightDot = createObj(
    [PositionDef, ColorDef, RenderableConstructDef, ScaleDef] as const,
    {
      position: [0, 0, 0],
      color: ENDESGA16.blue,
      renderableConstruct: [BallMesh],
      scale: [0.2, 0.2, 1],
    }
  );

  EM.addSystem(
    "updateStickDots",
    Phase.GAME_WORLD,
    null,
    [GamepadDef],
    (_, { gamepad }) => {
      leftDot.position[0] = gamepad.leftStick[0] * radius;
      leftDot.position[1] = gamepad.leftStick[1] * radius;

      rightDot.position[0] = gamepad.rightStick[0] * radius;
      rightDot.position[1] = gamepad.rightStick[1] * radius;

      sketchLine(leftDot.position, rightDot.position, {
        key: "hoverLine",
        color: ENDESGA16.lightGreen,
      });
    }
  );
}

const xboxLayout = [
  "DPad-Up",
  "DPad-Down",
  "DPad-Left",
  "DPad-Right",
  "Start",
  "Back",
  "Axis-Left",
  "Axis-Right",
  "LB",
  "RB",
  "Power",
  "A",
  "B",
  "X",
  "Y",
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

  EM.addResource(GamepadDef);

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

      // TODO(@darzu):
      // for (let i = 0; i < pad.buttons.length; i++) {
      //   const btn = pad.buttons[i];

      // }
    }
  );
}
