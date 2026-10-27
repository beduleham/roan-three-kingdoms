import { test, expect } from "@playwright/test";
import { replay } from "../../../packages/battle-core/dist/index.js";
async function state(page) {
  return page.evaluate(() => window.battleDemo.snapshot());
}
async function clickSquad(page, id, button = "left") {
  const s = (await state(page)).squads.find((s) => s.id === id);
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const box = await page.locator("canvas").boundingBox();
  const camera = await page.evaluate(() => window.battleDemo.view());
  await page.mouse.click(
    box.x +
      ((340 + (s.position.x - s.position.y) * 0.032 - camera.scrollX) *
        box.width) /
        960,
    box.y +
      ((20 + (s.position.x + s.position.y) * 0.016 - camera.scrollY) *
        box.height) /
        560,
    { button },
  );
}
async function clickGround(page, x, y, button = "right") {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const box = await page.locator("canvas").boundingBox();
  const camera = await page.evaluate(() => window.battleDemo.view());
  await page.mouse.click(
    box.x + ((340 + (x - y) * 0.032 - camera.scrollX) * box.width) / 960,
    box.y + ((20 + (x + y) * 0.016 - camera.scrollY) * box.height) / 560,
    { button },
  );
}
async function cast(page, skill, targets) {
  await page.locator(`#${skill}`).click();
  for (const target of targets) await clickSquad(page, target);
  await page.locator("#confirm").click();
}
async function tickAtLeast(page, n) {
  await expect
    .poll(async () => (await state(page)).tick)
    .toBeGreaterThanOrEqual(n);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () =>
      window.battleDemo?.view()?.loadedFootMotion &&
      window.battleDemo.view().visibleImages > 0 &&
      document.querySelector("canvas"),
  );
  await page.locator("#setup-panel > summary").click();
  await page.locator(".tactics > summary").click();
  await page.locator("#augment-panel > summary").click();
});
test("Phaser Q/W/R targeting, actual collision, HUD and headless replay", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await cast(page, "W", ["human-1", "human-2"]);
  await cast(page, "R", ["human-1", "human-2"]);
  await page.locator("#Q").click();
  await clickSquad(page, "enemy-1");
  expect((await state(page)).tick).toBe(0);
  await page.locator("#confirm").click();
  await page.locator("#pause").click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.battleDemo
            .log()
            .frames.flat()
            .filter((i) => i.command.type === "CAST_SKILL").length,
      ),
    )
    .toBe(3);
  await expect(page.locator("#events")).toContainText("CHARGE_IMPACT", {
    timeout: 15000,
  });
  await expect(page.locator("#commander")).toContainText("Q ");
  await expect(page.locator("#cards")).toContainText("전열");
  await page.locator("#pause").click();
  const log = await page.evaluate(() => window.battleDemo.log());
  const headless = replay(log.initial, log.frames);
  expect(headless.stateHash).toBe(log.stateHash);
  expect(headless.eventHash).toBe(log.eventHash);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("skills.png"),
    fullPage: true,
  });
});
test("move, attack, formation, ownership, reset and experimental shortage through UI", async ({
  page,
}) => {
  await page.keyboard.press("2");
  await clickGround(page, 7000, 9000);
  await page.locator("#pause").click();
  await tickAtLeast(page, 3);
  await page.locator("#pause").click();
  expect(
    (await state(page)).squads.find((s) => s.id === "human-2").position.x,
  ).toBeGreaterThan(6000);
  await page.locator("#formation").selectOption("defense");
  await page.locator("#applyFormation").click();
  await page.locator("#pause").click();
  await tickAtLeast(page, 22);
  await page.locator("#pause").click();
  expect(
    (await state(page)).squads.find((s) => s.id === "human-2").formation,
  ).toBe("defense");
  await clickSquad(page, "enemy-2", "right");
  const attackTick = (await state(page)).tick + 2;
  await page.locator("#pause").click();
  await tickAtLeast(page, attackTick);
  await page.locator("#pause").click();
  expect(
    (await page.evaluate(() => window.battleDemo.log())).frames
      .flat()
      .some((i) => i.command.type === "ATTACK"),
  ).toBe(true);
  await page.locator("#attackMove").click();
  await clickGround(page, 10000, 9000);
  await page.locator("#retreat").click();
  await clickGround(page, 2000, 9000);
  await page.locator("#stance").selectOption("aggressive");
  await page.locator("#applyStance").click();
  const nextTick = (await state(page)).tick + 2;
  await page.locator("#pause").click();
  await tickAtLeast(page, nextTick);
  await page.locator("#pause").click();
  const inputs = (
    await page.evaluate(() => window.battleDemo.log())
  ).frames.flat();
  expect(inputs.some((i) => i.command.type === "ATTACK_MOVE")).toBe(true);
  expect(inputs.some((i) => i.command.type === "RETREAT")).toBe(true);
  expect(
    (await state(page)).squads.find((s) => s.id === "human-2").stance,
  ).toBe("aggressive");
  await clickSquad(page, "enemy-1");
  await expect(page.locator("#notice")).toContainText("자기 부대");
  await page.locator("#human1").selectOption("archers");
  await page.locator("#experimental").check();
  await page.locator("#reset").click();
  expect((await state(page)).tick).toBe(0);
  expect((await page.evaluate(() => window.battleDemo.log())).frames).toEqual(
    [],
  );
  await page.locator("#augments button").first().click();
  await cast(page, "R", ["human-1"]);
  await page.locator("#pause").click();
  await tickAtLeast(page, 1);
  await page.locator("#pause").click();
  await expect(page.locator("#notice")).toContainText("MELEE_REQUIRED");
  await expect(page.locator("#augments")).toContainText("후보 부족");
  await expect(page.locator("#augments button")).toHaveCount(0);
});
test("90 seconds on the real browser clock preserves UI/headless state and event hashes", async ({
  page,
}) => {
  test.setTimeout(140000); // Real 90-second interactive render/tick run plus startup and headless replay.
  await cast(page, "R", ["human-1"]);
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  await expect
    .poll(async () => (await state(page)).tick, {
      timeout: 115000,
      intervals: [1000],
    })
    .toBeGreaterThanOrEqual(900);
  await page.locator("#pause").click();
  await expect(page.locator("#clock")).toContainText("90초 이상 실행");
  const log = await page.evaluate(() => window.battleDemo.log());
  const r = replay(log.initial, log.frames);
  expect(r.stateHash).toBe(log.stateHash);
  expect(r.eventHash).toBe(log.eventHash);
  expect(log.frames.flat().every((i) => i.playerId === "human")).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("90s.png"),
    fullPage: true,
  });
});

