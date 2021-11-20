import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion, MotionDef } from "../phys_motion.js";

export const BoatDef = EM.defineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
});
export type Boat = Component<typeof BoatDef>;

function stepBoats(
  boats: { boat: Boat; motion: Motion }[],
  { time }: { time: { dt: number } }
) {
  for (let o of boats) {
    const rad = o.boat.wheelSpeed * time.dt;
    o.boat.wheelDir += rad;

    // rotate
    quat.rotateY(o.motion.rotation, o.motion.rotation, rad);

    // rotate velocity
    vec3.rotateY(
      o.motion.linearVelocity,
      [o.boat.speed, 0, 0],
      [0, 0, 0],
      o.boat.wheelDir
    );
  }
}

export function registerStepBoats(em: EntityManager) {
  EM.registerSystem([BoatDef, MotionDef], [TimeDef], stepBoats);
}

// function createBoats(em: EntityManager, creator: number) {
//   // create boat(s)
//   const BOAT_COUNT = 4;
//   for (let i = 0; i < BOAT_COUNT; i++) {
//     const boat = new BoatClass(EM.newEntity(), creator);
//     boat.motion.location[1] = -9;
//     boat.motion.location[0] = (Math.random() - 0.5) * 20 - 10;
//     boat.motion.location[2] = (Math.random() - 0.5) * 20 - 20;
//     boat.boat.speed = 0.01 + jitter(0.01);
//     boat.boat.wheelSpeed = jitter(0.002);
//     // addObject(boat);

//     // TODO(@darzu): ECS hack
//     console.log("create ent");
//     const e = EM.newEntity();
//     let boatC = EM.addComponent(e.id, BoatDef);
//     Object.assign(boatC, boat.boat);
//     let boatM = EM.addComponent(e.id, MotionDef);
//     Object.assign(boatM, boat.motion);
//   }
// }

export const BoatConstructorDef = EM.defineComponent(
  "boatConstruct",
  (loc?: vec3, speed?: number, wheelSpeed?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      speed: speed ?? 0.01,
      wheelSpeed: wheelSpeed ?? 0.0,
    };
  }
);
export type BoatConstructor = Component<typeof BoatConstructorDef>;

function createBoat(e: Entity & BoatConstructor) {
  //
}

export function registerCreateBoats(em: EntityManager) {}
