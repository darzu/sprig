import { Component, EM, EntityManager } from "../ecs/entity-manager.js";

export const TimeDef = EM.defineComponent("time", () => ({
  time: 0,
  lastTime: 0,
  step: 0,
  dt: 0,
}));
export type Time = Component<typeof TimeDef>;

export function tick(em: EntityManager, dt: number) {
  const time = EM.ensureResource(TimeDef);
  time.lastTime = time.time;
  time.time += dt;
  time.step += 1;
  time.dt = dt;
}
