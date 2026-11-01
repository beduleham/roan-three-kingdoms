import { readFile } from "node:fs/promises";
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
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-presentation",
      "phase8-hud-v1",
    );
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-army-art",
      "ready",
    );
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
    await blue
      .locator("#playtest-notes")
      .fill("방어 역할 / 증강을 고른 이유 기록");
    const downloading = blue.waitForEvent("download");
    await blue.locator("#export-playtest").click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("phase7-playtest-blue-1.json");
    const record = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(record.schema).toBe("phase7-playtest-v1");
    expect(record.policyVersion).toBe("phase7-v1");
    expect(record.seat).toBe("blue-1");
    expect(record.result.result.reason).toBe("time");
    expect(record.coverage.lastObservedTick).toBe(161);
    expect(
      record.submittedCommands.some((c) => c.type === "SELECT_AUGMENT"),
    ).toBe(true);
    expect(record.changes.some((c) => c.selected?.length > 0)).toBe(true);
    expect(record.notes).toContain("방어 역할");
    expect(JSON.stringify(record)).not.toContain("inviteKey");
    expect(JSON.stringify(record)).not.toContain("reconnectionToken");
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
    const recovery = pages[6];
    await expect(recovery.locator("#move")).toBeDisabled();
    await expect(recovery.locator("#resupply")).toBeDisabled();
    await recovery.locator("#recruit").click();
    await expect(
      recovery.locator("#squad option[value^='blue-3-recruit']"),
    ).toHaveCount(1);
    await expect(recovery.locator("#move")).toBeEnabled();
    await recovery.locator("#reassign").click();
    await expect(recovery.locator("#commander")).toContainText("ACTIVE");
    await expect(recovery.locator("#commander")).toContainText(
      "blue-3-recruit",
    );
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

test("Phase8 HUD keeps battlefield commands accessible on desktop and narrow screens", async ({
  browser,
}) => {
  const { pages, errors } = await guests(browser);
  const blue = pages[0];
  try {
    await blue.locator("#start").click();
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-army-art",
      "ready",
    );
    const field = await blue.locator("#field").boundingBox();
    const commands = await blue.locator("#war-commands").boundingBox();
    expect(commands.y).toBeGreaterThan(field.y);
    await blue.screenshot({ path: "/tmp/phase8-desktop.png", fullPage: true });
    await blue.setViewportSize({ width: 390, height: 844 });
    await expect(blue.locator("#move")).toBeEnabled();
    await blue.locator("#move").click();
    await expect(blue.locator("#result")).toContainText("명령 접수");
    expect(
      await blue.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await blue.screenshot({ path: "/tmp/phase8-mobile.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});

test("Phase8 verified skill cues honor default mute and explicit audio/reduced-motion controls", async ({
  browser,
}) => {
  const { pages, errors } = await guests(browser),
    blue = pages[0];
  try {
    // Reload before starting to install observation hooks without injecting game state.
    await blue.addInitScript(() => {
      window.cueLabels = [];
      window.voiceStarts = 0;
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...args) {
        if (["Q", "W", "R"].includes(String(t)))
          window.cueLabels.push(String(t));
        return text.call(this, t, ...args);
      };
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...a) {
        window.voiceStarts++;
        return start.apply(this, a);
      };
    });
    await blue.reload();
    await blue.locator("#join").click();
    await blue.locator("#start").click();
    await expect(blue.locator("#W")).toBeEnabled();
    await blue.locator("#W").click();
    await expect
      .poll(() => blue.evaluate(() => window.cueLabels.includes("W")))
      .toBe(true);
    expect(await blue.evaluate(() => window.voiceStarts)).toBe(0);
    await blue.bringToFront();
    await blue.locator("#sound-toggle").click();
    await expect(blue.locator("#sound-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(blue.locator("#R")).toBeEnabled();
    await blue.locator("#R").click();
    await expect
      .poll(() => blue.evaluate(() => window.voiceStarts))
      .toBeGreaterThan(0);
    await expect
      .poll(() => blue.evaluate(() => window.cueLabels.includes("R")))
      .toBe(true);
    await blue.locator("#reduce-effects").check();
    await expect(blue.locator("#reduce-effects")).toBeChecked();
    await blue.locator("#sound-toggle").click();
    await expect(blue.locator("#sound-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});

test("Phase8 three-client render sample bounds paint history and avoids frame-rate minimap redraw", async ({
  browser,
}) => {
  const { pages, errors } = await guests(browser);
  try {
    await expect(pages[0].locator("#online")).toHaveAttribute(
      "data-army-art",
      "ready",
    );
    const initialArtRequests = Number(
      await pages[0].locator("#online").getAttribute("data-art-requests"),
    );
    expect(initialArtRequests).toBe(3);
    await pages[0].locator("#start").click();
    for (const p of pages)
      await expect(p.locator("#online")).toHaveAttribute(
        "data-performance",
        /.+/,
      );
    // Gather an explicit short local render sample, not a hardware certification.
    await pages[0].waitForTimeout(6500);
    const reports = await Promise.all(
      pages.map((p) =>
        p.locator("#online").evaluate((e) => JSON.parse(e.dataset.performance)),
      ),
    );
    for (const r of reports) {
      expect(r.samples).toBeLessThanOrEqual(180);
      expect(r.frames).toBeGreaterThanOrEqual(30);
      expect(r.minimapPaints).toBeLessThan(r.frames);
      expect(r.paintP95Ms).toBeGreaterThanOrEqual(0);
    }
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        "/tmp/phase8-render-sample.json",
        JSON.stringify(
          {
            environment:
              "local Chromium headless, three accelerated national clients, no GPU/device certification",
            initialArtRequests,
            reports,
          },
          null,
          2,
        ),
      ),
    );
    await pages[0].screenshot({
      path: "/tmp/phase8-isometric-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
});
