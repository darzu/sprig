import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createObj } from "../graybox/objects.js";
import { mkCubeMesh, mkRectMesh } from "../meshes/primatives.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";

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

export function summonMonster(stats: SummonStats) {
  // TODO(@darzu): IMPL

  let numFeet = Math.floor(2 + stats.speed * 8);

  let bodyVolume = 1 + stats.energy * 9;

  let bodyLength = numFeet * 2;

  // volume = length * width * width;
  let bodyWidth = Math.sqrt(bodyVolume / bodyLength);

  let headSize = 1 + stats.wit * 2;

  const bodyMesh = mkRectMesh(bodyWidth, bodyLength, bodyWidth);

  const monster = createObj(
    [RenderableConstructDef, PositionDef, ColorDef] as const,
    {
      renderableConstruct: [bodyMesh],
      position: [0, 0, 5],
      color: ENDESGA16.darkRed,
    }
  );

  return monster;
}
