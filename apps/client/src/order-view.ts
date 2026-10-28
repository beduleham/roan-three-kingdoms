import type { Squad } from "../../../packages/battle-core/src/index.js";
import type { Point } from "./projection.js";
type ViewSquad = Pick<
  Squad,
  | "id"
  | "nationId"
  | "position"
  | "hpMilli"
  | "fsmState"
  | "order"
  | "currentTargetId"
  | "anchor"
> & { charge: { destination: Point } | null };
export interface OrderCue {
  sourceId: string;
  targetId?: string;
  kind:
    | "target"
    | "attack-order"
    | "move"
    | "attack-move"
    | "retreat"
    | "return"
    | "charge";
  from: Point;
  to: Point;
  caption: string;
}
export const orderViewColors = {
  target: 0xc75c42,
  "attack-order": 0xc75c42,
  move: 0x81dbcc,
  "attack-move": 0xe8cc8a,
  retreat: 0x87b5df,
  return: 0x87b5df,
  charge: 0xe8cc8a,
} as const;
/** Reads accepted simulation state, never pending UI commands or inferred collision. */
export function orderCues(
  s: ViewSquad,
  squads: readonly ViewSquad[],
): OrderCue[] {
  if (s.hpMilli <= 0 || ["ROUTED", "BROKEN", "REGROUP"].includes(s.fsmState))
    return [];
  const make = (
    kind: OrderCue["kind"],
    to: Point,
    caption: string,
    targetId?: string,
  ): OrderCue => ({
    sourceId: s.id,
    kind,
    from: { ...s.position },
    to: { ...to },
    caption,
    ...(targetId ? { targetId } : {}),
  });
  if (s.charge) return [make("charge", s.charge.destination, "돌격 경로")];
  if (s.fsmState === "RETURN")
    return [make("return", s.anchor, "기준 위치 복귀")];
  const enemy = (id: string | null) =>
    squads.find(
      (t) => t.id === id && t.hpMilli > 0 && t.nationId !== s.nationId,
    );
  const result: OrderCue[] = [];
  const target = enemy(s.currentTargetId);
  if (target)
    result.push(
      make(
        "target",
        target.position,
        s.fsmState === "ENGAGE" ? "교전 대상" : "추격 대상",
        target.id,
      ),
    );
  const order = s.order;
  if (order?.type === "ATTACK") {
    const explicit = enemy(order.targetSquadId);
    if (explicit && explicit.id !== target?.id)
      result.push(
        make("attack-order", explicit.position, "지정 공격", explicit.id),
      );
  } else if (order) {
    const kind =
      order.type === "MOVE"
        ? "move"
        : order.type === "RETREAT"
          ? "retreat"
          : "attack-move";
    result.push(
      make(
        kind,
        order.destination,
        kind === "move"
          ? "이동 목적지"
          : kind === "retreat"
            ? "후퇴 목적지"
            : "공격 이동 목적지",
      ),
    );
  }
  return result;
}