test("static artwork, resized canvas and panned camera retain command coordinates", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().visibleImages))
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.up("ArrowRight");
  expect(
    (await page.evaluate(() => window.battleDemo.view())).scrollX,
  ).toBeGreaterThan(0);
  await clickSquad(page, "human-2");
  await clickGround(page, 8000, 11000);
  await page.locator("#pause").click();
  await tickAtLeast(page, 2);
  await page.locator("#pause").click();
  const inputs = (
    await page.evaluate(() => window.battleDemo.log())
  ).frames.flat();
  const move = inputs.find((i) => i.command.type === "MOVE");
  expect(move.command.squadIds).toEqual(["human-2"]);
  // Pointer coordinates quantize to CSS pixels on a scaled canvas.
  // Bound the error in visible pixels rather than assuming a core-unit precision.
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const box = await page.locator("canvas").boundingBox();
  const dx = move.command.destination.x - 8000;
  const dy = move.command.destination.y - 11000;
  expect(Math.abs(((dx - dy) * 0.032 * box.width) / 960)).toBeLessThan(1.5);
  expect(Math.abs(((dx + dy) * 0.016 * box.height) / 560)).toBeLessThan(1.5);
  await page.locator("#reset").click();
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().scrollX))
    .toBe(0);
  await page.locator("#human1").selectOption("cavalry");
  await page.locator("#enemy1").selectOption("spears");
  await page.locator("#reset").click();
  await page.screenshot({
    path: test.info().outputPath("quarter-view.png"),
    fullPage: true,
  });
});

test("command desk shows selected gauges, explicit target step, cooldown and restart", async ({
  page,
}) => {
  await page.locator("#setup-panel > summary").click();
  await expect(page.locator("#setup-panel")).not.toHaveAttribute("open", "");
  await expect(page.locator("#selected-unit meter")).toHaveCount(3);
  await expect(page.locator("#confirm")).toBeDisabled();
  await page.locator("#Q").click();
  await expect(page.locator("#order-step")).toContainText("목표 지정");
  await expect(page.locator("#confirm")).toBeDisabled();
  await clickSquad(page, "enemy-1");
  await expect(page.locator("#order-step")).toContainText("돌격 실행");
  await expect(page.locator("#confirm")).toBeEnabled();
  await page.locator("#confirm").click();
  await page.locator("#pause").click();
  await tickAtLeast(page, 2);
  await page.locator("#pause").click();
  await expect(page.locator("#Q")).toBeDisabled();
  await expect(page.locator("#Q")).toContainText("초");
  await page.locator("#restart").click();
  expect((await state(page)).tick).toBe(0);
  await expect(page.locator("#Q")).toBeEnabled();
  await expect(page.locator("#confirm")).toBeDisabled();
  await page.locator(".tactics > summary").click();
  await page.locator("#augment-panel > summary").click();
  expect(await page.evaluate(() => window.battleDemo.view().loadedGround)).toBe(
    true,
  );
  await page.screenshot({
    path: test.info().outputPath("command-desk.png"),
    fullPage: true,
  });
});

