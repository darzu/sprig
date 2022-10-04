import { CameraDef, CameraFollowDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeletedDef } from "../delete.js";
import { createRef } from "../em_helpers.js";
import { EM, Entity, EntityManager, EntityW } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import { MusicDef, randChordId } from "../music.js";
import {
  createAABB,
  copyAABB,
  AABB,
  updateAABBWithPoint,
  aabbCenter,
} from "../physics/broadphase.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import {
  cloneMesh,
  getAABBFromMesh,
  getHalfsizeFromAABB,
  Mesh,
  meshStats,
  normalizeMesh,
  scaleMesh3,
  transformMesh,
  validateMesh,
} from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderDataStdDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../test.js";
import { TimeDef } from "../time.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  createWoodHealth,
  getBoardsFromMesh,
  registerDestroyPirateHandler,
  reserveSplinterSpace,
  SplinterParticleDef,
  TimberBuilder,
  unshareProvokingForWood,
  WoodHealthDef,
  WoodStateDef,
  _numSplinterEnds,
} from "../wood.js";
import { AssetsDef, BLACK } from "./assets.js";
import {
  breakBullet,
  BulletConstructDef,
  BulletDef,
  fireBullet,
} from "./bullet.js";
import { ControllableDef } from "./controllable.js";
import { createGhost, GhostDef } from "./game-sandbox.js";
import { GravityDef } from "./gravity.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { LifetimeDef } from "./lifetime.js";
import { createPlayer, LocalPlayerDef, PlayerDef } from "./player.js";
import { TextDef } from "./ui.js";

/*
  TODO:
  [ ] PERF: sub-meshes
  [ ] PERF: bullets pool

  [ ] Player can walk on ship
  [ ] Player can fire cannon
  [ ] Show controls, describe objective
  [ ] PERF: Splinters pool
  [ ] PERF: splinter end pool 
  [ ] Planks can be repaired
  [ ] Can destroy enemies
  [x] cannon ball can't destroy everything
  [ ] cannon balls explode
  [ ] cannon balls drop and can be picked up
  [ ] Enemies spawn
  [ ] PERF: pool enemy ships
  [ ] PERF: board AABB check
  [ ] ship total health check
  [ ] Sound!
  [ ] close ship

  [ ] change wood colors
  [ ] adjust ship size
  [ ] add dark ends
*/

// TODO(@darzu): GHOST MODE
const DBG_PLAYER = true;

// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const sandboxSystems: string[] = [];

export const LD51CannonDef = EM.defineComponent("ld51Cannon", () => {
  return {};
});

let pirateKills = 0;
let healthPercent = 100;

let _numGoodBalls = 0;
const MAX_GOODBALLS = 10;

