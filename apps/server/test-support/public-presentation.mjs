import { createHash } from "node:crypto";
// Short isolated public UI acceptance. Never injects authoritative game state or prints invite keys.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = new URL(
  process.env.DEMO_URL ?? "https://roan-three-kingdoms.onrender.com",
);
assert(
  base.protocol === "https:" ||
    ["localhost", "127.0.0.1"].includes(base.hostname),
);
const proxy = process.env.DEMO_BROWSER_PROXY ?? process.env.HTTPS_PROXY;
if (process.env.DEMO_PROXY_CA_BYPASS === "1")
  assert(proxy, "Certificate override is scoped to an explicit test proxy");
const browser = await chromium.launch({
  ...(process.env.DEMO_CHROMIUM_PATH
    ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
    : {}),
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const errors = [],
  transport = [],
  pages = [];
try {
  const localHtml = await readFile(
    new URL("../../client/dist/online.html", import.meta.url),
    "utf8",
  );
  const expectedAsset = localHtml.match(/src="([^"]+\.js)"/)?.[1];
  assert(expectedAsset, "Build the production client first");
  let actualAsset, clientSha256;
  for (let i = 0; i < 3; i++) {
    const p = await browser.newPage({
      acceptDownloads: true,
      ignoreHTTPSErrors: process.env.DEMO_PROXY_CA_BYPASS === "1",
    });
    pages.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("requestfailed", (r) =>
      transport.push({
        path: new URL(r.url()).pathname,
        error: r.failure()?.errorText,
      }),
    );
    p.on("response", (r) => {
      if (r.status() >= 400)
        transport.push({ path: new URL(r.url()).pathname, status: r.status() });
    });
    await p.addInitScript(() => {
      window.phase8Acceptance = { voices: 0, w: false };
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        window.phase8Acceptance.voices++;
        return start.apply(this, args);
      };
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...args) {
        if (t === "W") window.phase8Acceptance.w = true;
        return text.call(this, t, ...args);
      };
    });
    const url = i
      ? await pages[0].locator("#invite-link").getAttribute("href")
      : new URL("/online.html?mode=national", base).href;
    const response = await p.goto(url, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    assert.equal(response.status(), 200);
    const asset = await p
      .locator('script[type="module"][src]')
      .getAttribute("src");
    assert.equal(
      asset,
      expectedAsset,
      "Public client is not the tested local build",
    );
    actualAsset = asset;
    await expect(p.locator("#sound-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await p.locator(i ? "#join" : "#create-private").click();
    await expect(p.locator("#identity")).toContainText(
      ["blue-1", "red-1", "green-1"][i],
      { timeout: 20000 },
    );
  }
  if (actualAsset) {
    const localJs = await readFile(
      new URL(`../../client/dist${actualAsset}`, import.meta.url),
    );
    const bundle = await pages[0].request.get(new URL(actualAsset, base).href);
    assert(bundle.ok());
    assert(
      localJs.equals(await bundle.body()),
      "Public bundle bytes differ from the tested local build",
    );
    clientSha256 = createHash("sha256").update(localJs).digest("hex");
  }
  const [blue, red, green] = pages;
  const ids = await Promise.all(
    pages.map((p) => p.locator("#online").getAttribute("data-room-id")),
  );
  assert(ids[0] && ids.every((x) => x === ids[0]));
  await blue.locator("#start").click();
  for (const p of pages) {
    await expect(p.locator("#field")).toHaveAttribute(
      "data-projection",
      "isometric",
    );
    await expect(p.locator("#online")).toHaveAttribute(
      "data-army-art",
      "ready",
    );
    await expect(p.locator("#move")).toBeEnabled();
  }
  await blue.locator("#W").click();
  await expect
    .poll(() => blue.evaluate(() => window.phase8Acceptance.w), {
      timeout: 10000,
    })
    .toBe(true);
  assert.equal(await blue.evaluate(() => window.phase8Acceptance.voices), 0);
  await red.bringToFront();
  await red.locator("#sound-toggle").click();
  await expect(red.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await red.locator("#W").click();
  await expect
    .poll(() => red.evaluate(() => window.phase8Acceptance.voices), {
      timeout: 10000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() => red.evaluate(() => window.phase8Acceptance.w))
    .toBe(true);
  await red.locator("#sound-toggle").click();
  await expect(red.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await blue.bringToFront();
  const point = await blue.locator("#field").evaluate((c) => {
    const d = c.dataset,
      x = 1000 - Number(d.left),
      y = 7000 - Number(d.top),
      s = Number(d.scale);
    return {
      x: Number(d.offsetX) + (x - y) * s,
      y: Number(d.offsetY) + ((x + y) * s) / 2,
    };
  });
  const box = await blue.locator("#field").boundingBox();
  await blue.locator("#field").click({
    position: {
      x: (point.x * box.width) / 720,
      y: (point.y * box.height) / 420,
    },
  });
  await expect(blue.locator("#dest-x")).toHaveValue("1");
  await expect(blue.locator("#dest-y")).toHaveValue("7");
  await blue.locator("#move").click();
  await expect(blue.locator("#result")).toContainText("명령 접수");
  await expect(blue.locator("#selected")).toContainText("MOVE");
  await blue
    .locator("#field")
    .screenshot({ path: "/tmp/phase8-public-field.png" });
  await blue.setViewportSize({ width: 390, height: 844 });
  assert(
    await blue.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await blue.locator("#reduce-effects").check();
  await expect(blue.locator("#reduce-effects")).toBeChecked();
  await green.locator("#leave").click();
  await expect(blue.locator("#match-result")).toContainText("경기 중단", {
    timeout: 10000,
  });
  await expect(red.locator("#match-result")).toHaveText(
    await blue.locator("#match-result").textContent(),
  );
  await expect(red.locator("#national-ranking")).toHaveText(
    await blue.locator("#national-ranking").textContent(),
  );
  const frozen = await blue.locator("#clock").textContent();
  await blue.waitForTimeout(600);
  assert.equal(await blue.locator("#clock").textContent(), frozen);
  await expect(blue.locator("#move")).toBeDisabled();
  const downloading = blue.waitForEvent("download");
  await blue.locator("#export-playtest").click();
  const download = await downloading;
  const record = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(record.schema, "phase7-playtest-v1");
  assert.equal(record.policyVersion, "phase7-v1");
  assert.equal(record.result.result.reason, "abandoned");
  assert(!JSON.stringify(record).includes("reconnectionToken"));
  assert(!JSON.stringify(record).includes("inviteKey"));
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    profile: "phase8-public-ui-v1",
    origin: base.origin,
    clientAsset: actualAsset,
    clientSha256,
    threeIndependentBrowsers: true,
    samePrivateRoom: true,
    isometric: true,
    inverseClickAccepted: true,
    observedW: true,
    defaultMuted: true,
    userActivatedAudio: true,
    narrowNoOverflow: true,
    reducedMotion: true,
    matchingAbandonment: true,
    frozen: true,
    recordDownload: true,
    pageErrors: 0,
    proxyBrowserCertificateOverride: process.env.DEMO_PROXY_CA_BYPASS === "1",
    limits:
      "Short real production-room acceptance; no artificial growth, no full15-minute result, no public Q/R unlock or hardware/audio quality certification",
  };
  await writeFile(
    "/tmp/phase8-public-acceptance.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const states = [];
  for (const p of pages)
    states.push(
      await p
        .locator("#connection")
        .textContent({ timeout: 1000 })
        .catch(() => "unavailable"),
    );
  console.error(JSON.stringify({ states, transport }));
  console.error(
    String(error).replace(/([#?&]invite=)[^\s"'<>]+/g, "$1[redacted]"),
  );
  process.exitCode = 1;
} finally {
  for (const p of pages)
    try {
      if (await p.locator("#leave").isEnabled({ timeout: 1000 }))
        await p.locator("#leave").click({ timeout: 2000 });
    } catch {}
  await browser.close();
}
