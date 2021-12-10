import { Component, EM, EntityManager } from "./entity-manager.js";

const PHYSICS_PERIOD = 1000.0 / 60.0;
const NET_PERIOD = 1000.0 / 20.0;

export const TimeDef = EM.defineComponent("time", () => ({
  time: performance.now(),
  lastTime: 0,
  dt: 0,
}));

export type Time = Component<typeof TimeDef>;

interface TimerInternal {
  accumulated: number;
  period: number;
  steps: number;
  // max steps is important if the OS suspends our thread for a long time we don't want
  // to run 1000s of steps all at once.
  maxSteps: number;
}

export interface Timer {
  period: number;
  steps: number;
}

export const NetTimerDef = EM.defineComponent("netTimer", () => {
  const timer: TimerInternal = {
    accumulated: 0,
    period: NET_PERIOD,
    steps: 0,
    maxSteps: Infinity,
  };
  return timer as Timer;
});

export const PhysicsTimerDef = EM.defineComponent("physicsTimer", () => {
  const timer: TimerInternal = {
    accumulated: 0,
    period: PHYSICS_PERIOD,
    steps: 0,
    maxSteps: 5,
  };
  return timer as Timer;
});

function updateTimer(timer: TimerInternal, dt: number) {
  timer.steps = 0;
  timer.accumulated += dt;
  while (timer.accumulated >= timer.period) {
    timer.accumulated -= timer.period;
    timer.steps += 1;
    timer.steps = Math.min(timer.steps, timer.maxSteps);
  }
}

export function registerTimeSystem(em: EntityManager) {
  function time(
    [],
    {
      time,
      netTimer,
      physicsTimer,
    }: { time: Time; netTimer: Timer; physicsTimer: Timer }
  ) {
    time.lastTime = time.time;
    time.time = performance.now();
    time.dt = time.time - time.lastTime;
    updateTimer(netTimer as TimerInternal, time.dt);
    updateTimer(physicsTimer as TimerInternal, time.dt);
  }
  em.registerSystem(null, [TimeDef, NetTimerDef, PhysicsTimerDef], time);
}

export function addTimeComponents(em: EntityManager) {
  em.addSingletonComponent(TimeDef);
  em.addSingletonComponent(NetTimerDef);
  em.addSingletonComponent(PhysicsTimerDef);
}

// The commented-out code below is a Typescript version of Bevy's timer
// API. We're doing something a bit different--less flexible, but (hopefully)
// somewhat more ergonomic.

/*
export interface Timer {
  accumulated: number;
  period: number;
}

export function Timer(period: number): Timer {
  return { accumulated: 0, period };
}

export function tick(timer: Timer, dt: number) {
  timer.accumulated += dt;
}

export function ready(timer: Timer): boolean {
  if (timer.accumulated > timer.period) {
    timer.accumulated -= timer.period;
    return true;
  }
  return false;
}
*/
