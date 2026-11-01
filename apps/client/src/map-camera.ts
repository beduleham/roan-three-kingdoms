export interface MapPosition {
  x: number;
  y: number;
}
export interface MapCamera {
  projection?: "isometric";
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}
export function createMapCamera(
  world: MapPosition,
  pixels: MapPosition,
  zoom: number,
  focus: MapPosition,
  padding: number,
): MapCamera {
  if (
    ![
      world.x,
      world.y,
      pixels.x,
      pixels.y,
      zoom,
      focus.x,
      focus.y,
      padding,
    ].every(Number.isFinite) ||
    world.x <= 0 ||
    world.y <= 0 ||
    zoom < 1 ||
    padding < 0 ||
    pixels.x <= padding * 2 ||
    pixels.y <= padding * 2
  )
    throw new Error("Invalid map camera");
  const width = world.x / zoom,
    height = world.y / zoom;
  const scale = Math.min(
    (pixels.x - padding * 2) / width,
    (pixels.y - padding * 2) / height,
  );
  return {
    width,
    height,
    scale,
    left: Math.max(0, Math.min(world.x - width, focus.x - width / 2)),
    top: Math.max(0, Math.min(world.y - height, focus.y - height / 2)),
    offsetX: (pixels.x - width * scale) / 2,
    offsetY: (pixels.y - height * scale) / 2,
  };
}
export function worldToMap(
  position: MapPosition,
  camera: MapCamera,
): MapPosition {
  if (camera.projection === "isometric") {
    const x = position.x - camera.left,
      y = position.y - camera.top;
    return {
      x: camera.offsetX + (x - y) * camera.scale,
      y: camera.offsetY + ((x + y) * camera.scale) / 2,
    };
  }
  return {
    x: camera.offsetX + (position.x - camera.left) * camera.scale,
    y: camera.offsetY + (position.y - camera.top) * camera.scale,
  };
}
/** Letterbox margins are not part of the world and must not become movement targets. */
export function mapToWorld(
  position: MapPosition,
  camera: MapCamera,
): MapPosition | null {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const sx = (position.x - camera.offsetX) / camera.scale,
    sy = (position.y - camera.offsetY) / camera.scale;
  const x = camera.projection === "isometric" ? sx / 2 + sy : sx,
    y = camera.projection === "isometric" ? sy - sx / 2 : sy;
  if (
    x < -0.000001 ||
    y < -0.000001 ||
    x > camera.width + 0.000001 ||
    y > camera.height + 0.000001
  )
    return null;
  return {
    x: camera.left + Math.max(0, Math.min(camera.width, x)),
    y: camera.top + Math.max(0, Math.min(camera.height, y)),
  };
}

/** Same world viewport; only its presentation transform changes. */
export function createIsometricCamera(
  world: MapPosition,
  pixels: MapPosition,
  zoom: number,
  focus: MapPosition,
  padding: number,
): MapCamera {
  const c = createMapCamera(world, pixels, zoom, focus, padding);
  const sum = c.width + c.height,
    scale = Math.min(
      (pixels.x - padding * 2) / sum,
      (2 * (pixels.y - padding * 2)) / sum,
    );
  return {
    ...c,
    projection: "isometric",
    scale,
    offsetX: (pixels.x - sum * scale) / 2 + c.height * scale,
    offsetY: (pixels.y - (sum * scale) / 2) / 2,
  };
}
export function projectedRadius(radius: number, c: MapCamera) {
  const r = radius * c.scale;
  return c.projection === "isometric"
    ? { x: r * Math.SQRT2, y: r / Math.SQRT2 }
    : { x: r, y: r };
}
export function viewportCorners(c: MapCamera) {
  return [
    { x: c.left, y: c.top },
    { x: c.left + c.width, y: c.top },
    { x: c.left + c.width, y: c.top + c.height },
    { x: c.left, y: c.top + c.height },
  ].map((p) => worldToMap(p, c));
}
