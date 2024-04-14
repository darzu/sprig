import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { T, createObj, defineObj } from "../graybox/objects.js";
import { mkCubeMesh, mkRectMesh } from "../meshes/primatives.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";

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

export const MonsterObj = defineObj({
  name: "monster",
  components: [RenderableConstructDef, PositionDef, ColorDef],
  propsType: T<SummonStats>(),
} as const);
export const MonsterDef = MonsterObj.props;

export function summonMonster(stats: SummonStats) {
  // TODO(@darzu): IMPL

  let numFeet = Math.floor(2 + stats.speed * 8);

  let bodyVolume = 1 + stats.energy * 400;

  let bodyLength = numFeet * 2;

  // volume = length * width * width;
  let bodyWidth = Math.sqrt(bodyVolume / bodyLength);

  let headSize = 1 + stats.wit * 2;

  const bodyMesh = mkRectMesh(bodyWidth, bodyLength, bodyWidth);

  let startHeight = bodyWidth + 2;

  const monster = createObj(MonsterObj, {
    props: stats,
    args: {
      renderableConstruct: [bodyMesh],
      position: [0, 0, startHeight],
      color: ENDESGA16.darkRed,
    },
  });

  return monster;
}

EM.addSystem(
  "updateMonsters",
  Phase.GAME_WORLD,
  [MonsterDef, ...MonsterObj.opts.components], // TODO(@darzu): ABSTRACTION. Need better handling for this
  [TimeDef],
  (es, res) => {
    for (let e of es) {
      const speed = e.monster.speed * 0.05;
      e.position[1] += speed * res.time.dt;

      // TODO(@darzu): WALK / FLY ANIM
    }
  }
);
