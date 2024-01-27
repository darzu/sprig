import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, mat4, quat, V3 } from "../matrix/sprig-matrix.js";
import { BallMesh } from "../meshes/mesh-list.js";
import {
  Mesh,
  RawMesh,
  cloneMesh,
  mapMeshPositions,
  mergeMeshes,
  transformMesh,
} from "../meshes/mesh.js";
import { HEX_MESH, TETRA_MESH, mkCubeMesh } from "../meshes/primatives.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { onCollides } from "../physics/phys-helpers.js";
import {
  PhysicsParentDef,
  Position,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  randFloat,
  randInt,
  sphereRadiusFromVolume,
  sphereVolumeFromRadius,
} from "../utils/math.js";
import { Path } from "../utils/spline.js";
import { assert } from "../utils/util.js";
import { randNormalVec3, randQuat } from "../utils/utils-3d.js";
import {
  LD54GameStateDef,
  FUEL_PER_ORE,
  OXYGEN_PER_ORE,
  FUEL_CONSUMPTION_RATE,
  SHIP_SPEED,
  OXYGEN_CONSUMPTION_RATE,
  STARTING_FUEL,
  STARTING_OXYGEN,
  SWORD_SWING_DURATION,
} from "./gamestate.js";
import { SpaceSuitDef } from "./space-suit-controller.js";

let _t1 = V3.mk();
let _t2 = quat.create();

function createFuelOreMesh(): Mesh {
  const meshes: RawMesh[] = [];
  let numCubes = 5;
  for (let i = 0; i < numCubes; i++) {
    // TODO(@darzu):
    const c = mkCubeMesh();

    const randTrans = V3.scale(randNormalVec3(_t1), 2, _t1);
    V3.add(randTrans, [0, 0, 1 * i], randTrans);
    const randRot = randQuat(_t2);
    const randScale = randFloat(1, 2);

    c.pos.forEach((p) => {
      V3.tQuat(p, randRot, p);
      V3.scale(p, randScale, p);
      V3.add(p, randTrans, p);
    });

    // const randColorIdx = randInt(0, 2);
    const randColor = [
      ENDESGA16.lightGreen,
      ENDESGA16.darkGreen,
      ENDESGA16.deepGreen,
    ][i % 3];

    c.colors.forEach((c) => {
      V3.copy(c, randColor);
    });

    meshes.push(c);
  }

  const result = mergeMeshes(...meshes) as Mesh;
  result.usesProvoking = true;
  result.surfaceIds = result.colors.map((_, i) => i);
  return result;
}

function createOxygenOreMesh(mkBallMesh: () => Mesh): Mesh {
  const meshes: RawMesh[] = [];
  let numCubes = 5;
  for (let i = 0; i < numCubes; i++) {
    // TODO(@darzu):
    // const c = cloneMesh(TETRA_MESH);
    // const c = HEX_MESH();
    const c = mkBallMesh();

    const randTrans = V3.scale(randNormalVec3(_t1), 2, _t1);
    V3.add(randTrans, [0, 0, 1 * i], randTrans);
    const randRot = randQuat(_t2);
    const randScale = randFloat(1, 2);

    c.pos.forEach((p) => {
      V3.tQuat(p, randRot, p);
      V3.scale(p, randScale, p);
      V3.add(p, randTrans, p);
    });

    // const randColorIdx = randInt(0, 2);
    const randColor = [ENDESGA16.white, ENDESGA16.lightBlue, ENDESGA16.blue][
      i % 3
    ];

    c.colors.forEach((c) => {
      V3.copy(c, randColor);
    });

    meshes.push(c);
  }

  const result = mergeMeshes(...meshes) as Mesh;
  result.usesProvoking = true;
  result.surfaceIds = result.colors.map((_, i) => i);
  return result;
}

export const OreDef = EM.defineComponent("ore", () => ({
  carried: false,
  type: "fuel" as "fuel" | "oxygen",
}));

type OreEnt = EntityW<
  [typeof OreDef, typeof PositionDef, typeof RenderableDef]
>;
export const OreCarrierDef = EM.defineNonupdatableComponent(
  "oreCarrier",
  (colliderId?: number) => ({
    carrying: undefined as OreEnt | undefined,
    colliderId: colliderId ?? 0,
  })
);

export const OreStoreDef = EM.defineComponent("oreStore", () => ({
  fuelOres: [] as OreEnt[],
  oxygenOres: [] as OreEnt[],
}));

