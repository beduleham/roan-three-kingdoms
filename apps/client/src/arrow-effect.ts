import { project } from "./projection.js";
import type { Facing } from "./unit-motion.js";
export interface ArrowFlight {
  tick: number;
  from: Facing;
  to: Facing;
}
export const arrowPolicy = {
  durationTicks: 4,
  liftPixels: 14,
  handHeightPixels: 18,
  maxVisible: 64,
};
export function arrowPose(flight: ArrowFlight, tick: number) {
  const age = tick - flight.tick;
  if (age < 0 || age > arrowPolicy.durationTicks) return null;
  const t = age / arrowPolicy.durationTicks,
    a = project(flight.from),
    b = project(flight.to);
  return {
    x: a.x + (b.x - a.x) * t,
    y:
      a.y +
      (b.y - a.y) * t -
      arrowPolicy.handHeightPixels -
      arrowPolicy.liftPixels * 4 * t * (1 - t),
    dx: b.x - a.x,
    dy: b.y - a.y - arrowPolicy.liftPixels * 4 * (1 - 2 * t),
  };
}
export function retainArrows(flights: readonly ArrowFlight[], tick: number) {
  return flights
    .filter((f) => f.tick <= tick && tick - f.tick <= arrowPolicy.durationTicks)
    .slice(-arrowPolicy.maxVisible);
}
