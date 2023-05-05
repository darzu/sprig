import { createRef, defineNetEntityHelper } from "../ecs/em_helpers.js";
import { EM, EntityManager, EntityW } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../temp-pool.js";
import { vec3Dbg } from "../utils-3d.js";
import { AssetsDef } from "../assets.js";
import { PointLightDef } from "../render/lights.js";
import { FLAG_UNLIT, RenderDataStdDef } from "../render/pipelines/std-scene.js";
import { ColorDef } from "../color/color-ecs.js";
import { HyperspaceGameState, GameStateDef } from "./hyperspace-gamestate.js";

const DARKSTAR_SPEED = 1;

export const STAR1_COLOR = V(0.8, 0.3, 0.3);
export const STAR2_COLOR = V(0.3, 0.8, 0.6);

export const { DarkStarPropsDef, DarkStarLocalDef, createDarkStarNow } =
  defineNetEntityHelper(EM, {
    name: "darkStar",
    defaultProps: (
      pos?: vec3,
      color?: vec3,
      orbiting?: vec3,
      orbitalAxis?: vec3
    ) => ({
      pos: pos ?? vec3.create(),
      color: color ?? vec3.create(),
      orbiting: orbiting ?? vec3.create(),
      orbitalAxis: orbitalAxis ?? V(1, 0, 0),
    }),
    serializeProps: (o, buf) => {
      buf.writeVec3(o.pos);
      buf.writeVec3(o.color);
    },
    deserializeProps: (o, buf) => {
      buf.readVec3(o.pos);
      buf.readVec3(o.color);
    },
    defaultLocal: () => ({}),
    dynamicComponents: [PositionDef],
    buildResources: [AssetsDef],
    build: (star, res) => {
      const em: EntityManager = EM;
      vec3.copy(star.position, star.darkStarProps.pos);
      em.ensureComponentOn(star, RenderableConstructDef, res.assets.ball.proto);
      em.ensureComponentOn(star, ScaleDef, V(100, 100, 100));
      em.ensureComponentOn(star, ColorDef, star.darkStarProps.color);
      em.ensureComponentOn(star, PointLightDef);
      star.pointLight.constant = 1.0;
      vec3.copy(star.pointLight.ambient, star.color);
      vec3.scale(star.pointLight.ambient, 0.2, star.pointLight.ambient);
      vec3.copy(star.pointLight.diffuse, star.color);
      em.whenEntityHas(star, RenderDataStdDef).then((star1) => {
        star1.renderDataStd.flags |= FLAG_UNLIT;
      });
      return star;
    },
  });

onInit((em) => {
  // TODO: this star will escape! must bring it closer to the orbit point sometimes
  em.registerSystem(
    [DarkStarPropsDef, PositionDef, AuthorityDef],
    [MeDef, GameStateDef],
    (es, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) {
        return;
      }
      for (let star of es) {
        if (star.authority.pid !== res.me.pid) continue;
        const toCenter = vec3.sub(star.darkStarProps.orbiting, star.position);
        const distance = vec3.length(toCenter);
        // TODO: revisit random orbits
        /*
        let arbitraryVector = V(1, 0, 0);
        let basis1 = vec3.cross(arbitraryVector, arbitraryVector, toCenter);
        if (vec3.length(basis1) < 0.001) {
          console.log("ended up with a tiny basis vector");
          arbitraryVector = V(0, 1, 0);
          basis1 = vec3.cross(arbitraryVector, arbitraryVector, toCenter);
        }
        const basis2 = vec3.cross(tempVec3(), basis1, toCenter);
        vec3.normalize(basis1, basis1);
        vec3.normalize(basis2, basis2);
        vec3.scale(basis1, basis1, Math.random() - 0.5);
        vec3.scale(basis2, basis2, Math.random() - 0.5);
        console.log(
          `toCenter ${vec3Dbg(toCenter)}, basis1 ${vec3Dbg(
            basis1
          )}, basis2 ${vec3Dbg(basis2)}`
          );
        const movementDirection = vec3.add(basis1, basis1, basis2);
        vec3.normalize(movementDirection, movementDirection);
        */
        const movementDirection = vec3.cross(
          toCenter,
          star.darkStarProps.orbitalAxis
        );
        vec3.normalize(movementDirection, movementDirection);
        vec3.add(
          star.position,
          vec3.scale(movementDirection, DARKSTAR_SPEED, movementDirection),
          star.position
        );

        vec3.sub(star.darkStarProps.orbiting, star.position, toCenter);
        const newDistance = vec3.length(toCenter);
        vec3.normalize(toCenter, toCenter);
        vec3.scale(toCenter, newDistance - distance, toCenter);
        //console.log(`distance ${distance}, newDistance ${newDistance}`);
        //console.log(`distance ${distance}, newDistance ${newDistance}`);
        vec3.add(star.position, toCenter, star.position);
      }
    },
    "darkStarOrbit"
  );
});
