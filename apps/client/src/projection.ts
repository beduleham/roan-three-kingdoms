export interface Point {
  x: number;
  y: number;
}
// Presentation only: x/y remain integer simulation units in battle-core.
export const projection = {
  originX: 340,
  originY: 20,
  scaleX: 0.032,
  scaleY: 0.016,
};
export function project(p: Point): Point {
  return {
    x: projection.originX + (p.x - p.y) * projection.scaleX,
    y: projection.originY + (p.x + p.y) * projection.scaleY,
  };
}
export function unproject(p: Point): Point {
  const a = (p.x - projection.originX) / projection.scaleX;
  const b = (p.y - projection.originY) / projection.scaleY;
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
export function groundRing(p: Point, radius: number): Point[] {
  return Array.from({ length: 49 }, (_, i) =>
    project({
      x: p.x + Math.cos((i * Math.PI) / 24) * radius,
      y: p.y + Math.sin((i * Math.PI) / 24) * radius,
    }),
  );
}
