export interface MapPosition {
  x: number;
  y: number;
}
export interface MapCamera {
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
  const x = (position.x - camera.offsetX) / camera.scale,
    y = (position.y - camera.offsetY) / camera.scale;
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
