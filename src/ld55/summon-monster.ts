import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { T, createObj, defineObj } from "../graybox/objects.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { mkCubeMesh, mkRectMesh } from "../meshes/primatives.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
  createFrame,
  updateFrameFromPosRotScale,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { jitter, randFloat } from "../utils/math.js";
import { SketcherDef, sketchLine } from "../utils/sketch.js";

// TODO(@darzu): SummonStats vs MonsterStats
interface SummonStats {
  energy: number;
  speed: number;
  wit: number;
  attack: number;
  range: number;
}

export function getSummonStats(): SummonStats {
  // TODO(@darzu): use circle

  return {
    energy: Math.random(),
    speed: Math.random(),
    wit: Math.random(),
    attack: Math.random(),
    range: Math.random(),
  };
}

const MonsterFootMarkerObj = defineObj({
  name: "monsterFootMarker",
  components: [
    RenderableConstructDef,
    ScaleDef,
    PositionDef,
    ColorDef,
    WorldFrameDef,
  ],
} as const);
type MonsterFootMarkerEnt = EntityW<
  [
    typeof MonsterFootMarkerObj.props,
    ...typeof MonsterFootMarkerObj.opts.components
  ]
>;

const MonsterFootObj = defineObj({
  name: "monsterFoot",
  components: [RenderableConstructDef, PositionDef, ColorDef, WorldFrameDef],
  propsType: T<{ marker: MonsterFootMarkerEnt }>(),
} as const);
type MonsterFootEnt = EntityW<
  [typeof MonsterFootObj.props, ...typeof MonsterFootObj.opts.components]
>;

export const MonsterObj = defineObj({
  name: "monster",
  components: [RenderableConstructDef, PositionDef, ColorDef],
  children: {
    head: [RenderableConstructDef, PositionDef, ColorDef],
  },
  physicsParentChildren: true,
  propsType: T<{
    stats: SummonStats;
    feet: MonsterFootEnt[];
    feetMarkers: MonsterFootMarkerEnt[];
  }>(),
} as const);
export const MonsterDef = MonsterObj.props;

const stepRadius = 8;
const footMarkFwdY = stepRadius * 0.4;

export function summonMonster(stats: SummonStats) {
  // TODO(@darzu): IMPL

  let numPairsFeet = Math.floor(1 + stats.speed * 5);

  let numFeet = numPairsFeet * 2;

  let bodyVolume = 1 + stats.energy * 400;

  let bodyLength = numFeet * 2;

  // volume = length * width * width;
  let bodyWidth = Math.sqrt(bodyVolume / bodyLength);

  let headVolume = 1 + stats.wit * 100;
  let headSize = Math.pow(headVolume, 1 / 3);

  const bodyMesh = mkRectMesh(bodyWidth, bodyLength, bodyWidth);

  const headMesh = mkRectMesh(headSize, headSize, headSize);

  let startHeight = bodyWidth + 2;

  const headLoc = randFloat(0.7, 1.1);

  let footSize = 1;

  let feet: MonsterFootEnt[] = [];
  let feetMarkers: MonsterFootMarkerEnt[] = [];
  let footSpacing = bodyLength / numPairsFeet;
  let rearY = -bodyLength / 2 + footSpacing / 2;
  let footZ = -startHeight;
  for (let i = 0; i < numFeet; i++) {
    let left = i % 2 === 0;
    let xPos = (left ? -1 : 1) * bodyWidth * 1.5;

    let pairIdx = Math.floor(i / 2);

    const footMesh = mkRectMesh(footSize, footSize, footSize);

    let footMidY = rearY + footSpacing * pairIdx;
    let footRearY = footMidY - stepRadius / 2;
    let footMarkerY = footMidY + footMarkFwdY;

    let footY = footMarkerY + jitter(0.5) * stepRadius;

    const marker = createObj(MonsterFootMarkerObj, {
      args: {
        world: undefined,
        position: [xPos, footMarkerY, footZ],
        color: ENDESGA16.red,
        scale: [0.5, 0.5, 0.5],
        renderableConstruct: [CubeMesh],
      },
    });
    // V3.copy(marker.world.position, marker.position);
    // marker.world.position[2] += startHeight;
    // updateFrameFromPosRotScale(marker.world);
    feetMarkers.push(marker);

    const foot = createObj(MonsterFootObj, {
      props: {
        marker: marker,
      },
      args: {
        world: undefined,
        position: [xPos, footY, footZ + startHeight],
        color: ENDESGA16.orange,
        renderableConstruct: [footMesh],
      },
    });
    feet.push(foot);
  }

  const monster = createObj(MonsterObj, {
    props: {
      stats: stats,
      feet,
      feetMarkers,
    },
    args: {
      renderableConstruct: [bodyMesh],
      position: [0, 0, startHeight],
      color: ENDESGA16.darkRed,
    },
    children: {
      head: {
        position: [0, (bodyLength / 2) * headLoc, bodyWidth / 2],
        renderableConstruct: [headMesh],
        color: ENDESGA16.yellow,
      },
    },
  });

  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i];
    monster.children.push(foot);
    const marker = feetMarkers[i];
    monster.children.push(marker);

    EM.set(marker, PhysicsParentDef, monster.id);
  }

  return monster;
}

EM.addEagerInit([MonsterDef], [], [], () => {
  EM.addSystem(
    "updateMonsters",
    Phase.GAME_WORLD,
    [MonsterDef, ...MonsterObj.opts.components], // TODO(@darzu): ABSTRACTION. Need better handling for this
    [TimeDef],
    (es, res) => {
      let energyDrainPerMs = 0.0001;

      for (let e of es) {
        let hasEnergy = e.monster.stats.energy > 0;

        if (hasEnergy) {
          e.monster.stats.energy -= energyDrainPerMs * res.time.dt;

          const speed = e.monster.stats.speed * 0.05;
          e.position[1] += speed * res.time.dt;
        } else {
          e.position[2] = 0;
        }

        // TODO(@darzu): WALK / FLY ANIM
        // lean back based on speed
        // animate feet through the air
        // lean toward side with feet on the ground
      }
    }
  );

  let firstFrameSeen = new Map<number, number>();
  EM.addSystem(
    "updateMonsterFeet",
    Phase.GAME_WORLD,
    [MonsterDef, ...MonsterObj.opts.components], // TODO(@darzu): ABSTRACTION. Need better handling for this
    [TimeDef, SketcherDef],
    (es, res) => {
      let stepRadiusSqr = stepRadius ** 2;
      for (let e of es) {
        let firstFrame = firstFrameSeen.get(e.id);
        if (firstFrame === undefined) {
          firstFrame = res.time.step;
          firstFrameSeen.set(e.id, firstFrame);
        }

        if (res.time.step < firstFrame + 10) {
          continue; // TODO(@darzu): hack!
        }

        for (let foot of e.monster.feet) {
          // TODO(@darzu): use leg length not marker distance!
          const marker = foot.monsterFoot.marker;
          const doStep =
            V3.sqrDist(foot.position, marker.world.position) > stepRadiusSqr;

          if (doStep) {
            console.log(`step`);
            V3.copy(foot.position, marker.world.position);
          }

          sketchLine(e.position, foot.world.position, {
            key: `leg_${e.id}_to_${foot.id}`,
            color: ENDESGA16.yellow,
          });
        }
      }
    }
  );
});
