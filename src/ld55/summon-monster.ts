import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { T, createObj, defineObj } from "../graybox/objects.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
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
import { SketcherDef, sketchLine, sketchLineSegs } from "../utils/sketch.js";

// TODO(@darzu): SummonStats vs MonsterStats
interface SummonStats {
  energy: number;
  speed: number;
  wit: number;
  attack: number;
  range: number;
}

interface MonsterStats {
  numPairsFeet: number;
  bodyVolume: number;
  bodyLength: number;
  bodyWidth: number;
  headVolume: number;
  headSize: number;
  legLength: number;
  strideWidth: number;
  startHeight: number;
  footSpacing: number;
  footMarkFwdOffset: number;

  energy: number;
  speed: number;
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
  propsType: T<{ socketPos: V3 }>(),
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
    stats: MonsterStats;
    feet: MonsterFootEnt[];
    feetMarkers: MonsterFootMarkerEnt[];
  }>(),
} as const);
export const MonsterDef = MonsterObj.props;

function getMonsterStats(stats: SummonStats): MonsterStats {
  let numPairsFeet = Math.floor(1 + stats.speed * 5);

  let numFeet = numPairsFeet * 2;

  let bodyVolume = 1 + stats.energy * 400;

  let bodyLength = numFeet * 2;

  // volume = length * width * width;
  let bodyWidth = Math.sqrt(bodyVolume / bodyLength);

  let headVolume = 1 + stats.wit * 100;
  let headSize = Math.pow(headVolume, 1 / 3);

  let energy = stats.energy;
  let speed = stats.speed * 0.5;

  let startHeight = bodyWidth + 2;
  const legLength = startHeight + bodyWidth * 1.0;

  let footSpacing = bodyLength / numPairsFeet;

  const strideWidth = bodyWidth * 0.5;

  // const footMarkFwdOffset = legLength * 0.2;
  const footMarkFwdOffset = strideWidth * 1.5;

  return {
    energy,
    speed,

    numPairsFeet,
    bodyVolume,
    bodyLength,
    bodyWidth,
    headVolume,
    headSize,
    legLength,
    strideWidth,
    startHeight,
    footSpacing,
    footMarkFwdOffset,
  };
}

export function summonMonster(summonStats: SummonStats) {
  const stats = getMonsterStats(summonStats);

  const {
    bodyWidth,
    bodyLength,
    headSize,
    numPairsFeet,
    legLength,
    startHeight,
    footSpacing,
    footMarkFwdOffset,
    strideWidth,
  } = stats;

  const numFeet = numPairsFeet * 2;

  const bodyMesh = mkRectMesh(bodyWidth, bodyLength, bodyWidth);

  const headMesh = mkRectMesh(headSize, headSize, headSize);

  const headLoc = randFloat(0.7, 1.1);

  let footSize = 1;

  let feet: MonsterFootEnt[] = [];
  let feetMarkers: MonsterFootMarkerEnt[] = [];
  let rearY = -bodyLength / 2 + footSpacing / 2;
  let footZ = -startHeight;
  for (let i = 0; i < numFeet; i++) {
    let left = i % 2 === 0;
    let fwd = ((i - 1) >> 1) % 2 === 0; // left:back, right:fwd, left:fwd, right:back, left:back, right:fwd, left:fwd, ...
    let fwdSign = fwd ? 1 : -1;
    let xSign = left ? -1 : 1;
    let xSocketPos = xSign * (bodyWidth / 2);
    let xPos = xSocketPos + xSign * strideWidth;

    let pairIdx = Math.floor(i / 2);

    const footMesh = mkRectMesh(footSize, footSize, footSize);

    let footMidY = rearY + footSpacing * pairIdx;
    let footMarkerY = footMidY + footMarkFwdOffset;

    let footY = footMidY + fwdSign * footMarkFwdOffset;

    const marker = createObj(MonsterFootMarkerObj, {
      props: {
        socketPos: V(xSocketPos, footMidY, 0),
      },
      args: {
        world: undefined,
        position: [xPos, footMarkerY, footZ],
        color: ENDESGA16.red,
        scale: [0.2, 0.2, 0.2],
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
          if (e.position[2] !== 0) {
            e.position[2] = 0;

            e.monster.feet.forEach((f, i) => {
              // const left = i % 2 === 0 ? -1 : 1;
              // f.position[0] += left * e.monster.stats.startHeight;
              f.position[2] = 0;
            });
            e.monster.feetMarkers.forEach((f, i) => {
              // const left = i % 2 === 0 ? -1 : 1;
              // f.position[0] += left * e.monster.stats.startHeight;
              f.position[2] = 0;
            });
          }
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
    [MonsterDef, ...MonsterObj.opts.components, WorldFrameDef], // TODO(@darzu): ABSTRACTION. Need better handling for this
    [TimeDef, SketcherDef],
    (es, res) => {
      for (let e of es) {
        let legLenSqr = e.monster.stats.legLength ** 2;

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
          const socketPosLocal = marker.monsterFootMarker.socketPos;
          const socketPosWorld = V3.tMat4(socketPosLocal, e.world.transform);
          const doStep = V3.sqrDist(foot.position, socketPosWorld) > legLenSqr;

          if (doStep) {
            // console.log(`step`);
            V3.copy(foot.position, marker.world.position);
          }

          const kneePos: V3.InputT = V3.lerp(
            foot.position,
            socketPosWorld,
            0.5
          );
          kneePos[2] += 2;

          const segs: [V3.InputT, V3.InputT][] = [
            [foot.world.position, kneePos],
            [kneePos, socketPosWorld],
          ];

          sketchLineSegs(segs, {
            key: `leg_${e.id}_to_${foot.id}`,
            color: ENDESGA16.yellow,
          });
          // sketchLine(socketPosWorld, foot.world.position, {
          //   key: `leg_${e.id}_to_${foot.id}`,
          //   color: ENDESGA16.yellow,
          // });
        }
      }
    }
  );
});
