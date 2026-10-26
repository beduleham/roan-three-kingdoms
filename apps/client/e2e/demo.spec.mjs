import { test, expect } from "@playwright/test";
import { replay } from "../../../packages/battle-core/dist/index.js";
async function state(page) {
  return page.evaluate(() => window.battleDemo.snapshot());
}
async function clickSquad(page, id, button = "left") {
  const s = (await state(page)).squads.find((s) => s.id === id);
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    box.x + ((s.position.x / 1000) * 40 * box.width) / 960,
    box.y + ((s.position.y / 1000) * 40 * box.height) / 560,
    { button },
  );
}
async function clickGround(page, x, y, button = "right") {
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    box.x + ((x / 1000) * 40 * box.width) / 960,
    box.y + ((y / 1000) * 40 * box.height) / 560,
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
    () => window.battleDemo && document.querySelector("canvas"),
  );
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
  await page.locator("#pause").click();
  await tickAtLeast(page, 24);
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
