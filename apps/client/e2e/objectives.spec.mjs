import { test, expect } from "@playwright/test";
import { Client } from "@colyseus/sdk";

async function guests(browser) {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  await blue.goto("/online.html?mode=objectives");
  await blue.locator("#create-private").click();
  await expect(blue.locator("#identity")).toContainText("blue");
  const invite = await blue.locator("#invite-link").getAttribute("href");
  await red.goto(invite);
  await red.locator("#join").click();
  await expect(red.locator("#identity")).toContainText("red");
  await expect(blue.locator("#move")).toBeDisabled();
  await expect(red.locator("#start")).toBeDisabled();
  return { blue, red, invite };
}

test("real browsers capture, agree on scores, end, reject late joins and create a new invitation", async ({
  browser,
}) => {
  const { blue, red, invite } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(blue.locator("#move")).toBeEnabled();
    await blue.locator("#dest-x").fill("8");
    await blue.locator("#dest-y").fill("3");
    await blue.locator("#move").click();
    await expect(blue.locator("#match-result")).toContainText("blue 승리", {
      timeout: 15000,
    });
    await expect(red.locator("#match-result")).toHaveText(
      await blue.locator("#match-result").textContent(),
    );
    expect(await red.locator("#objective-score").textContent()).toBe(
      await blue.locator("#objective-score").textContent(),
    );
    await expect(red.locator("#move")).toBeDisabled();
    const clock = await blue.locator("#clock").textContent();
    await blue.waitForTimeout(350);
    expect(await blue.locator("#clock").textContent()).toBe(clock);
    const url = new URL(invite);
    const api = new Client("ws://127.0.0.1:4186");
    await expect(
      api.joinById(url.searchParams.get("room"), {
        inviteKey: new URLSearchParams(url.hash.slice(1)).get("invite"),
      }),
    ).rejects.toThrow();
    const old = await blue.locator("#online").getAttribute("data-room-id");
    await blue.locator("#next-match").click();
    await expect(blue.locator("#connection")).toContainText("로비 대기");
    expect(await blue.locator("#online").getAttribute("data-room-id")).not.toBe(
      old,
    );
    await expect(blue.locator("#objective-score")).toContainText(
      "blue 0 : 0 red",
    );
    await expect(blue.locator("#match-result")).toBeEmpty();
  } finally {
    await blue.close();
    await red.close();
  }
});

test("odd-tick deadline draws and final state survives reconnecting snapshot", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(blue.locator("#match-result")).toContainText(
      "무승부 · 시간 종료",
      { timeout: 15000 },
    );
    await expect(blue.locator("#clock")).toContainText("61 tick");
    await expect(red.locator("#clock")).toContainText("61 tick");
    await red.reload();
    await red.locator("#join").click();
    await expect(red.locator("#match-result")).toContainText(
      "무승부 · 시간 종료",
      { timeout: 15000 },
    );
    await expect(red.locator("#move")).toBeDisabled();
  } finally {
    await blue.close();
    await red.close();
  }
});

test("permanent departure aborts rather than awarding an unconfirmed forfeit win", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(red.locator("#move")).toBeEnabled();
    await red.locator("#leave").click();
    await expect(blue.locator("#match-result")).toContainText("경기 중단");
    await expect(blue.locator("#move")).toBeDisabled();
  } finally {
    await blue.close();
    await red.close();
  }
});

test("server ignores client rule overrides and rejects commands after the final snapshot", async () => {
  const api = new Client("ws://127.0.0.1:4186"),
    peers = [];
  try {
    const blue = await api.create("battle_objectives", {
      targetScore: 999,
      limitTicks: 999999,
    });
    peers.push(blue);
    let state, denied;
    blue.onMessage("*", () => {});
    blue.onMessage("snapshot", (message) => {
      state = message.state;
    });
    blue.onMessage("command-result", (message) => {
      denied = message;
    });
    blue.send("hello");
    await expect.poll(() => state?.objectiveMatch?.limitTicks).toBe(61);
    const red = await api.joinById(blue.roomId);
    peers.push(red);
    red.onMessage("*", () => {});
    red.send("hello");
    blue.send("start");
    await expect
      .poll(() => state?.objectiveMatch?.result?.tick, { timeout: 12000 })
      .toBe(61);
    blue.send("command", {
      type: "MOVE",
      squadIds: ["blue-1"],
      destination: { x: 8000, y: 3000 },
    });
    await expect.poll(() => denied?.reason).toBe("MATCH_FINISHED");
    blue.send("hello");
    await expect.poll(() => state?.tick).toBe(61);
  } finally {
    await Promise.allSettled(peers.map((room) => room.leave()));
  }
});