export async function initLD51Game(em: EntityManager, hosting: boolean) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  const res = await em.whenResources(
    AssetsDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef
  );

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const sunlight = em.newEntity();
  em.ensureComponentOn(sunlight, PointLightDef);
  // sunlight.pointLight.constant = 1.0;
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.4, 0.4, 0.4]);
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.ensureComponentOn(sunlight, PositionDef, [50, 100, 10]);
  em.ensureComponentOn(sunlight, RenderableConstructDef, res.assets.ball.proto);

  // const c = res.globalCursor3d.cursor()!;
  // if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const ground = em.newEntity();
  const groundMesh = cloneMesh(res.assets.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(
      tempMat4(),
      quat.IDENTITY,
      [0, -2, 0],
      [20, 2, 20]
    )
  );
  em.ensureComponentOn(ground, RenderableConstructDef, groundMesh);
  em.ensureComponentOn(ground, ColorDef, vec3.clone(ENDESGA16.blue));
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(ground, PositionDef, [0, 0, 0]);
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // const cube = em.newEntity();
  // const cubeMesh = cloneMesh(res.assets.cube.mesh);
  // em.ensureComponentOn(cube, RenderableConstructDef, cubeMesh);
  // em.ensureComponentOn(cube, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(cube, PositionDef, [0, 0, 3]);
  // em.ensureComponentOn(cube, RotationDef);
  // em.ensureComponentOn(cube, AngularVelocityDef, [0, 0.001, 0.001]);
  // em.ensureComponentOn(cube, WorldFrameDef);
  // em.ensureComponentOn(cube, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.cube.aabb,
  // });

  // em.ensureComponentOn(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  // TODO(@darzu): timber system here!
  // const sphereMesh = cloneMesh(res.assets.ball.mesh);
  // const visible = false;
  // em.ensureComponentOn(_player, RenderableConstructDef, sphereMesh, visible);
  // em.ensureComponentOn(_player, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(_player, PositionDef, [0, 0, 0]);
  // // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
  // em.ensureComponentOn(_player, WorldFrameDef);
  // // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
  // em.ensureComponentOn(_player, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.ball.aabb,
  // });
  // randomizeMeshColors(b2);

  // em.ensureComponentOn(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  // TIMBER
  const timber = em.newEntity();
  const _timberMesh = createEmptyMesh("homeShip");
  // RIBS
  const ribWidth = 0.5;
  const ribDepth = 0.4;
  const builder = createTimberBuilder(_timberMesh);
  builder.width = ribWidth;
  builder.depth = ribDepth;
  const ribCount = 10;
  const ribSpace = 3;
  for (let i = 0; i < ribCount; i++) {
    mat4.identity(builder.cursor);
    mat4.translate(builder.cursor, builder.cursor, [i * ribSpace, 0, 0]);
    appendTimberRib(builder, true);
  }
  for (let i = 0; i < ribCount; i++) {
    mat4.identity(builder.cursor);
    // mat4.scale(builder.cursor, builder.cursor, [1, 1, -1]);
    mat4.translate(builder.cursor, builder.cursor, [i * ribSpace, 0, 0]);
    appendTimberRib(builder, false);
  }
  // FLOOR
  const floorPlankCount = 7;
  const floorSpace = 1.24;
  const floorLength = ribSpace * (ribCount - 1) + ribWidth * 2.0;
  const floorSegCount = 12;
  const floorHeight = 3.2;
  builder.width = 0.6;
  builder.depth = 0.2;
  for (let i = 0; i < floorPlankCount; i++) {
    mat4.identity(builder.cursor);
    mat4.translate(builder.cursor, builder.cursor, [
      -ribWidth,
      floorHeight - builder.depth,
      (i - (floorPlankCount - 1) * 0.5) * floorSpace + jitter(0.01),
    ]);
    appendTimberFloorPlank(builder, floorLength, floorSegCount);
  }
  const floorWidth = floorPlankCount * floorSpace;
  // CEILING
  const ceilPlankCount = 8;
  const ceilSpace = 1.24;
  const ceilLength = ribSpace * (ribCount - 1) + ribWidth * 2.0;
  const ceilSegCount = 12;
  const ceilHeight = 12;
  for (let i = 0; i < ceilPlankCount; i++) {
    mat4.identity(builder.cursor);
    mat4.translate(builder.cursor, builder.cursor, [
      -ribWidth,
      ceilHeight,
      (i - (ceilPlankCount - 1) * 0.5) * ceilSpace + jitter(0.01),
    ]);
    builder.width = 0.6;
    builder.depth = 0.2;
    appendTimberFloorPlank(builder, ceilLength, ceilSegCount);
  }
  // WALLS
  // TODO(@darzu): keep in sync with rib path
  const wallLength = floorLength;
  const wallSegCount = 8;
  // for (let i = 0; i < 6; i++) {
  // mat4.identity(builder.cursor);
  // mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
  builder.width = 0.45;
  builder.depth = 0.2;
  for (let ccwi = 0; ccwi < 2; ccwi++) {
    const ccw = ccwi === 0;
    const ccwf = ccw ? -1 : 1;
    let xFactor = 0.05;

    const wallOffset: vec3 = [-ribWidth, 0, ribDepth * -ccwf];

    const cursor2 = mat4.create();
    mat4.rotateX(cursor2, cursor2, Math.PI * 0.4 * -ccwf);

    // mat4.copy(builder.cursor, cursor2);
    // mat4.translate(builder.cursor, builder.cursor, wallOffset);
    // appendTimberWallPlank(builder, wallLength, wallSegCount);

    mat4.copy(builder.cursor, cursor2);
    mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
    // mat4.rotateX(builder.cursor, builder.cursor, Math.PI * xFactor * ccwf);
    mat4.translate(builder.cursor, builder.cursor, wallOffset);
    appendTimberWallPlank(builder, wallLength, wallSegCount, -1);

    for (let i = 0; i < numRibSegs; i++) {
      mat4.translate(cursor2, cursor2, [0, 2, 0]);
      mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);

      // plank 1
      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, wallLength, wallSegCount, i);

      // plank 2
      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
      mat4.rotateX(
        builder.cursor,
        builder.cursor,
        Math.PI * xFactor * 1.0 * ccwf
      );
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, wallLength, wallSegCount, i + 0.5);

      mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);
      xFactor = xFactor - 0.005;
    }
    mat4.translate(cursor2, cursor2, [0, 2, 0]);
  }
  // }

  // FRONT AND BACK WALL
  let _floorWidth = floorWidth;
  {
    let wallSegCount = 6;
    let numRibSegs = 6;
    let floorWidth = _floorWidth + 4;
    for (let ccwi = 0; ccwi < 2; ccwi++) {
      const ccw = ccwi === 0;
      const ccwf = ccw ? -1 : 1;
      let xFactor = 0.05;

      const wallOffset: vec3 = [-ribWidth, 0, ribDepth * -ccwf];

      const cursor2 = mat4.create();
      // mat4.rotateX(cursor2, cursor2, Math.PI * 0.4 * -ccwf);
      mat4.rotateY(cursor2, cursor2, Math.PI * 0.5);
      if (ccw) {
        mat4.translate(cursor2, cursor2, [0, 0, floorLength - ribWidth * 2.0]);
      }
      mat4.translate(cursor2, cursor2, [-6, 0, 0]);

      mat4.copy(builder.cursor, cursor2);
      mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
      // mat4.rotateX(builder.cursor, builder.cursor, Math.PI * xFactor * ccwf);
      mat4.translate(builder.cursor, builder.cursor, wallOffset);
      appendTimberWallPlank(builder, floorWidth, wallSegCount, -1);

      for (let i = 0; i < numRibSegs; i++) {
        mat4.translate(cursor2, cursor2, [0, 2, 0]);
        // mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);

        // plank 1
        mat4.copy(builder.cursor, cursor2);
        mat4.translate(builder.cursor, builder.cursor, wallOffset);
        appendTimberWallPlank(builder, floorWidth, wallSegCount, i);

        // plank 2
        mat4.copy(builder.cursor, cursor2);
        mat4.translate(builder.cursor, builder.cursor, [0, 1, 0]);
        // mat4.rotateX(
        //   builder.cursor,
        //   builder.cursor,
        //   Math.PI * xFactor * 1.0 * ccwf
        // );
        mat4.translate(builder.cursor, builder.cursor, wallOffset);
        appendTimberWallPlank(builder, floorWidth, wallSegCount, i + 0.5);

        // mat4.rotateX(cursor2, cursor2, Math.PI * xFactor * ccwf);
        // xFactor = xFactor - 0.005;
      }
      mat4.translate(cursor2, cursor2, [0, 2, 0]);
    }
  }

  _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
  const timberState = getBoardsFromMesh(_timberMesh);
  unshareProvokingForWood(_timberMesh, timberState);
  // console.log(`before: ` + meshStats(_timberMesh));
  // const timberMesh = normalizeMesh(_timberMesh);
  // console.log(`after: ` + meshStats(timberMesh));
  const timberMesh = _timberMesh as Mesh;
  timberMesh.usesProvoking = true;

  reserveSplinterSpace(timberState, 200);
  validateMesh(timberState.mesh);

  em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
  em.ensureComponentOn(timber, WoodStateDef, timberState);
  em.ensureComponentOn(timber, ColorDef, vec3.clone(ENDESGA16.darkBrown));
  // em.ensureComponentOn(timber, ColorDef, [0.1, 0.1, 0.1]);
  // const scale = 1 * Math.pow(0.8, ti);
  const scale = 1;
  const timberAABB = getAABBFromMesh(timberMesh);
  // const timberPos = getCenterFromAABB(timberAABB);
  const timberPos = vec3.create();
  // const timberPos = vec3.clone(res.assets.timber_rib.center);
  // vec3.negate(timberPos, timberPos);
  // vec3.scale(timberPos, timberPos, scale);
  timberPos[1] += 1;
  timberPos[0] -= ribCount * 0.5 * ribSpace;
  // timberPos[2] -= floorPlankCount * 0.5 * floorSpace;
  em.ensureComponentOn(timber, PositionDef, timberPos);
  // em.ensureComponentOn(timber, PositionDef, [0, 0, -4]);
  em.ensureComponentOn(timber, RotationDef);
  em.ensureComponentOn(timber, ScaleDef, [scale, scale, scale]);
  em.ensureComponentOn(timber, WorldFrameDef);
  em.ensureComponentOn(timber, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: timberAABB,
  });
  const timberHealth = createWoodHealth(timberState);
  em.ensureComponentOn(timber, WoodHealthDef, timberHealth);

  // CANNONS
  const realCeilHeight = ceilHeight + timberPos[1];
  const realFloorHeight = timberPos[1] + floorHeight;
  for (let i = 0; i < 2; i++) {
    const isLeft = i === 0 ? 1 : -1;
    const cannon = em.newEntity();
    em.ensureComponentOn(
      cannon,
      RenderableConstructDef,
      res.assets.ld51_cannon.proto
    );
    em.ensureComponentOn(cannon, PositionDef, [
      -7.5,
      realFloorHeight + 2,
      -4 * isLeft,
    ]);
    em.ensureComponentOn(cannon, RotationDef);
    quat.rotateX(cannon.rotation, cannon.rotation, Math.PI * 0.01 * isLeft);
    if (isLeft !== 1) {
      quat.rotateY(cannon.rotation, cannon.rotation, Math.PI);
    }
    em.ensureComponentOn(cannon, ColorDef, vec3.clone(ENDESGA16.darkGreen));
    // TODO(@darzu): USE PALETTE PROPERLY
    vec3.scale(cannon.color, cannon.color, 0.5);
    {
      const interactBox = EM.newEntity();
      const interactAABB = copyAABB(createAABB(), res.assets.ld51_cannon.aabb);
      vec3.scale(interactAABB.min, interactAABB.min, 2);
      vec3.scale(interactAABB.max, interactAABB.max, 2);
      EM.ensureComponentOn(interactBox, PhysicsParentDef, cannon.id);
      EM.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
      EM.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(cannon, InteractableDef, interactBox.id);
    }
    em.ensureComponentOn(cannon, LD51CannonDef);
  }

  em.registerSystem(
    [LD51CannonDef, WorldFrameDef, InRangeDef],
    [InputsDef, LocalPlayerDef, MusicDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (
          player.player.holdingBall &&
          c.inRange &&
          res.inputs.lclick /* && c.cannonLocal.fireMs <= 0*/
        ) {
          const ballHealth = 2.0;

          let bulletAxis = vec3.fromValues(0, 0, -1);
          vec3.transformQuat(bulletAxis, bulletAxis, c.world.rotation);
          vec3.normalize(bulletAxis, bulletAxis);
          const bulletPos = vec3.clone(c.world.position);
          vec3.scale(bulletAxis, bulletAxis, 2);
          vec3.add(bulletPos, bulletPos, bulletAxis);

          fireBullet(
            em,
            1,
            bulletPos,
            c.world.rotation,
            0.05,
            0.02,
            3,
            ballHealth
          );

          // remove player ball
          const heldBall = EM.findEntity(player.player.holdingBall, []);
          if (heldBall) {
            EM.ensureComponentOn(heldBall, DeletedDef);
            _numGoodBalls--;
          }

          player.player.holdingBall = 0;

          // c.cannonLocal.fireMs = c.cannonLocal.fireDelayMs;

          const chord = randChordId();
          res.music.playChords([chord], "major", 2.0, 3.0, -2);
        }
      }
    },
    "ld51PlayerFireCannon"
  );
  sandboxSystems.push("ld51PlayerFireCannon");

  const splinterObjId = 7654;
  em.registerSystem(
    [
      SplinterParticleDef,
      LinearVelocityDef,
      AngularVelocityDef,
      GravityDef,
      PositionDef,
      RotationDef,
      RenderDataStdDef,
    ],
    [],
    (splinters, res) => {
      for (let s of splinters) {
        if (s.position[1] <= 0) {
          em.removeComponent(s.id, LinearVelocityDef);
          em.removeComponent(s.id, GravityDef);
          em.removeComponent(s.id, AngularVelocityDef);

          s.position[1] = 0;
          quat.identity(s.rotation);
          quat.rotateX(s.rotation, s.rotation, Math.PI * 0.5);
          quat.rotateZ(s.rotation, s.rotation, Math.PI * Math.random());
          s.renderDataStd.id = splinterObjId; // stops z-fighting
          // console.log("freeze!");
        }
      }
    },
    "splintersOnFloor"
  );
  sandboxSystems.push("splintersOnFloor");

  // const quadIdsNeedReset = new Set<number>();

  // assert(_player?.collider.shape === "AABB");
  // console.dir(ghost.collider.aabb);

  em.registerSystem(
    [GhostDef, WorldFrameDef, ColliderDef],
    [InputsDef, CanvasDef],
    (ps, { inputs, htmlCanvas }) => {
      if (!ps.length) return;

      const ghost = ps[0];

      if (inputs.lclick && htmlCanvas.hasFirstInteraction) {
        // console.log(`fire!`);
        const firePos = ghost.world.position;
        const fireDir = quat.create();
        quat.copy(fireDir, ghost.world.rotation);
        const ballHealth = 2.0;
        fireBullet(em, 1, firePos, fireDir, 0.05, 0.02, 3, ballHealth);
      }
    },
    "ld51Ghost"
  );
  if (DBG_PLAYER) sandboxSystems.push("ld51Ghost");

  // TODO(@darzu): breakBullet
  em.registerSystem(
    [BulletDef, ColorDef, WorldFrameDef, LinearVelocityDef],
    [],
    (es, res) => {
      for (let b of es) {
        if (b.bullet.health <= 0) {
          breakBullet(b);
        }
      }
    },
    "breakBullets"
  );
  sandboxSystems.push("breakBullets");

  // Create player
  {
    const ColWallDef = em.defineComponent("ColWall", () => ({}));

    // create ship bounds
    const colFloor = em.newEntity();
    const flAABB: AABB = {
      // prettier-ignore
      min: [
        -floorLength * 0.5 - ribWidth * 3.0,
        0, 
        -floorWidth * 0.5
      ],
      max: [
        +floorLength * 0.5 - ribWidth * 3.0,
        realFloorHeight,
        +floorWidth * 0.5,
      ],
    };
    em.ensureComponentOn(colFloor, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: flAABB,
    });
    em.ensureComponentOn(colFloor, PositionDef);
    em.ensureComponentOn(colFloor, ColWallDef);

    const colLeftWall = em.newEntity();
    em.ensureComponentOn(colLeftWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: [flAABB.min[0], realFloorHeight + 0.5, flAABB.min[2] - 2],
        max: [flAABB.max[0], realCeilHeight, flAABB.min[2]],
      },
    });
    em.ensureComponentOn(colLeftWall, PositionDef);
    em.ensureComponentOn(colLeftWall, ColWallDef);

    const colRightWall = em.newEntity();
    em.ensureComponentOn(colRightWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: [flAABB.min[0], realFloorHeight + 0.5, flAABB.max[2]],
        max: [flAABB.max[0], realCeilHeight, flAABB.max[2] + 2],
      },
    });
    em.ensureComponentOn(colRightWall, PositionDef);
    em.ensureComponentOn(colRightWall, ColWallDef);

    const colFrontWall = em.newEntity();
    em.ensureComponentOn(colFrontWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: [flAABB.max[0], realFloorHeight + 0.5, flAABB.min[2] + 0.5],
        max: [flAABB.max[0] + 2, realCeilHeight, flAABB.max[2] - 0.5],
      },
    });
    em.ensureComponentOn(colFrontWall, PositionDef);
    em.ensureComponentOn(colFrontWall, ColWallDef);

    const colBackWall = em.newEntity();
    em.ensureComponentOn(colBackWall, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: {
        min: [flAABB.min[0] - 2, realFloorHeight + 0.5, flAABB.min[2] + 0.5],
        max: [flAABB.min[0], realCeilHeight, flAABB.max[2] - 0.5],
      },
    });
    em.ensureComponentOn(colBackWall, PositionDef);
    em.ensureComponentOn(colBackWall, ColWallDef);

    // debugVizAABB(colFloor);
    // debugVizAABB(colLeftWall);
    // debugVizAABB(colRightWall);
    // debugVizAABB(colFrontWall);
    // debugVizAABB(colBackWall);

    function debugVizAABB(aabbEnt: EntityW<[typeof ColliderDef]>) {
      // debug render floor
      const mesh = cloneMesh(res.assets.cube.mesh);
      assert(aabbEnt.collider.shape === "AABB");
      const size = getHalfsizeFromAABB(aabbEnt.collider.aabb);
      const center = aabbCenter(tempVec3(), aabbEnt.collider.aabb);
      scaleMesh3(mesh, size);
      transformMesh(mesh, mat4.fromTranslation(tempMat4(), center));
      em.ensureComponentOn(aabbEnt, RenderableConstructDef, mesh);
      em.ensureComponentOn(aabbEnt, ColorDef, vec3.clone(ENDESGA16.orange));
    }

    // BULLET VS COLLIDERS
    {
      const colLeftMid = aabbCenter(
        vec3.create(),
        (colLeftWall.collider as AABBCollider).aabb
      );
      const colRightMid = aabbCenter(
        vec3.create(),
        (colRightWall.collider as AABBCollider).aabb
      );
      const colFrontMid = aabbCenter(
        vec3.create(),
        (colFrontWall.collider as AABBCollider).aabb
      );
      const colBackMid = aabbCenter(
        vec3.create(),
        (colBackWall.collider as AABBCollider).aabb
      );

      em.registerSystem(
        [
          BulletConstructDef,
          BulletDef,
          ColorDef,
          LinearVelocityDef,
          GravityDef,
          WorldFrameDef,
        ],
        [PhysicsResultsDef],
        (es, res) => {
          for (let b of es) {
            if (b.bulletConstruct.team !== 2) continue;
            const hits = res.physicsResults.collidesWith.get(b.id);
            if (hits) {
              const walls = hits
                .map((h) => em.findEntity(h, [ColWallDef, WorldFrameDef]))
                .filter((b) => {
                  return b;
                });
              if (walls.length) {
                const targetSide =
                  vec3.sqrDist(b.bulletConstruct.location, colRightMid) >
                  vec3.sqrDist(b.bulletConstruct.location, colLeftMid)
                    ? colRightWall
                    : colLeftWall;
                const targetFrontBack =
                  vec3.sqrDist(b.bulletConstruct.location, colFrontMid) >
                  vec3.sqrDist(b.bulletConstruct.location, colBackMid)
                    ? colFrontWall
                    : colBackWall;

                for (let w of walls) {
                  assert(w);
                  if (w.id === targetSide.id || w.id === targetFrontBack.id) {
                    vec3.zero(b.linearVelocity);
                    vec3.zero(b.gravity);
                    if (_numGoodBalls < MAX_GOODBALLS) {
                      em.ensureComponentOn(b, DeletedDef);
                      spawnGoodBall(b.world.position);
                    } else {
                      breakBullet(b);
                    }
                  }
                }
              }
            }
          }
        },
        "bulletBounce"
      );
      sandboxSystems.push("bulletBounce");
    }

    // TODO(@darzu): use a pool for goodballs
    const GoodBallDef = EM.defineComponent("goodBall", () => true);
    function spawnGoodBall(pos: vec3) {
      _numGoodBalls++;
      const ball = em.newEntity();
      em.ensureComponentOn(ball, RenderableConstructDef, res.assets.ball.proto);
      em.ensureComponentOn(ball, ColorDef, vec3.clone(ENDESGA16.orange));
      em.ensureComponentOn(ball, PositionDef, vec3.clone(pos));
      em.ensureComponentOn(ball, GoodBallDef);
      em.ensureComponentOn(ball, LinearVelocityDef);
      em.ensureComponentOn(ball, GravityDef, [0, -3, 0]);
      const interactBox = EM.newEntity();
      const interactAABB = copyAABB(createAABB(), res.assets.ball.aabb);
      vec3.scale(interactAABB.min, interactAABB.min, 2);
      vec3.scale(interactAABB.max, interactAABB.max, 2);
      EM.ensureComponentOn(interactBox, PhysicsParentDef, ball.id);
      EM.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
      EM.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(ball, InteractableDef, interactBox.id);
      // em.ensureComponentOn(ball, WorldFrameDef);
    }

    // starter ammo
    {
      assert(colFloor.collider.shape === "AABB");
      for (let i = 0; i < 3; i++) {
        const pos: vec3 = [
          colFloor.collider.aabb.max[0] - 2,
          colFloor.collider.aabb.max[1] + 2,
          colFloor.collider.aabb.max[2] - 2 * i - 3,
        ];
        spawnGoodBall(pos);
      }
    }

    em.registerSystem(
      [GoodBallDef, PositionDef, GravityDef, LinearVelocityDef],
      [],
      (es, res) => {
        // TODO(@darzu):
        for (let ball of es) {
          if (PhysicsParentDef.isOn(ball)) continue; // being held
          if (ball.position[1] <= realFloorHeight + 1) {
            ball.position[1] = realFloorHeight + 1;
            vec3.zero(ball.linearVelocity);
            vec3.zero(ball.gravity);
            em.removeComponent(ball.id, GravityDef);
          }
        }
      },
      "fallingGoodBalls"
    );
    sandboxSystems.push("fallingGoodBalls");

    em.registerSystem(
      [GoodBallDef, InteractableDef, InRangeDef, PositionDef],
      [InputsDef, LocalPlayerDef],
      (es, res) => {
        const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
        if (!player) return;
        if (player.player.holdingBall) return;
        // TODO(@darzu):
        if (res.inputs.lclick) {
          for (let ball of es) {
            if (PhysicsParentDef.isOn(ball)) continue;
            // pick up this ball
            player.player.holdingBall = ball.id;
            em.ensureComponentOn(ball, PhysicsParentDef, player.id);
            vec3.set(ball.position, 0, 0, -1);
            em.ensureComponentOn(ball, ScaleDef, [0.4, 0.4, 0.4]);
            em.removeComponent(ball.id, InteractableDef);
          }
        }
      },
      "pickUpBalls"
    );
    sandboxSystems.push("pickUpBalls");

    if (DBG_PLAYER) {
      const ghost = createGhost(em);
      vec3.copy(ghost.position, [0, 1, -1.2]);
      quat.setAxisAngle(ghost.rotation, [0.0, -1.0, 0.0], 1.62);
      ghost.cameraFollow.positionOffset = [0, 0, 5];
      ghost.controllable.speed *= 0.5;
      ghost.controllable.sprintMul = 10;
      const sphereMesh = cloneMesh(res.assets.ball.mesh);
      const visible = false;
      em.ensureComponentOn(ghost, RenderableConstructDef, sphereMesh, visible);
      em.ensureComponentOn(ghost, ColorDef, [0.1, 0.1, 0.1]);
      em.ensureComponentOn(ghost, PositionDef, [0, 0, 0]);
      // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
      em.ensureComponentOn(ghost, WorldFrameDef);
      // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
      em.ensureComponentOn(ghost, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.assets.ball.aabb,
      });
    }

    if (!DBG_PLAYER) {
      const _player = createPlayer(em);
      vec3.set(_player.playerProps.location, -10, realFloorHeight + 6, 0);
      em.whenEntityHas(
        _player,
        PositionDef,
        RotationDef,
        CameraFollowDef,
        ControllableDef,
        ColliderDef
      ).then((player) => {
        console.log(`init player?`);
        Object.assign(player.controllable.modes, {
          canCameraYaw: false,
          canFall: true,
          // canFly: true,
          canFly: false,
          canJump: false,
          canMove: true,
          canPitch: true,
          canSprint: true,
          canYaw: true,
        });
        quat.rotateY(player.rotation, player.rotation, Math.PI * 0.5);

        player.collider.solid = true;
        // player.cameraFollow.positionOffset = [0, 0, 5];
        // g.controllable.modes.canYaw = false;
        // g.controllable.modes.canCameraYaw = true;
        // g.controllable.modes.canPitch = true;
        // player.controllable.speed *= 0.5;
        // player.controllable.sprintMul = 10;
      });
    }
  }

  startPirates();

  const startHealth = getCurrentHealth();
  {
    em.registerSystem(
      [],
      [InputsDef, TextDef, TimeDef],
      (es, res) => {
        // const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
        // if (!player) return;

        const currentHealth = getCurrentHealth();
        healthPercent = (currentHealth / startHealth) * 100;
        // console.log(`healthPercent: ${healthPercent}`);

        const elapsed = nextSpawn - res.time.time;
        const elapsedPer = Math.min(Math.ceil((elapsed / spawnTimer) * 10), 10);

        res.text.upperText = `Hull %${healthPercent.toFixed(
          1
        )}, Kills ${pirateKills}, !${elapsedPer}`;

        if (DBG_PLAYER) {
          // TODO(@darzu): IMPL
          res.text.lowerText = `splinterEnds: ${_numSplinterEnds}, goodballs: ${_numGoodBalls}`;
        } else {
          res.text.lowerText = `WASD+Shift; left click to pick up cannon balls and fire the cannons. Survive! They attack like clockwork.`;
        }

        if (healthPercent < 20) {
          alert(
            `You've been sunk! You killed ${pirateKills} and lasted ${(
              res.time.time / 1000
            ).toFixed(1)} seconds. Thanks for playing! Refresh to try again.`
          );
        }
      },
      "progressGame"
    );
    sandboxSystems.push("progressGame");
  }

  function getCurrentHealth() {
    let health = 0;
    for (let b of timberHealth.boards) {
      for (let s of b) {
        health += s.health;
      }
    }
    return health;
  }
}