test("spear direction and tick animation freeze on pause, attack follows real hits, all infantry types render", async ({
  page,
}) => {
  await page.locator("#human1").selectOption("spears");
  await page.locator("#human2").selectOption("infantry");
  await page.locator("#enemy1").selectOption("spears");
  await page.locator("#enemy2").selectOption("archers");
  await page.locator("#reset").click();
  const visual = () =>
    page.evaluate(() =>
      window.battleDemo.view().unitVisuals.find((o) => o.name === "human-1:0"),
    );
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().loadedMotion))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.battleDemo
            .view()
            .unitVisuals.filter(
              (o) =>
                o.texture === "infantry-walk" || o.texture === "archer-walk",
            ).length,
      ),
    )
    .toBe(16);
  await clickGround(page, 6000, 11000);
  await page.locator("#pause").click();
  await tickAtLeast(page, 3);
  await page.locator("#pause").click();
  expect(await visual()).toMatchObject({ texture: "spear-walk", mode: "walk" });
  expect(Number((await visual()).frame)).toBeGreaterThanOrEqual(4);
  expect(Number((await visual()).frame)).toBeLessThan(8);
  const frozen = await visual();
  await page.waitForTimeout(250);
  expect(await visual()).toEqual(frozen);
  await page.locator("#restart").click();
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  await expect
    .poll(() => visual(), { timeout: 15000, intervals: [100] })
    .toMatchObject({ texture: "spear-attack", mode: "attack" });
  await page.locator("#pause").click();
  const log = await page.evaluate(() => window.battleDemo.log());
  const result = replay(log.initial, log.frames);
  expect(result.stateHash).toBe(log.stateHash);
  expect(result.eventHash).toBe(log.eventHash);
  await page.screenshot({
    path: test.info().outputPath("unit-motion.png"),
    fullPage: true,
  });
  await page.locator("#restart").click();
  await expect
    .poll(() => visual())
    .toMatchObject({ texture: "spear-walk", mode: "idle", frame: "0" });
});

test("mounted commander follows direction, canter freezes, and actual Q accelerates animation", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().loadedMounted))
    .toBe(true);
  const visual = (name) =>
    page.evaluate(
      (n) => window.battleDemo.view().unitVisuals.find((o) => o.name === n),
      name,
    );
  await expect
    .poll(() => visual("human-1:0"))
    .toMatchObject({ texture: "cavalry-canter", mode: "idle" });
  await expect
    .poll(() => visual("human-commander"))
    .toMatchObject({ texture: "commander-canter", mode: "idle" });
  await clickGround(page, 6000, 11000);
  await page.locator("#pause").click();
  await tickAtLeast(page, 3);
  await page.locator("#pause").click();
  for (const name of ["human-1:0", "human-commander"]) {
    const v = await visual(name);
    expect(v.mode).toBe("canter");
    expect(Number(v.frame)).toBeGreaterThanOrEqual(4);
    expect(Number(v.frame)).toBeLessThan(8);
  }
  const frozen = [await visual("human-1:0"), await visual("human-commander")];
  await page.waitForTimeout(250);
  expect([await visual("human-1:0"), await visual("human-commander")]).toEqual(
    frozen,
  );
  await page.locator("#restart").click();
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  await expect
    .poll(() => visual("human-1:0"), { intervals: [50], timeout: 4000 })
    .toMatchObject({ mode: "charge" });
  await page.locator("#pause").click();
  expect(await visual("human-commander")).toMatchObject({ mode: "charge" });
  const log = await page.evaluate(() => window.battleDemo.log());
  const result = replay(log.initial, log.frames);
  expect(result.stateHash).toBe(log.stateHash);
  expect(result.eventHash).toBe(log.eventHash);
  await page.screenshot({
    path: test.info().outputPath("mounted-charge.png"),
    fullPage: true,
  });
  await page.locator("#restart").click();
  await expect
    .poll(() => visual("human-1:0"))
    .toMatchObject({ frame: "0", mode: "idle" });
  await expect
    .poll(() => visual("human-commander"))
    .toMatchObject({ frame: "0", mode: "idle" });
});

