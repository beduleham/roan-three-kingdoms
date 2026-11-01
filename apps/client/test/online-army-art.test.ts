import { afterEach, expect, it, vi } from "vitest";
import { OnlineArmyArt, armyHit } from "../src/online-army-art.js";
import type { VisibleSquad } from "@roan/protocol";
const images: {
  complete: boolean;
  naturalWidth: number;
  onerror?: () => void;
}[] = [];
function setup() {
  images.length = 0;
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 1254;
      onerror?: () => void;
      src = "";
      constructor() {
        images.push(this);
      }
    },
  );
  return new OnlineArmyArt();
}
function squad(): VisibleSquad {
  return {
    id: "a",
    ownerPlayerId: "blue-1",
    nationId: "blue",
    unitType: "spears",
    position: { x: 0, y: 0 },
    facing: { x: 1, y: 0 },
    hpMilli: 1000000,
    maxSoldiers: 20,
    soldiers: 10,
    morale: 100,
    cohesion: 100,
    stance: "balanced",
    formation: "normal",
    fsmState: "IDLE",
  };
}
function context() {
  return {
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
afterEach(() => vi.unstubAllGlobals());
it("selects the visible soldier body above its authoritative foot without claiming distant ground", () => {
  expect(armyHit({ x: 100, y: 63 }, { x: 100, y: 100 })).toBe(true);
  expect(armyHit({ x: 132, y: 100 }, { x: 100, y: 100 })).toBe(false);
  expect(armyHit({ x: 100, y: 40 }, { x: 100, y: 100 })).toBe(false);
});
it("loads only initial shared atlases once and reports degraded loading without blocking input", () => {
  const art = setup();
  expect(images).toHaveLength(3);
  expect(art.status).toBe("ready");
  images[0]!.complete = false;
  expect(art.status).toBe("loading");
  images[0]!.onerror?.();
  expect(art.status).toBe("degraded");
});
it("uses cropped frames and bounded display soldiers, preserves the visible state and resets room motion", () => {
  const art = setup(),
    ctx = context(),
    s = squad(),
    before = structuredClone(s);
  art.draw(ctx, s, 100, 100, 0, [], true);
  expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  expect(s).toEqual(before);
  s.position.x = 200;
  art.draw(ctx, s, 100, 100, 2, [], false);
  const frame = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
  expect(
    frame.slice(1, 5).every((x: unknown) => typeof x === "number" && x >= 0),
  ).toBe(true);
  art.reset();
  art.draw(ctx, s, 100, 100, 0, [], false);
  expect(ctx.drawImage).toHaveBeenCalledTimes(7);
});
it("never renders dead troops or extra soldiers based on hidden entities", () => {
  const art = setup(),
    ctx = context(),
    s = squad();
  s.hpMilli = 0;
  art.draw(ctx, s, 0, 0, 10, [], true);
  expect(ctx.drawImage).not.toHaveBeenCalled();
});
it("falls back when an image fails and displays server-observed rout feedback", () => {
  const art = setup(),
    ctx = context(),
    s = squad();
  for (const image of images) image.naturalWidth = 0;
  s.fsmState = "ROUTED";
  art.draw(ctx, s, 0, 0, 10, [], false);
  expect(ctx.drawImage).not.toHaveBeenCalled();
  expect(ctx.fillRect).toHaveBeenCalled();
  expect(ctx.fillText).toHaveBeenCalledWith("패주", -12, -34);
});

it("does not show an attack clip while the server-observed unit is routed", () => {
  const art = setup(),
    ctx = context(),
    s = squad();
  s.fsmState = "ROUTED";
  art.draw(
    ctx,
    s,
    0,
    0,
    11,
    [
      {
        type: "ATTACK_HIT",
        tick: 10,
        actorId: s.id,
        targetId: "enemy",
        delta: -10,
      },
    ],
    false,
  );
  const calls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  expect(
    calls.every((c) => !(c[0] as { src: string }).src.includes("attack")),
  ).toBe(true);
});

it("requests uncommon unit art only when visible and caches subsequent frames", () => {
  const art = setup(),
    ctx = context(),
    s = squad();
  expect(art.requestedAssets).toBe(3);
  s.unitType = "cavalry";
  art.draw(ctx, s, 0, 0, 1, [], false);
  expect(art.requestedAssets).toBe(4);
  art.draw(ctx, s, 0, 0, 2, [], false);
  expect(art.requestedAssets).toBe(4);
});

it("draws an isolated observed-injury fade without creating a commander entity", () => {
  const art = setup(),
    ctx = context();
  art.drawWounded(ctx, 30, 50, 0.5, false);
  expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  expect(ctx.rotate).toHaveBeenCalledWith(0.4);
  art.drawWounded(ctx, 30, 50, 0.5, true);
  expect(ctx.rotate).toHaveBeenLastCalledWith(0);
});

it("reduced motion freezes both troop and commander gait frames while preserving their observed feet", () => {
  const art = setup(),
    ctx = context(),
    s = squad();
  art.reducedMotion = true;
  art.draw(ctx, s, 20, 30, 0, [], true);
  s.position.x += 100;
  (ctx.drawImage as ReturnType<typeof vi.fn>).mockClear();
  art.draw(ctx, s, 20, 30, 4, [], true);
  expect(
    (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.every(
      (c) => c[1] === 0,
    ),
  ).toBe(true);
  expect(s.position.x).toBe(100);
});
