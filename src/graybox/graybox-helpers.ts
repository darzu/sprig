import {
  CameraDef,
  CameraFollowDef,
  CameraSetting,
  applyCameraSettings,
  getCameraSettings,
} from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { GhostDef, createGhost } from "../debug/ghost.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { _ComponentDef } from "../net/components.js";
import { Phase } from "../ecs/sys-phase.js";
import { quat, V3 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh } from "../meshes/mesh-list.js";
import { HEX_AABB } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  MeshLike,
} from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { Intersect, assert } from "../utils/util.js";
import { vec3Dbg, vec4Dbg } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj } from "./objects.js";

export function createSun() {
  const sun = createObj(
    [PointLightDef, ColorDef, PositionDef, RenderableConstructDef] as const,
    [
      {
        constant: 1.0,
        linear: 0.0,
        quadratic: 0.0,
        ambient: V(0.2, 0.2, 0.2),
        diffuse: V(0.5, 0.5, 0.5),
      },
      [1, 1, 1],
      [50, 10, 300],
      [CubeMesh, false],
    ]
  );

  return sun;
}

// hover near origin
const defaultCam: CameraSetting = {
  position: [7.97, -12.45, 10.28],
  rotation: [0.0, 0.0, 0.27, 0.96],
  positionOffset: [0.0, 0.0, 0.0],
  yawOffset: 0.0,
  pitchOffset: -0.55,
};

export function initGhost(mesh?: MeshLike) {
  const g = createGhost(mesh ?? CubeMesh);
  g.controllable.speed *= 10;
  g.controllable.sprintMul = 0.2;

  const gameName = (globalThis as any).GAME; // TODO(@darzu): HACK

  // TODO(@darzu): ABSTRACT / GENERALIZE so other systems can save/load state
  const storageKey = `ghostCam_${gameName}`;

  let ghostCam: CameraSetting;
  let ghostCamStr = localStorage.getItem(storageKey);
  if (!ghostCamStr) {
    ghostCam = defaultCam;
  } else {
    // TODO(@darzu): VALIDATE!
    ghostCam = JSON.parse(ghostCamStr) as CameraSetting;
  }
  applyCameraSettings(g, ghostCam);

  let _lastSettings = "";
  EM.addSystem(
    "saveGhostCamera",
    Phase.GAME_WORLD,
    [GhostDef, PositionDef, RotationDef, CameraFollowDef],
    [TimeDef],
    (es, res) => {
      // save once every ~second
      if (res.time.step % 60 !== 0) return;
      if (!es.length) return;
      assert(es.length === 1);
      const e = es[0];

      // get settings
      const settings = getCameraSettings(e);
      const str = JSON.stringify(settings);

      // have settings changed?
      if (str == _lastSettings) return;

      // save
      localStorage.setItem(storageKey, str);
    }
  );

  return g;
}
