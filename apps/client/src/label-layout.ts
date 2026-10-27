/** Presentation-only world-space nameplates. Selected squads get the nearest free slot. */
export interface LabelAnchor {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
}
export interface LabelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export const labelPolicy = { margin: 8, gap: 5, lift: 90 } as const;
export function layoutLabels(
  anchors: readonly LabelAnchor[],
  viewport: { x: number; y: number; width: number; height: number },
): LabelRect[] {
  const { margin, gap, lift } = labelPolicy;
  const result: LabelRect[] = [];
  const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(n, hi));
  const ordered = [...anchors].sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id),
  );
  for (const a of ordered) {
    // Do not pin labels belonging to offscreen squads to the edge of the screen.
    if (
      a.x < viewport.x ||
      a.x > viewport.x + viewport.width ||
      a.y < viewport.y ||
      a.y > viewport.y + viewport.height
    )
      continue;
    const left = viewport.x + margin,
      top = viewport.y + margin;
    const right = viewport.x + viewport.width - margin - a.width;
    const bottom = viewport.y + viewport.height - margin - a.height;
    if (right < left || bottom < top) continue;
    const x = clamp(a.x - a.width / 2, left, right);
    const preferredY = clamp(a.y - lift, top, bottom);
    const candidates = [
      preferredY,
      top,
      bottom,
      ...result.flatMap((r) => [r.y - gap - a.height, r.y + r.height + gap]),
    ]
      .filter((y) => y >= top && y <= bottom)
      .sort(
        (a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY) || a - b,
      );
    const y = candidates.find((y) =>
      result.every(
        (r) =>
          x + a.width + gap <= r.x ||
          r.x + r.width + gap <= x ||
          y + a.height + gap <= r.y ||
          r.y + r.height + gap <= y,
      ),
    );
    // In an overcrowded viewport retain readable higher-priority labels.
    if (y !== undefined)
      result.push({ id: a.id, x, y, width: a.width, height: a.height });
  }
  return result;
}