export async function initOre(spacePath: Path) {
  const ballGameMesh = await EM.whenResources(BallMesh.def);
  const mkBallMesh = () => cloneMesh(ballGameMesh.mesh_ball.mesh);

  const store = await EM.whenSingleEntity(OreStoreDef);

  // fuel slot locations
  const spc = 8;

  const H = 5;
  const B = -16;
  const F = 10;

  const fuelSlots: V3[] = [
    V(0, B, H),
    V(spc, B, H),
    V(-spc, B, H),
    V(0, B - spc, H),
    V(spc, B - spc, H),
    V(-spc, B - spc, H),
    V(0, B, H + spc),
    V(spc, B, H + spc),
    V(-spc, B, H + spc),
    V(0, B - spc, H + spc),
    V(spc, B - spc, H + spc),
    V(-spc, B - spc, H + spc),
  ];

  const oxygenSlots: V3[] = [
    V(0, F, H),
    V(spc, F, H),
    V(-spc, F, H),
    V(0, F + spc, H),
    V(spc, F + spc, H),
    V(-spc, F + spc, H),
    V(0, F, H),
    V(spc, F, H + spc),
    V(-spc, F, H + spc),
    V(0, F + spc, H + spc),
    V(spc, F + spc, H + spc),
    V(-spc, F + spc, H + spc),
  ];

  function fuelOreToTravelDist(ore: number): number {
    return (ore * SHIP_SPEED) / FUEL_CONSUMPTION_RATE;
  }
  function oxygenOreToTravelDist(ore: number): number {
    return (ore * SHIP_SPEED) / OXYGEN_CONSUMPTION_RATE;
  }

  function getFuelMargin() {
    return 0.0;
  }
  function getOxygenMargin() {
    return 0.0;
  }

  // ore parameters
  const oxyOreTravelDist = oxygenOreToTravelDist(OXYGEN_PER_ORE);
  const fuelOreTravelDist = fuelOreToTravelDist(FUEL_PER_ORE);
  // console.log(`fuelOreTravelDist: ${fuelOreTravelDist}`);

  const pathDistances: number[] = []; // cumulative distance
  {
    // path distances
    let prevPos = spacePath[0].pos;
    let lastDist = 0;
    for (let i = 0; i < spacePath.length; i++) {
      const newTravel = V3.dist(spacePath[i].pos, prevPos);
      const dist = lastDist + newTravel;
      prevPos = spacePath[i].pos;
      lastDist = dist;
      pathDistances.push(dist);
    }
  }
  const totalDistance = pathDistances.at(-1)!;

  console.log(`total path distance: ${totalDistance}`);

  // place fuel
  {
    let numFuelSpawned = 0;
    let totalFuelTravel = fuelOreToTravelDist(STARTING_FUEL);
    while (totalFuelTravel < totalDistance) {
      const nextOreStop = totalFuelTravel - fuelOreTravelDist * getFuelMargin();
      const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
      const seg = spacePath[segIdx];

      const randDistFromTrack = randFloat(20, 100);
      const pos = V3.scale(randNormalVec3(), randDistFromTrack, V3.mk());
      pos[1] = seg.pos[1];

      createFuelOre(pos);
      numFuelSpawned++;

      totalFuelTravel = nextOreStop + fuelOreTravelDist;
    }

    console.log(
      `spawned ${numFuelSpawned} fuel, for ${
        fuelOreTravelDist * numFuelSpawned
      } travel`
    );

    // place starter fuel onboard
    const numStarterFuel = Math.ceil(STARTING_FUEL / FUEL_PER_ORE);
    // console.log(`CREATING ${numStarterFuel} starter fuel`);
    for (let i = 0; i < numStarterFuel; i++) {
      const ore = createFuelOre(V3.clone(fuelSlots[i]));
      ore.ore.carried = true;
      V3.zero(ore.angularVelocity);
      EM.set(ore, PhysicsParentDef, store.id);
      EM.whenEntityHas(ore, OreDef, PositionDef, RenderableDef).then((ore) => {
        store.oreStore.fuelOres.push(ore);
      });
    }
  }

  // place oxygen
  {
    let totalOxygenTravel = oxygenOreToTravelDist(STARTING_OXYGEN);
    while (totalOxygenTravel < totalDistance) {
      const nextOreStop =
        totalOxygenTravel - oxyOreTravelDist * getOxygenMargin();
      const segIdx = pathDistances.findIndex((d) => d > nextOreStop);
      const seg = spacePath[segIdx];

      const randDistFromTrack = randFloat(20, 100);
      const pos = V3.scale(randNormalVec3(), randDistFromTrack, V3.mk());
      pos[1] = seg.pos[1];

      createOxygenOre(pos);

      totalOxygenTravel = nextOreStop + oxyOreTravelDist;
    }

    // place starter oxygen onboard
    const numStarterOxygen = Math.ceil(STARTING_OXYGEN / OXYGEN_PER_ORE);
    for (let i = 0; i < numStarterOxygen; i++) {
      const ore = createOxygenOre(V3.clone(oxygenSlots[i]));
      ore.ore.carried = true;
      V3.zero(ore.angularVelocity);
      EM.set(ore, PhysicsParentDef, store.id);
      EM.whenEntityHas(ore, OreDef, PositionDef, RenderableDef).then((ore) => {
        store.oreStore.oxygenOres.push(ore);
      });
    }
  }

  onCollides(
    [OreCarrierDef],
    [OreStoreDef],
    [LD54GameStateDef],
    (carrier, store, res) => {
      // must be carrying
      if (!carrier.oreCarrier.carrying) return;

      // transfer to store
      const ore = carrier.oreCarrier.carrying;
      ore.ore.carried = true;
      carrier.oreCarrier.carrying = undefined;

      if (ore.ore.type === "fuel") {
        const idx = store.oreStore.fuelOres.length;
        store.oreStore.fuelOres.push(ore);
        const pos = fuelSlots[idx % fuelSlots.length];
        V3.copy(ore.position, pos);
      } else {
        const idx = store.oreStore.oxygenOres.length;
        store.oreStore.oxygenOres.push(ore);
        const pos = oxygenSlots[idx % oxygenSlots.length];
        V3.copy(ore.position, pos);
      }

      EM.set(ore, PhysicsParentDef, store.id);

      // update game state
      switch (ore.ore.type) {
        case "fuel":
          res.ld54GameState.fuel += FUEL_PER_ORE;
          break;
        case "oxygen":
          res.ld54GameState.oxygen += OXYGEN_PER_ORE;
          break;
      }
    }
  );

  onCollides(
    [OreCarrierDef, SpaceSuitDef],
    [OreDef, PositionDef, RenderableDef, AngularVelocityDef],
    [],
    (carrier, ore) => {
      // must not be carrying
      if (carrier.oreCarrier.carrying) return;

      // only collect if we are swingin
      if (
        carrier.spaceSuit.swingingSword &&
        carrier.spaceSuit.swordSwingT > 0.7 * SWORD_SWING_DURATION
      ) {
        // transfer to carrier
        carrier.oreCarrier.carrying = ore;
        ore.ore.carried = true;
        V3.zero(ore.angularVelocity); // stop spinning
        EM.set(ore, PhysicsParentDef, carrier.id);
        V3.set(0, 0, -5, ore.position);
      }
    }
  );

  const oreFullVolume = sphereVolumeFromRadius(1);
  // const oreFullRadius = sphereRadiusFromVolume(oreFullVolume);
  // console.log(`oreFullVolume: ${oreFullVolume}, rad: ${oreFullRadius}`);

  EM.addSystem(
    "manageOreSlots",
    Phase.GAME_PLAYERS,
    [OreStoreDef, PositionDef],
    [PhysicsResultsDef, LD54GameStateDef],
    (es, res) => {
      if (!es.length) return;
      assert(es.length === 1);
      const store = es[0];

      // adjust ore fuel in slots based on fuel left
      const numFuelShouldHave = Math.ceil(
        res.ld54GameState.fuel / FUEL_PER_ORE
      );
      if (numFuelShouldHave < store.oreStore.fuelOres.length) {
        const deadOre = store.oreStore.fuelOres.pop()!;
        deadOre.renderable.hidden = true;
      }
      const fuelFrac = (res.ld54GameState.fuel % FUEL_PER_ORE) / FUEL_PER_ORE;
      const fuelRad = sphereRadiusFromVolume(fuelFrac * oreFullVolume);

      store.oreStore.fuelOres.forEach((o, i) => {
        if (i === store.oreStore.fuelOres.length - 1)
          EM.set(o, ScaleDef, [fuelRad, fuelRad, fuelRad]);
        else EM.set(o, ScaleDef, [1, 1, 1]);
      });

      // adjust ore oxygen in slots based on oxygen left
      const numOxygenShouldHave = Math.ceil(
        res.ld54GameState.oxygen / OXYGEN_PER_ORE
      );
      if (numOxygenShouldHave < store.oreStore.oxygenOres.length) {
        const deadOre = store.oreStore.oxygenOres.pop()!;
        deadOre.renderable.hidden = true;
      }
      const oxygenFrac =
        (res.ld54GameState.oxygen % OXYGEN_PER_ORE) / OXYGEN_PER_ORE;
      const oxygenRad = sphereRadiusFromVolume(oxygenFrac * oreFullVolume);

      store.oreStore.oxygenOres.forEach((o, i) => {
        if (i === store.oreStore.oxygenOres.length - 1)
          EM.set(o, ScaleDef, [oxygenRad, oxygenRad, oxygenRad]);
        else EM.set(o, ScaleDef, [1, 1, 1]);
      });
    }
  );

  function createOxygenOre(pos: V3) {
    const ore = EM.new();

    EM.set(ore, OreDef);
    ore.ore.type = "oxygen";

    // mesh
    const mesh = createOxygenOreMesh(mkBallMesh);
    EM.set(ore, RenderableConstructDef, mesh);

    // collider
    const S = -3;
    EM.set(ore, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
    });

    // pos
    EM.set(ore, PositionDef, pos);

    // spin
    EM.set(ore, AngularVelocityDef);
    randNormalVec3(ore.angularVelocity);
    V3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

    return ore;
  }

  function createFuelOre(pos: V3) {
    const ore = EM.new();

    EM.set(ore, OreDef);
    ore.ore.type = "fuel";

    // mesh
    const mesh = createFuelOreMesh();
    EM.set(ore, RenderableConstructDef, mesh);
    EM.set(ore, PositionDef, pos);

    // collider
    const S = -3;
    EM.set(ore, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: createAABB(V(-S, -S, -S), V(S, S, S)),
    });

    // pos
    EM.set(ore, AngularVelocityDef);

    // spin
    randNormalVec3(ore.angularVelocity);
    V3.scale(ore.angularVelocity, 0.0005, ore.angularVelocity);

    return ore;
  }
}
