import { test, expect } from "@playwright/test";
import { FaultProxy } from "../../server/test-support/fault-proxy.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("deployment acceptance CLI verifies real guest WS connections", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../server/test-support/remote-smoke.mjs", import.meta.url),
      ),
    ],
    {
      env: {
        ...process.env,
        DEMO_URL: "http://127.0.0.1:4185",
        REMOTE_SMOKE_SKIP_ONE_DELTA: "1",
      },
    },
  );
  const summary = JSON.parse(stdout.trim());
  expect(summary.resyncs.every((count) => count >= 1)).toBe(true);
  expect(summary).toMatchObject({
    ok: true,
    sameRoom: true,
    seats: ["blue", "red"],
    denied: "NOT_OWNER",
  });
});

async function guests(browser, proxy) {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  await blue.goto("/online.html");
  await blue.locator("#create-private").click();
  await expect(blue.locator("#identity")).toContainText("blue");
  const invitation = new URL(
    await blue.locator("#invite-link").getAttribute("href"),
  );
  if (proxy)
    invitation.searchParams.set("server", `ws://127.0.0.1:${proxy.port}`);
  await red.goto(invitation.href);
  await red.locator("#join").click();
  await expect(red.locator("#identity")).toContainText("red");
  await expect(red.locator("#move")).toBeEnabled();
  return { blue, red };
}
async function matchingObservation(blue, red) {
  const history = [new Map(), new Map()];
  await expect
    .poll(
      async () => {
        for (const [i, page] of [blue, red].entries()) {
          const sample = await page.evaluate(() => ({
            tick: document.querySelector("#clock").textContent.split(" ")[0],
            rows: document.querySelector("#units").textContent.split("\n"),
          }));
          history[i].set(sample.tick, sample.rows);
        }
        for (const [tick, rows] of history[0]) {
          if (Number(tick) < 2 || !history[1].has(tick)) continue;
          const other = new Map(
            history[1].get(tick).map((row) => [row.split(":")[0], row]),
          );
          const shared = rows.filter((row) => other.has(row.split(":")[0]));
          if (
            shared.length &&
            shared.every((row) => other.get(row.split(":")[0]) === row)
          )
            return true;
        }
        return false;
      },
      { timeout: 10000 },
    )
    .toBe(true);
}

test("production client and matchmaking share one origin without a server query", async ({
  browser,
  request,
}) => {
  const { blue, red } = await guests(browser);
  try {
    expect(new URL(blue.url()).searchParams.has("server")).toBe(false);
    expect(new URL(red.url()).searchParams.has("server")).toBe(false);
    await matchingObservation(blue, red);
    for (const path of [
      "/data/accounts.sqlite",
      "/.env",
      "/apps/server/src/index.ts",
      "/battle_config.v1.json",
    ])
      expect((await request.get(path)).status()).toBe(404);
    expect((await request.get("/healthz")).ok()).toBe(true);
  } finally {
    await blue.close();
    await red.close();
  }
});

test("ordered latency/jitter and temporary loss pause controls and restore the same room and seat", async ({
  browser,
}) => {
  const proxy = await new FaultProxy(4185, [40, 100, 60, 140]).listen();
  const { blue, red } = await guests(browser, proxy);
  try {
    const roomId = await red.locator("#online").getAttribute("data-room-id");
    const seat = await red.locator("#identity").textContent();
    await red.locator("#applyStance").click();
    await expect(red.locator("#result")).toContainText("명령 접수");
    await matchingObservation(blue, red);
    expect(proxy.delayedChunks).toBeGreaterThan(0);
    proxy.setBlocked(true);
    await expect(red.locator("#connection")).toContainText("연결 복구 중");
    await expect(red.locator("#move")).toBeDisabled();
    await expect(blue.locator("#connection")).toContainText("상대 접속 대기");
    const paused = await blue.locator("#clock").textContent();
    await blue.waitForTimeout(1000);
    expect(await blue.locator("#clock").textContent()).toBe(paused);
    proxy.setBlocked(false);
    await expect(red.locator("#move")).toBeEnabled({ timeout: 15000 });
    expect(await red.locator("#identity").textContent()).toBe(seat);
    expect(await red.locator("#online").getAttribute("data-room-id")).toBe(
      roomId,
    );
    await matchingObservation(blue, red);
    await red.locator("#applyFormation").click();
    await expect(red.locator("#result")).toContainText("명령 접수");
  } finally {
    await blue.close();
    await red.close();
    await proxy.close();
  }
});

test("loss beyond the real 30 second reservation expires authority and requires explicit entry", async ({
  browser,
}) => {
  test.setTimeout(80000);
  const proxy = await new FaultProxy(4185).listen();
  const { blue, red } = await guests(browser, proxy);
  try {
    proxy.setBlocked(true);
    await expect(red.locator("#move")).toBeDisabled();
    await expect(blue.locator("#connection")).toContainText("상대 접속 대기");
    await blue.waitForTimeout(31500);
    proxy.setBlocked(false);
    await expect(red.locator("#connection")).toContainText("재접속 실패", {
      timeout: 30000,
    });
    await expect(red.locator("#identity")).toBeEmpty();
    await expect(red.locator("#move")).toBeDisabled();
    await expect(red.locator("#join")).toBeEnabled();
    await red.locator("#join").click();
    await expect(red.locator("#identity")).toContainText("red");
    await expect(red.locator("#move")).toBeEnabled();
    await matchingObservation(blue, red);
  } finally {
    await blue.close();
    await red.close();
    await proxy.close();
  }
});