export function appendPirateShip(b: TimberBuilder) {
  const firstQuadIdx = b.mesh.quad.length;

  const length = 18;

  b.width = 0.6;
  b.depth = 0.2;

  // TODO(@darzu): IMPL
  const xFactor = 0.333;

  const cursor2 = mat4.create();

  mat4.rotateZ(cursor2, cursor2, Math.PI * 1.5);
  mat4.rotateX(cursor2, cursor2, Math.PI * xFactor);
  // mat4.rotateX(b.cursor, b.cursor, Math.PI * -0.3 * 0.5);

  for (let hi = 0; hi < 5; hi++) {
    let numSegs = hi === 0 || hi === 4 ? 6 : 5;
    const midness = 2 - Math.floor(Math.abs(hi - 2));
    const segLen = length / 5 + midness * 0.2;
    mat4.copy(b.cursor, cursor2);
    const aabb: AABB = createAABB();
    const firstVi = b.mesh.pos.length;
    b.addLoopVerts();
    b.addEndQuad(true);
    for (let i = 0; i < numSegs; i++) {
      mat4.translate(b.cursor, b.cursor, [0, segLen, 0]);
      mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * 0.5);
      b.addLoopVerts();
      b.addSideQuads();
      mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * 0.5);
    }
    b.addEndQuad(false);

    // TODO(@darzu): hACK?
    // shift wood to center
    for (let vi = firstVi; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      updateAABBWithPoint(aabb, p);
    }
    const mid = aabbCenter(tempVec3(), aabb);
    mid[1] = 0;
    for (let vi = firstVi; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      vec3.sub(p, p, mid);
    }

    mat4.translate(cursor2, cursor2, [-(b.width * 2.0 + 0.05), 0, 0]);
  }

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  return b.mesh;
}

