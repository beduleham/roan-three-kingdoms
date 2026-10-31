/** National rounds count to their current checkpoint; finished matches have no countdown. */
export function remainingMatchTicks(
  match: { tick: number; limitTicks: number; status: string },
  phaseDeadline?: number,
) {
  return match.status === "finished"
    ? 0
    : Math.max(0, (phaseDeadline ?? match.limitTicks) - match.tick);
}
