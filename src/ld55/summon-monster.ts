import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { T, createObj, defineObj } from "../graybox/objects.js";
import { mkCubeMesh, mkRectMesh } from "../meshes/primatives.js";
import { PhysicsParentDef, PositionDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { randFloat } from "../utils/math.js";

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

const MonsterFootObj = [RenderableConstructDef, PositionDef, ColorDef] as const;
type MonsterFootEnt = EntityW<[...typeof MonsterFootObj]>;

export const MonsterObj = defineObj({
  name: "monster",
  components: [RenderableConstructDef, PositionDef, ColorDef],
  children: {
    head: [RenderableConstructDef, PositionDef, ColorDef],
  },
  physicsParentChildren: true,
  propsType: T<{ stats: SummonStats; feet: MonsterFootEnt[] }>(),
} as const);
export const MonsterDef = MonsterObj.props;

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
  let footSpacing = bodyLength / numPairsFeet;
  let rearY = -bodyWidth / 2 + footSpacing / 2;
  let footZ = -startHeight;
  for (let i = 0; i < numFeet; i++) {
    let left = i % 2 === 0;
    let xPos = (left ? -1 : 1) * bodyWidth * 1.5;

    let pairIdx = Math.floor(i / 2);

    const footMesh = mkRectMesh(footSize, footSize, footSize);

    const foot = createObj(MonsterFootObj, {
      position: [xPos, rearY + footSpacing * pairIdx, footZ],
      color: ENDESGA16.darkBrown,
      renderableConstruct: [footMesh],
    });

    feet.push(foot);
  }

  const monster = createObj(MonsterObj, {
    props: {
      stats: stats,
      feet,
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

  for (let foot of feet) {
    monster.children.push(foot);
    EM.set(foot, PhysicsParentDef, monster.id);
  }

  return monster;
}

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