export function appendTimberWallPlank(
  b: TimberBuilder,
  length: number,
  numSegs: number,
  plankIdx: number
) {
  const firstQuadIdx = b.mesh.quad.length;

  // mat4.rotateY(b.cursor, b.cursor, Math.PI * 0.5);
  // mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.5);
  mat4.rotateZ(b.cursor, b.cursor, Math.PI * 1.5);

  b.addLoopVerts();
  b.addEndQuad(true);

  const segLen = length / numSegs;

  for (let i = 0; i < numSegs; i++) {
    if (i === 2 && 3 <= plankIdx && plankIdx <= 4) {
      // hole
      b.addEndQuad(false);
      mat4.translate(b.cursor, b.cursor, [0, segLen * 0.55, 0]);
      b.addLoopVerts();
      b.addEndQuad(true);
      mat4.translate(b.cursor, b.cursor, [0, segLen * 0.45, 0]);
    } else {
      // normal
      mat4.translate(b.cursor, b.cursor, [0, segLen, 0]);
      b.addLoopVerts();
      b.addSideQuads();
    }
  }

  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  // console.dir(b.mesh);

  return b.mesh;
}

export function appendTimberFloorPlank(
  b: TimberBuilder,
  length: number,
  numSegs: number
) {
  const firstQuadIdx = b.mesh.quad.length;

  mat4.rotateY(b.cursor, b.cursor, Math.PI * 0.5);
  mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.5);

  b.addLoopVerts();
  b.addEndQuad(true);

  const segLen = length / numSegs;

  for (let i = 0; i < numSegs; i++) {
    mat4.translate(b.cursor, b.cursor, [0, segLen, 0]);
    b.addLoopVerts();
    b.addSideQuads();
  }

  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  // console.dir(b.mesh);

  return b.mesh;
}