test("infantry and archers animate in four directions with event driven arrows, pause and reset", async ({
  page,
}) => {
  await page.locator("#human1").selectOption("infantry");
  await page.locator("#human2").selectOption("archers");
  await page.locator("#enemy1").selectOption("infantry");
  await page.locator("#enemy2").selectOption("archers");
  await page.locator("#reset").click();
  const visual = (name) =>
    page.evaluate(
      (n) => window.battleDemo.view().unitVisuals.find((o) => o.name === n),
      name,
    );
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().visibleArrows))
    .toBe(0);
  await clickGround(page, 6000, 11000);
  await page.keyboard.press("2");
  await clickGround(page, 8000, 9000);
  await page.locator("#pause").click();
  await tickAtLeast(page, 3);
  await page.locator("#pause").click();
  expect(await visual("human-1:0")).toMatchObject({
    texture: "infantry-walk",
    mode: "walk",
  });
  expect(Number((await visual("human-1:0")).frame)).toBeGreaterThanOrEqual(4);
  expect(Number((await visual("human-1:0")).frame)).toBeLessThan(8);
  expect(await visual("human-2:0")).toMatchObject({
    texture: "archer-walk",
    mode: "walk",
  });
  const frozen = [await visual("human-1:0"), await visual("human-2:0")];
  await page.waitForTimeout(200);
  expect([await visual("human-1:0"), await visual("human-2:0")]).toEqual(
    frozen,
  );
  await page.locator("#restart").click();
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  await expect
    .poll(() => visual("human-1:0"), { timeout: 15000, intervals: [100] })
    .toMatchObject({ texture: "infantry-attack", mode: "attack" });
  await expect
    .poll(() => visual("human-2:0"))
    .toMatchObject({ texture: "archer-attack", mode: "attack" });
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().visibleArrows))
    .toBeGreaterThan(0);
  await page.locator("#pause").click();
  const log = await page.evaluate(() => window.battleDemo.log());
  const result = replay(log.initial, log.frames);
  expect(result.stateHash).toBe(log.stateHash);
  expect(result.eventHash).toBe(log.eventHash);
  await page.screenshot({
    path: test.info().outputPath("foot-combat.png"),
    fullPage: true,
  });
  await page.locator("#restart").click();
  await expect
    .poll(() => page.evaluate(() => window.battleDemo.view().visibleArrows))
    .toBe(0);
  await expect
    .poll(() => visual("human-2:0"))
    .toMatchObject({ texture: "archer-walk", mode: "idle" });
});

test("retired art is not requested, actual damage flashes and reset restores normal tint", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.reload();
  await page.waitForFunction(
    () =>
      window.battleDemo?.view()?.loadedFootMotion &&
      window.battleDemo.view().visibleImages > 0,
  );
  expect(
    await page.evaluate(() => window.battleDemo.view().retiredTexturesPresent),
  ).toBe(false);
  expect(
    requests.some(
      (url) => url.includes("unit-art") || url.includes("foot-units.svg"),
    ),
  ).toBe(false);
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  const damaged = () =>
    page.evaluate(() =>
      window.battleDemo
        .view()
        .unitVisuals.filter((o) => o.name.startsWith("enemy-1:"))
        .some((o) => o.tint !== 0xffffff),
    );
  await expect.poll(damaged, { timeout: 15000, intervals: [100] }).toBe(true);
  await page.locator("#pause").click();
  const frozen = await page.evaluate(
    () => window.battleDemo.view().unitVisuals,
  );
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.battleDemo.view().unitVisuals),
  ).toEqual(frozen);
  const log = await page.evaluate(() => window.battleDemo.log());
  const result = replay(log.initial, log.frames);
  expect(result.stateHash).toBe(log.stateHash);
  expect(result.eventHash).toBe(log.eventHash);
  await page.locator("#restart").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.battleDemo
          .view()
          .unitVisuals.filter((o) => o.name.startsWith("enemy-1:"))
          .every((o) => o.tint === 0xffffff),
      ),
    )
    .toBe(true);
});

test("nameplates remain separate during combat and camera movement", async ({
  page,
}) => {
  const checkLabels = async () => {
    const view = await page.evaluate(() => window.battleDemo.view());
    expect(view.labels.length).toBeGreaterThanOrEqual(2);
    for (const [i, a] of view.labels.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(7.9);
      expect(a.y).toBeGreaterThanOrEqual(7.9);
      expect(a.x + a.width).toBeLessThanOrEqual(952.1);
      expect(a.y + a.height).toBeLessThanOrEqual(552.1);
      for (const b of view.labels.slice(i + 1))
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
    }
  };
  await checkLabels();
  const hp = (await state(page)).squads.find((s) => s.id === "enemy-1").hpMilli;
  await cast(page, "Q", ["enemy-1"]);
  await page.locator("#pause").click();
  await expect
    .poll(
      async () =>
        (await state(page)).squads.find((s) => s.id === "enemy-1").hpMilli,
      { timeout: 15000 },
    )
    .toBeLessThan(hp);
  await page.locator("#pause").click();
  await checkLabels();
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(180);
  await page.keyboard.up("ArrowRight");
  await checkLabels();
  await page.screenshot({ path: "apps/client/test-results/nameplates.png" });
});
