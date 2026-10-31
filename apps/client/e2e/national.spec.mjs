import { test, expect } from "@playwright/test";
import { Client } from "@colyseus/sdk";
async function guests(browser, count = 3) {
  const pages = [];
  const errors = [];
  for (let i = 0; i < count; i++) {
    const p = await browser.newPage();
    pages.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(
      i
        ? await pages[0].locator("#invite-link").getAttribute("href")
        : "/online.html?mode=national",
    );
    await p.locator(i ? "#join" : "#create-private").click();
    await expect(p.locator("#identity")).toContainText(
      ["blue", "red", "green"][i % 3],
    );
  }
  return { pages, errors };
}
test("three browsers supply, grow, select augments, recruit and agree on overtime/result/ranking", async ({
  browser,
}) => {
  const { pages, errors } = await guests(browser);
  const [blue, red, green] = pages;
  try {
    await expect(blue.locator("#R")).toBeDisabled();
    await blue.locator("#start").click();
    await expect(blue.locator("#resupply")).toBeEnabled();
    await blue.locator("#squad").selectOption("blue-1-1");
    await blue.locator("#resupply").click();
    await expect(blue.locator("#supply-feedback")).toContainText("완료");
    await expect(blue.locator("#national-player")).toContainText("xiaowei");
    const first = blue.locator("#augment-offer button").first();
    await expect(first).toBeVisible();
    await expect(first).toContainText("%");
    await expect(first).toContainText("초");
    await first.click();
    await expect(blue.locator("#augment-progress")).toContainText("1/7");
    await blue.locator("#recruit").click();
    await expect(
      blue.locator("#squad option[value^='blue-1-recruit']"),
    ).toHaveCount(1);
    await expect(blue.locator("#national-clock")).toContainText("18분 연장", {
      timeout: 15000,
    });
    await expect(blue.locator("#national-clock")).toContainText(
      "21분 최종 연장",
    );
    await expect(blue.locator("#match-result")).toContainText("무승부", {
      timeout: 15000,
    });
    await expect(blue.locator("#objective-score")).toContainText(
      "남은 시간 0초",
    );
    const result = await blue.locator("#match-result").textContent(),
      ranking = await blue.locator("#national-ranking").textContent();
    for (const p of [red, green]) {
      await expect(p.locator("#match-result")).toHaveText(result);
      await expect(p.locator("#national-ranking")).toHaveText(ranking);
      await expect(p.locator("#clock")).toContainText("161 tick");
    }
    expect(ranking).toContain("blue-1");
    expect(ranking).toContain("red-1");
    expect(ranking).toContain("green-1");
    expect(ranking).not.toContain("blue-2");
    await expect(blue.locator("#move")).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});
test("nine browser seats share a lobby, reconnect and pause all nations before abandonment", async ({
  browser,
}) => {
  const { pages, errors } = await guests(browser, 9);
  const blue = pages[0],
    green = pages[2];
  try {
    await expect(blue.locator("#lobby")).toContainText("green-3");
    await blue.locator("#start").click();
    await expect(green.locator("#move")).toBeEnabled();
    await green.reload();
    await green.locator("#join").click();
    await expect(green.locator("#identity")).toContainText("green-1");
    await expect(green.locator("#move")).toBeEnabled();
    await green.locator("#leave").click();
    await expect(blue.locator("#match-result")).toContainText("경기 중단");
    expect(
      (await blue.locator("#national-ranking").textContent()).split("\n"),
    ).toHaveLength(9);
    await expect(blue.locator("#objective-score")).toContainText(
      "남은 시간 0초",
    );
    const ranking = await blue.locator("#national-ranking").textContent();
    for (const i of [1, 3, 4, 5, 6, 7, 8]) {
      await expect(pages[i].locator("#match-result")).toContainText(
        "경기 중단",
      );
      await expect(pages[i].locator("#national-ranking")).toHaveText(ranking);
    }
    const clock = await blue.locator("#clock").textContent();
    for (const i of [3, 6])
      await expect(pages[i].locator("#clock")).toHaveText(clock);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});
test("network clients cannot override rules, refill enemies or spoof growth; enemy progress stays private", async () => {
  const api = new Client("ws://127.0.0.1:4188"),
    peers = [];
  let state, denied;
  try {
    const blue = await api.create("battle_national", {
      checkpoints: [1, 2, 3],
      initialSupply: 999,
    });
    peers.push(blue);
    blue.onMessage("*", () => {});
    blue.onMessage("snapshot", (m) => (state = m.state));
    blue.onMessage("command-result", (m) => (denied = m));
    for (let i = 0; i < 2; i++) {
      const p = await api.joinById(blue.roomId);
      peers.push(p);
      p.onMessage("*", () => {});
    }
    blue.send("hello");
    await expect.poll(() => state?.nationalMatch?.deadline).toBe(100);
    expect(
      state.nationalMatch.players.every(
        (p) => p.nationId === "blue" && p.supplyPoints === 50,
      ),
    ).toBe(true);
    blue.send("start");
    blue.send("command", { type: "RESUPPLY", squadIds: ["green-1-1"] });
    await expect.poll(() => denied?.reason).toBe("NOT_OWNER");
    denied = null;
    blue.send("command", {
      type: "RECRUIT",
      unitType: "cavalry",
      squadIds: [],
      xp: 9999,
    });
    await expect.poll(() => denied?.reason).toBe("INVALID_FORMAT");
  } finally {
    await Promise.allSettled(peers.map((p) => p.leave()));
  }
});