const numRibSegs = 8;

export function appendTimberRib(b: TimberBuilder, ccw: boolean) {
  const firstQuadIdx = b.mesh.quad.length;

  const ccwf = ccw ? -1 : 1;

  mat4.rotateX(b.cursor, b.cursor, Math.PI * 0.4 * -ccwf);

  b.addLoopVerts();
  b.addEndQuad(true);
  let xFactor = 0.05;
  for (let i = 0; i < numRibSegs; i++) {
    mat4.translate(b.cursor, b.cursor, [0, 2, 0]);
    mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * ccwf);
    b.addLoopVerts();
    b.addSideQuads();
    mat4.rotateX(b.cursor, b.cursor, Math.PI * xFactor * ccwf);
    // mat4.rotateY(b.cursor, b.cursor, Math.PI * -0.003);
    xFactor = xFactor - 0.005;
  }
  mat4.translate(b.cursor, b.cursor, [0, 2, 0]);
  b.addLoopVerts();
  b.addSideQuads();
  b.addEndQuad(false);

  for (let qi = firstQuadIdx; qi < b.mesh.quad.length; qi++)
    b.mesh.colors.push(vec3.clone(BLACK));

  // console.dir(b.mesh);

  return b.mesh;
}

const startDelay = 0;
// const startDelay = 1000;

