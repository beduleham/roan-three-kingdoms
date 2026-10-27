/** Screen-space display slots only; never used for core positions or hit detection. */
export const formationView = {
  slots: [
    { x: -66, y: -14 },
    { x: -40, y: -14 },
    { x: 40, y: -14 },
    { x: 66, y: -14 },
    { x: -66, y: 14 },
    { x: -40, y: 14 },
    { x: 40, y: 14 },
    { x: 66, y: 14 },
  ],
  halfWidth: 84,
  top: -64,
  bottom: 24,
  commanderBadgeY: -72,
} as const;
export function soldierFoot(center: { x: number; y: number }, index: number) {
  const slot = formationView.slots[index];
  if (!slot) throw new RangeError("Display soldier index must be 0..7");
  return { x: center.x + slot.x, y: center.y + slot.y };
}
