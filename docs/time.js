import { EM } from "./entity-manager.js";
const PHYSICS_PERIOD = 1000.0 / 60.0;
const NET_PERIOD = 1000.0 / 20.0;
export const TimeDef = EM.defineComponent("time", () => ({
    time: performance.now(),
    lastTime: 0,
    dt: 0,
}));
export const NetTimerDef = EM.defineComponent("netTimer", () => {
    const timer = {
        accumulated: 0,
        period: NET_PERIOD,
        steps: 0,
        maxSteps: Infinity,
    };
    return timer;
});
export const PhysicsTimerDef = EM.defineComponent("physicsTimer", () => {
    const timer = {
        accumulated: 0,
        period: PHYSICS_PERIOD,
        steps: 0,
        maxSteps: 5,
    };
    return timer;
});
function updateTimer(timer, dt) {
    timer.steps = 0;
    timer.accumulated += dt;
    while (timer.accumulated >= timer.period) {
        timer.accumulated -= timer.period;
        timer.steps += 1;
        timer.steps = Math.min(timer.steps, timer.maxSteps);
    }
}
export function registerTimeSystem(em) {
    function time([], { time, netTimer, physicsTimer, }) {
        time.lastTime = time.time;
        time.time = performance.now();
        time.dt = time.time - time.lastTime;
        updateTimer(netTimer, time.dt);
        updateTimer(physicsTimer, time.dt);
    }
    em.registerSystem(null, [TimeDef, NetTimerDef, PhysicsTimerDef], time);
}
export function addTimeComponents(em) {
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
//# sourceMappingURL=time.js.map