export const PiratePlatformDef = EM.defineComponent(
  "piratePlatform",
  (cannon: Entity, tiltPeriod: number, tiltTimer: number) => {
    return {
      cannon: createRef(cannon),
      tiltPeriod,
      tiltTimer,
      lastFire: startDelay,
    };
  }
);

function rotatePiratePlatform(
  p: EntityW<[typeof PositionDef, typeof RotationDef]>,
  rad: number
) {
  vec3.rotateY(p.position, p.position, vec3.ZEROS, rad);
  quat.rotateY(p.rotation, p.rotation, rad);
}

const pitchSpeed = 0.000042;

const numStartPirates = DBG_PLAYER ? 9 : 2;
let nextSpawn = 0;

const tenSeconds = 1000 * (DBG_PLAYER ? 3 : 10); // TODO(@darzu): make 10 seconds

let spawnTimer = tenSeconds;
const minSpawnTimer = 3000;

async function startPirates() {
  const em: EntityManager = EM;

  // TODO(@darzu): HACK!
  registerDestroyPirateHandler(destroyPirateShip);

  for (let i = 0; i < numStartPirates; i++) {
    const p = await spawnPirate(i * ((2 * Math.PI) / numStartPirates));
  }

  nextSpawn = spawnTimer;
  em.registerSystem(
    [PiratePlatformDef],
    [TimeDef],
    (ps, res) => {
      const pirateCount = ps.length;
      if (res.time.time > nextSpawn) {
        nextSpawn += spawnTimer;

        // console.log("SPAWN");

        const rad = Math.random() * 2 * Math.PI;
        if (pirateCount < 10) {
          spawnPirate(rad);
        }
        if (pirateCount < 2) {
          spawnPirate(rad + Math.PI);
        }
        spawnTimer *= 0.95;
        spawnTimer = Math.max(spawnTimer, minSpawnTimer);
      }
    },
    "spawnPirates"
  );
  sandboxSystems.push("spawnPirates");

  const fireStagger = 150;
  // const tiltPeriod = 5700;
  em.registerSystem(
    [PiratePlatformDef, PositionDef, RotationDef],
    [TimeDef],
    (ps, res) => {
      // const sinceLastFire = res.time.time - lastFire;
      // let beginFire = sinceLastFire > tenSeconds;
      // if (beginFire) {
      //   console.log("broadside!");
      //   lastFire = res.time.time;
      // }

      let pIdx = 0;
      for (let p of ps) {
        pIdx++;

        // rotate platform
        const R = Math.PI * -0.001;
        rotatePiratePlatform(p, R);

        const c = p.piratePlatform.cannon()!;

        // pitch cannons
        p.piratePlatform.tiltTimer += res.time.dt;
        const upMode =
          p.piratePlatform.tiltTimer % p.piratePlatform.tiltPeriod >
          p.piratePlatform.tiltPeriod * 0.5;
        if (RotationDef.isOn(c)) {
          let r = Math.PI * pitchSpeed * res.time.dt * (upMode ? -1 : 1);
          quat.rotateX(c.rotation, c.rotation, r);
        }

        // fire cannons
        const myTime = res.time.time + pIdx * fireStagger;
        let doFire = myTime - p.piratePlatform.lastFire > spawnTimer;
        if (doFire) {
          p.piratePlatform.lastFire = myTime;
          if (WorldFrameDef.isOn(c)) {
            // console.log(`pirate fire`);

            // TODO(@darzu): DBG!!!!!
            // const ballHealth = 20.0;
            const ballHealth = 2.0;
            fireBullet(
              em,
              2,
              c.world.position,
              c.world.rotation,
              0.05,
              0.02,
              3,
              ballHealth
            );
          }
        }
      }
    },
    "updatePiratePlatforms"
  );
  sandboxSystems.push("updatePiratePlatforms");
}

