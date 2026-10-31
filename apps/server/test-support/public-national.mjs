// Explicit acceptance against an isolated private guest room. Takes up to 22.5 minutes.
import { chromium, expect as baseExpect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 30000 });
const base = new URL(
  process.env.DEMO_URL ?? "https://roan-three-kingdoms.onrender.com",
);
assert(
  base.protocol === "https:" ||
    (base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)),
  "Remote hosts require HTTPS",
);
const url = new URL("/online.html?mode=national", base).href;
const output = resolve(
  process.env.DEMO_REPORT_DIR ?? resolve(tmpdir(), "roan-national-public"),
);
mkdirSync(output, { recursive: true });
const outputPath = (name) => resolve(output, name);
const browser = await chromium.launch({
  ...(process.env.DEMO_CHROMIUM_PATH
    ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
    : {}),
  ...(process.env.DEMO_BROWSER_PROXY
    ? { proxy: { server: process.env.DEMO_BROWSER_PROXY } }
    : {}),
  args: ["--no-sandbox"],
});
const pages = [],
  contexts = [],
  errors = [],
  evidence = {
    url,
    profile: "public production clock, no rule overrides",
    startedAt: new Date().toISOString(),
    testProxyTlsBypass: process.env.DEMO_TEST_PROXY_TLS === "1",
    samples: [],
    checks: {},
    errors,
  };
const save = () =>
  writeFileSync(outputPath("result.json"), JSON.stringify(evidence, null, 2));
try {
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: process.env.DEMO_TEST_PROXY_TLS === "1",
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(ctx);
    const p = await ctx.newPage();
    pages.push(p);
    p.setDefaultTimeout(30000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(
      i ? await pages[0].locator("#invite-link").getAttribute("href") : url,
      { timeout: 60000 },
    );
    await p.locator(i ? "#join" : "#create-private").click();
    await expect(p.locator("#identity")).toContainText(
      ["blue-1", "red-1", "green-1"][i],
    );
  }
  evidence.checks.sameRoom = (
    await Promise.all(
      pages.map((p) => p.locator("#online").getAttribute("data-room-id")),
    )
  ).every((r, i, a) => r === a[0]);
  await pages[0].locator("#start").click();
  await expect(pages[0].locator("#move")).toBeEnabled();
  evidence.checks.started = true;
  save();
  console.log("Public three-browser national match started");
  let recruited = false,
    refilled = false,
    augment = false,
    map = false;
  for (let iteration = 0; iteration < 135; iteration++) {
    const sample = {
      clock: await pages[0].locator("#clock").textContent(),
      growth: await pages[0].locator("#national-player").textContent(),
      economy: await pages[0].locator("#national-economy").textContent(),
      score: await pages[0].locator("#objective-score").textContent(),
      phase: await pages[0].locator("#national-clock").textContent(),
    };
    evidence.samples.push(sample);
    save();
    if (iteration % 3 === 0) console.log(JSON.stringify(sample));
    if (!map) {
      const room = await pages[0]
        .locator("#online")
        .getAttribute("data-room-id");
      await pages[0].locator("#view-battle").click();
      await pages[0].locator("#view-overview").click();
      evidence.checks.mapRoomPreserved =
        (await pages[0].locator("#online").getAttribute("data-room-id")) ===
        room;
      map = true;
    }
    if (!augment && (await pages[0].locator("#augment-offer button").count())) {
      await pages[0].locator("#augment-offer button").first().click();
      await expect(pages[0].locator("#augment-progress")).toContainText("1/7");
      augment = true;
      evidence.checks.augmentSelected = true;
    }
    if (
      !recruited &&
      /관직 (xiaowei|zhonglangjiang|general)/.test(sample.growth)
    ) {
      await pages[0].locator("#recruit").click();
      await expect(
        pages[0].locator('#squad option[value^="blue-1-recruit"]'),
      ).toHaveCount(1);
      recruited = true;
      evidence.checks.recruitCompleted = true;
    }
    if (recruited && !refilled) {
      const id = await pages[0]
        .locator('#squad option[value^="blue-1-recruit"]')
        .getAttribute("value");
      await pages[0].locator("#squad").selectOption(id);
      await pages[0].locator("#resupply").click();
      await expect(pages[0].locator("#supply-feedback")).toContainText("완료");
      refilled = true;
      evidence.checks.refillCompleted = true;
      await pages[0].screenshot({
        path: outputPath("growth.png"),
        fullPage: true,
      });
    }
    if ((await pages[0].locator("#match-result").textContent()).trim()) break;
    await pages[0].waitForTimeout(10000);
  }
  const result = await pages[0].locator("#match-result").textContent();
  if (!result.trim())
    throw Error("Public match did not finish within 22.5 minutes");
  const ranking = await pages[0].locator("#national-ranking").textContent(),
    score = await pages[0].locator("#objective-score").textContent();
  for (const p of pages.slice(1)) {
    await expect(p.locator("#match-result")).toHaveText(result);
    await expect(p.locator("#national-ranking")).toHaveText(ranking);
    await expect(p.locator("#objective-score")).toHaveText(score);
  }
  evidence.checks.matchingResults = true;
  evidence.result = result;
  evidence.ranking = ranking;
  evidence.score = score;
  const clock = await pages[0].locator("#clock").textContent();
  await pages[0].waitForTimeout(500);
  await expect(pages[0].locator("#clock")).toHaveText(clock);
  await expect(pages[0].locator("#move")).toBeDisabled();
  evidence.checks.frozen = true;
  await expect(pages[0].locator("#objective-score")).toContainText(
    "남은 시간 0초",
  );
  evidence.checks.countdownZero = true;
  await pages[0].screenshot({ path: outputPath("final.png"), fullPage: true });
  if (errors.length) throw Error(errors.join(";"));
  evidence.ok = true;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(
    "PUBLIC ACCEPTANCE COMPLETE " +
      JSON.stringify({ result, checks: evidence.checks }),
  );
} catch (e) {
  evidence.ok = false;
  evidence.failure = String(e);
  evidence.ui = await Promise.all(
    pages.map(async (p) => ({
      connection: await p.locator("#connection").textContent(),
      result: await p.locator("#result").textContent(),
    })),
  );
  save();
  throw e;
} finally {
  await browser.close();
}
