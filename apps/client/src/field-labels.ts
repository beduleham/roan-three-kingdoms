export interface FieldLabel {
  text: string;
  x: number;
  y: number;
  width: number;
  memory?: boolean;
}
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

/** Display positions only. Never move the underlying unit or reveal hidden units. */
export function placeFieldLabels(
  labels: FieldLabel[],
  width: number,
  height: number,
) {
  const occupied: Box[] = labels.map(({ x, y }) => ({
    x: x - 18,
    y: y - 18,
    width: 36,
    height: 36,
  }));
  return labels.map((label) => {
    const w = Math.min(label.width + 8, width - 8),
      h = 20;
    let chosen: Box | undefined;
    for (let distance = 0; distance < height && !chosen; distance += 24) {
      for (const offset of [distance, -distance]) {
        const box = {
          x: Math.max(4, Math.min(width - w - 4, label.x + 22)),
          y: Math.max(4, Math.min(height - h - 4, label.y - 10 + offset)),
          width: w,
          height: h,
        };
        if (!occupied.some((other) => overlaps(box, other))) {
          chosen = box;
          break;
        }
      }
    }
    // In a crowded field, a free row elsewhere keeps every label readable.
    for (let y = 4; y <= height - h - 4 && !chosen; y += 24)
      for (let x = 4; x <= width - w - 4; x += 12) {
        const box = { x, y, width: w, height: h };
        if (!occupied.some((other) => overlaps(box, other))) {
          chosen = box;
          break;
        }
      }
    const box = chosen ?? { x: 4, y: 4, width: w, height: h };
    occupied.push(box);
    return { ...label, box };
  });
}