async function spawnPirate(rad: number) {
  // console.log("SPAWNED!");
  const em: EntityManager = EM;

  const initialPitch = Math.PI * 0.06;

  const res = await em.whenResources(AssetsDef, RendererDef);

  const platform = em.newEntity();
  const cannon = em.newEntity();

  const groundMesh = cloneMesh(res.assets.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(
      tempMat4(),
      quat.IDENTITY,
      [0, -1, 0],
      [4, 1, 4]
    )
  );
  em.ensureComponentOn(platform, RenderableConstructDef, groundMesh);
  em.ensureComponentOn(platform, ColorDef, vec3.clone(ENDESGA16.deepBrown));
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(platform, PositionDef, [0, 0, 30]);
  em.ensureComponentOn(platform, RotationDef);
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);
  const tiltPeriod = 5700 + jitter(3000);
  const tiltTimer = Math.random() * tiltPeriod;

  em.ensureComponentOn(
    platform,
    PiratePlatformDef,
    cannon,
    tiltPeriod,
    tiltTimer
  );

  em.ensureComponentOn(
    cannon,
    RenderableConstructDef,
    res.assets.ld51_cannon.proto
  );
  em.ensureComponentOn(cannon, PositionDef, [0, 2, 0]);
  em.ensureComponentOn(
    cannon,
    RotationDef,
    quat.rotateX(quat.create(), quat.IDENTITY, initialPitch)
  );
  em.ensureComponentOn(cannon, PhysicsParentDef, platform.id);
  em.ensureComponentOn(cannon, ColorDef, vec3.clone(ENDESGA16.darkGray));

  // TODO(@darzu): HACK!
  // so they start slightly different pitches
  let initTimer = 0;
  // TODO(@darzu):
  while (initTimer < tiltTimer) {
    initTimer += 16.6666;
    const upMode = initTimer % tiltPeriod > tiltPeriod * 0.5;
    let r = Math.PI * pitchSpeed * 16.6666 * (upMode ? -1 : 1);
    quat.rotateX(cannon.rotation, cannon.rotation, r);
  }

  // TIMBER SHIP
  {
    const timber = em.newEntity();
    const _timberMesh = createEmptyMesh("pirateShip");
    const builder = createTimberBuilder(_timberMesh);

    appendPirateShip(builder);

    _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
    const timberState = getBoardsFromMesh(_timberMesh);
    unshareProvokingForWood(_timberMesh, timberState);
    // console.log(`before: ` + meshStats(_timberMesh));
    // const timberMesh = normalizeMesh(_timberMesh);
    // console.log(`after: ` + meshStats(timberMesh));
    const timberMesh = _timberMesh as Mesh;
    timberMesh.usesProvoking = true;
    // TODO(@darzu): reserve room for splinter ends
    // reserveSplinterSpace(timberState

    reserveSplinterSpace(timberState, 10);

    em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
    em.ensureComponentOn(timber, WoodStateDef, timberState);
    em.ensureComponentOn(timber, ColorDef, vec3.clone(ENDESGA16.red));
    const timberAABB = getAABBFromMesh(timberMesh);
    em.ensureComponentOn(timber, PositionDef, [0, builder.width, 0]);
    // em.ensureComponentOn(timber, PositionDef, [
    //   2 + -builder.depth * 1,
    //   builder.width,
    //   -3,
    // ]);
    em.ensureComponentOn(timber, RotationDef);
    em.ensureComponentOn(timber, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: timberAABB,
    });
    const timberHealth = createWoodHealth(timberState);
    em.ensureComponentOn(timber, WoodHealthDef, timberHealth);
    em.ensureComponentOn(timber, PhysicsParentDef, platform.id);
  }

  rotatePiratePlatform(platform, rad);

  return platform;
}

export function destroyPirateShip(id: number, timber: Entity) {
  // TODO(@darzu): impl
  // console.log(`destroy ${id}`);

  // pirateShip
  const e = EM.findEntity(id, [PiratePlatformDef]);
  if (e) {
    assert(!!e);
    EM.ensureComponentOn(e, DeletedDef);
    if (e.piratePlatform.cannon())
      EM.ensureComponentOn(e.piratePlatform.cannon()!, DeletedDef);
    pirateKills += 1;

    const music = EM.getResource(MusicDef);
    if (music) music.playChords([3], "minor", 2.0, 5.0, 1);
  }

  if (WoodHealthDef.isOn(timber) && PhysicsParentDef.isOn(timber)) {
    // TODO(@darzu): necessary?
    // timber.physicsParent.id = 0;
    EM.ensureComponentOn(timber, LifetimeDef, 1000);
    for (let b of timber.woodHealth.boards) {
      for (let s of b) {
        s.health = 0;
      }
    }
  }
}
