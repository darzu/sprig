import { CameraDef } from "../camera.js";
import { DeletedDef } from "../delete.js";
import { EM, EntityManager } from "../entity-manager.js";
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
import { LifetimeDef } from "./lifetime.js";
import { LocalPlayerDef, PlayerDef, PlayerPropsDef } from "./player.js";
import {
  createPlayerShip,
  PlayerShipLocalDef,
  PlayerShipPropsDef,
} from "./player-ship.js";
import { AudioDef } from "../audio.js";

const RESTART_TIME_MS = 5000;

export enum GameState {
  LOBBY,
  PLAYING,
  GAMEOVER,
}

export const GameStateDef = EM.defineComponent("gameState", () => {
  return { state: GameState.LOBBY, time: 0 };
});

export const startGame = eventWizard(
  "start-game",
  () => [[PlayerDef]] as const,
  () => {
    EM.getResource(GameStateDef)!.state = GameState.PLAYING;
  },
  { legalEvent: () => EM.getResource(GameStateDef)!.state === GameState.LOBBY }
);

export const endGame = eventWizard(
  "end-game",
  () => [[PlayerShipPropsDef, PlayerShipLocalDef, PositionDef]] as const,
  ([ship]) => {
    console.log("end");
    const res = EM.getResources([AudioDef, GameStateDef, MeDef])!;
    res.music.playChords([1, 2, 3, 4, 4], "minor");
    res.gameState.state = GameState.GAMEOVER;
    res.gameState.time = 0;
    for (const partRef of ship.playerShipLocal.parts) {
      const part = partRef();
      if (part) EM.set(part, DeletedDef);
    }
    EM.set(ship, DeletedDef);
    if (ship.playerShipProps.cannonLId)
      EM.ensureComponent(ship.playerShipProps.cannonLId, DeletedDef);
    if (ship.playerShipProps.cannonRId)
      EM.ensureComponent(ship.playerShipProps.cannonRId, DeletedDef);
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

    const gem = EM.findEntity(ship.playerShipProps.gemId, [
      WorldFrameDef,
      PositionDef,
      PhysicsParentDef,
    ])!;
    vec3.copy(gem.position, gem.world.position);
    EM.set(gem, RotationDef);
    quat.copy(gem.rotation, gem.world.rotation);
    EM.set(gem, LinearVelocityDef, V(0, 0.01, 0));
    EM.removeComponent(gem.id, PhysicsParentDef);
    EM.set(gem, LifetimeDef, 4000);
  },
  {
    legalEvent: () => EM.getResource(GameStateDef)!.state === GameState.PLAYING,
  }
);

export const restartGame = eventWizard(
  "restart-game",
  () => [[PlayerShipPropsDef]] as const,
  ([ship]) => {
    console.log("restart");
    const res = EM.getResources([GameStateDef, LocalPlayerDef])!;
    res.gameState.state = GameState.LOBBY;
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
      EM.getResource(GameStateDef)!.state === GameState.GAMEOVER,
  }
);

export function registerGameStateSystems(em: EntityManager) {
  em.registerSystem(
    null,
    [GameStateDef, TimeDef, HostDef],
    ([], res) => {
      if (res.gameState.state === GameState.GAMEOVER) {
        res.gameState.time += res.time.dt;
        if (res.gameState.time > RESTART_TIME_MS) {
          // Do we have a ship to restart onto yet?
          const ship = EM.filterEntities([
            PlayerShipPropsDef,
            PlayerShipLocalDef,
          ])[0];
          if (ship) {
            restartGame(ship);
          } else {
            createPlayerShip();
          }
        }
      }
    },
    "restartTimer"
  );
}
