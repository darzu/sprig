import { CameraDef } from "../camera.js";
import { DeletedDef } from "../delete.js";
import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { AuthorityDef, HostDef, MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { TimeDef } from "../time.js";
import { LifetimeDef } from "../games/lifetime.js";
import { LocalPlayerDef, PlayerDef, PlayerPropsDef } from "../games/player.js";
import {
  createHsShip,
  HsShipLocalDef,
  HsShipPropsDef,
} from "./hyperspace-ship.js";
import { AudioDef } from "../audio/audio.js";

const RESTART_TIME_MS = 5000;

export enum HyperspaceGameState {
  LOBBY,
  PLAYING,
  GAMEOVER,
}

export const GameStateDef = EM.defineComponent("hsGameState", () => {
  return { state: HyperspaceGameState.LOBBY, time: 0 };
});

export const startGame = eventWizard(
  "start-game",
  () => [[PlayerDef]] as const,
  () => {
    EM.getResource(GameStateDef)!.state = HyperspaceGameState.PLAYING;
  },
  {
    legalEvent: () =>
      EM.getResource(GameStateDef)!.state === HyperspaceGameState.LOBBY,
  }
);

export const endGame = eventWizard(
  "end-game",
  () => [[HsShipPropsDef, HsShipLocalDef, PositionDef]] as const,
  ([ship]) => {
    console.log("end");
    const res = EM.getResources([AudioDef, GameStateDef, MeDef])!;
    res.music.playChords([1, 2, 3, 4, 4], "minor");
    res.hsGameState.state = HyperspaceGameState.GAMEOVER;
    res.hsGameState.time = 0;
    for (const partRef of ship.hsShipLocal.parts) {
      const part = partRef();
      if (part) EM.ensureComponentOn(part, DeletedDef);
    }
    EM.ensureComponentOn(ship, DeletedDef);
    if (ship.hsShipProps.cannonLId)
      EM.ensureComponent(ship.hsShipProps.cannonLId, DeletedDef);
    if (ship.hsShipProps.cannonRId)
      EM.ensureComponent(ship.hsShipProps.cannonRId, DeletedDef);
    const players = EM.filterEntities([
      PlayerDef,
      PositionDef,
      RotationDef,
      AuthorityDef,
      PhysicsParentDef,
      WorldFrameDef,
    ]);
    for (let p of players) {
      p.player.manning = false;
      if (p.authority.pid === res.me.pid) {
        p.physicsParent.id = 0;
        vec3.copy(p.position, p.world.position);
        quat.copy(p.rotation, p.world.rotation);
      }
    }

    const gem = EM.findEntity(ship.hsShipProps.gemId, [
      WorldFrameDef,
      PositionDef,
      PhysicsParentDef,
    ])!;
    vec3.copy(gem.position, gem.world.position);
    EM.ensureComponentOn(gem, RotationDef);
    quat.copy(gem.rotation, gem.world.rotation);
    EM.ensureComponentOn(gem, LinearVelocityDef, V(0, 0.01, 0));
    EM.removeComponent(gem.id, PhysicsParentDef);
    EM.ensureComponentOn(gem, LifetimeDef, 4000);
  },
  {
    legalEvent: () =>
      EM.getResource(GameStateDef)!.state === HyperspaceGameState.PLAYING,
  }
);

export const restartGame = eventWizard(
  "restart-game",
  () => [[HsShipPropsDef]] as const,
  ([ship]) => {
    console.log("restart");
    const res = EM.getResources([GameStateDef, LocalPlayerDef])!;
    res.hsGameState.state = HyperspaceGameState.LOBBY;
    const player = EM.findEntity(res.localPlayer.playerId, [PlayerDef])!;
    player.player.lookingForShip = true;
    // res.score.currentScore = 0;

    // const groundSys = EM.getResource(GroundSystemDef);
    // if (groundSys) {
    //   groundSys.needsInit = true;
    // }
  },
  {
    legalEvent: () =>
      EM.getResource(GameStateDef)!.state === HyperspaceGameState.GAMEOVER,
  }
);

export function registerGameStateSystems(em: EntityManager) {
  em.registerSystem(
    null,
    [GameStateDef, TimeDef, HostDef],
    ([], res) => {
      if (res.hsGameState.state === HyperspaceGameState.GAMEOVER) {
        res.hsGameState.time += res.time.dt;
        if (res.hsGameState.time > RESTART_TIME_MS) {
          // Do we have a ship to restart onto yet?
          const ship = EM.filterEntities([HsShipPropsDef, HsShipLocalDef])[0];
          if (ship) {
            restartGame(ship);
          } else {
            createHsShip();
          }
        }
      }
    },
    "restartTimer"
  );
}