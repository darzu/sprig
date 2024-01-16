import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16, randEndesga16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM, Entities, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { createHexGrid, hexXYZ, hexesWithin, xyToHex } from "../hex/hex.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { InputsDef } from "../input/inputs.js";
import { HasRudderDef, HasRudderObj, createRudder } from "../ld53/rudder.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, HexMesh, MastMesh } from "../meshes/mesh-list.js";
import { cloneMesh, normalizeMesh, scaleMesh3 } from "../meshes/mesh.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { CanManDef, raiseManTurret } from "../turret/turret.js";
import { assert } from "../utils/util.js";
import {
  addColliderDbgVis,
  addGizmoChild,
  addWorldGizmo,
  createBoxForAABB,
} from "../utils/utils-game.js";
import { HasMastDef, HasMastObj, createMast } from "../wind/mast.js";
import { WindDef } from "../wind/wind.js";
import { initGhost, initWorld } from "./graybox-helpers.js";
import {
  ObjDef,
  ObjEnt,
  ObjOpt,
  createObj,
  defineObj,
  mixinObj,
  testObjectTS,
} from "./objects.js";

const DBG_GHOST = true;
const DBG_GIZMO = true;

const SAIL_FURL_RATE = 0.02;

function createOcean() {
  const tileCS = [
    ColorDef,
    PositionDef,
    RenderableConstructDef,
    ScaleDef,
  ] as const;
  type typeT = EntityW<[...typeof tileCS]>;
  const createTile = (xyz: vec3.InputT) =>
    createObj(tileCS, [randEndesga16(), xyz, [HexMesh], V(1, 1, 1)]);
  const grid = createHexGrid<typeT>();
  const size = 1;

  for (let [q, r] of hexesWithin(0, 0, 4)) {
    // for (let [q, r] of [
    //   [0, 0],
    //   [0, 1],
    //   [0, 2],
    // ]) {
    const loc = hexXYZ(vec3.create(), q, r, size);
    const tile = createTile(loc);
    grid.set(q, r, tile);
    // const dbg = createBoxForAABB(HEX_AABB);
    // dbg.position[2] += 1;
    // EM.set(dbg, PhysicsParentDef, tile.id);
  }

  for (let x = -5; x < 5; x += 0.3) {
    for (let y = -5; y < 5; y += 0.3) {
      const [q, r] = xyToHex(x, y, size);
      const tile = grid.get(q, r);
      const color = tile ? tile.color : V(0, 0, 0);
      createObj(
        [PositionDef, ScaleDef, ColorDef, RenderableConstructDef] as const,
        [[x, y, 1], [0.1, 0.1, 0.1], color, [CubeMesh]]
      );
    }
  }
}

export async function initGrayboxShipArena() {
  initWorld();

  // ocean
  createOcean();

  EM.addResource(WindDef);

  const ship = await createShip();

  const res = await EM.whenResources(MeDef);

  const player = createObj(
    [
      ColorDef,
      PositionDef,
      RenderableConstructDef,
      CanManDef,
      AuthorityDef,
      PhysicsParentDef,
    ] as const,
    [ENDESGA16.darkGray, V(0, 0, 2), [BallMesh], undefined, res.me.pid, ship.id]
  );

  EM.ensureResource(LocalPlayerEntityDef, player.id);

  if (!DBG_GHOST) raiseManTurret(player, ship.hasRudder.rudder);

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  // testObjectTS();

  EM.addSystem(
    "controlShip",
    Phase.GAME_PLAYERS,
    [HasRudderDef, HasMastDef],
    [InputsDef],
    (es, res) => {
      if (es.length === 0) return;
      assert(es.length === 1);
      const ship = es[0];

      const mast = ship.hasMast.mast;
      const rudder = ship.hasRudder.rudder;

      // TODO(@darzu): how do we make this code re-usable across games and keybindings?
      // furl/unfurl
      if (rudder.turret.mannedId) {
        const sail = mast.mast.sail.sail;
        if (res.inputs.keyDowns["w"]) sail.unfurledAmount += SAIL_FURL_RATE;
        if (res.inputs.keyDowns["s"]) sail.unfurledAmount -= SAIL_FURL_RATE;
      }
    }
  );
}

const ShipObj = defineObj({
  name: "ship",
  components: [
    ColorDef,
    PositionDef,
    RenderableConstructDef,
    CameraFollowDef,
    LinearVelocityDef,
  ],
  physicsParentChildren: true,
} as const);

async function createShip() {
  const shipMesh = mkCubeMesh();
  scaleMesh3(shipMesh, [12, 24, 2]);

  const ship = ShipObj.new({
    args: {
      color: ENDESGA16.midBrown,
      position: [40, 40, 3],
      renderableConstruct: [shipMesh],
      cameraFollow: undefined,
      linearVelocity: undefined,
    },
  });

  const res = await EM.whenResources(MastMesh.def, MeDef);

  const mast = createMast(res);

  mixinObj(ship, HasMastObj, {
    args: [],
    children: {
      mast,
    },
  });

  const rudder = createRudder(res);
  // console.log("setting position");
  vec3.set(0, -25, 4, rudder.position);

  mixinObj(ship, HasRudderObj, {
    args: [],
    children: {
      rudder,
    },
  });

  vec3.copy(ship.cameraFollow.positionOffset, [0.0, -50.0, 0]);
  ship.cameraFollow.pitchOffset = -Math.PI * 0.25;

  if (DBG_GIZMO) addGizmoChild(ship, 10);

  return ship;
}
