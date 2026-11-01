import { test, expect } from "@playwright/test";
async function guests(browser) {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  await blue.addInitScript(() => {
    window.fieldLabels = {};
    const fill = CanvasRenderingContext2D.prototype.fillText,
      rect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (
        x === 0 &&
        y === 0 &&
        w === this.canvas.width &&
        h === this.canvas.height
      )
        window.fieldLabels[this.canvas.id] = [];
      return rect.call(this, x, y, w, h);
    };
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      (window.fieldLabels[this.canvas.id] ??= []).push(String(text));
      return fill.call(this, text, ...args);
    };
  });
  await blue.goto("/online.html?mode=objectives");
  await blue.locator("#create-private").click();
  await expect(blue.locator("#identity")).toContainText("blue");
  await red.goto(await blue.locator("#invite-link").getAttribute("href"));
  await red.locator("#join").click();
  await expect(red.locator("#identity")).toContainText("red");
  return { blue, red };
}
async function move(p, id, x, y) {
  await p.locator("#squad").selectOption(id);
  await p.locator("#dest-x").fill(String(x));
  await p.locator("#dest-y").fill(String(y));
  await p.locator("#move").click();
}
async function fieldPoint(p, x, y) {
  return p.locator("#field").evaluate(
    (c, { x, y }) => {
      const left = Number(c.dataset.left),
        top = Number(c.dataset.top),
        w = Number(c.dataset.width),
        h = Number(c.dataset.height);
      const scale = Number(c.dataset.scale),
        ox = Number(c.dataset.offsetX),
        oy = Number(c.dataset.offsetY);
      return c.dataset.projection === "isometric"
        ? {
            x: ox + (x - left - (y - top)) * scale,
            y: oy + ((x - left + (y - top)) * scale) / 2,
          }
        : { x: ox + (x - left) * scale, y: oy + (y - top) * scale };
    },
    { x, y },
  );
}
async function clickWorld(p, x, y) {
  const point = await fieldPoint(p, x, y),
    box = await p.locator("#field").boundingBox();
  await p.locator("#field").click({
    position: {
      x: (point.x * box.width) / 720,
      y: (point.y * box.height) / 420,
    },
  });
}

test("map navigation changes only the local camera and preserves the same server world", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    const clock = await blue.locator("#clock").textContent(),
      room = await blue.locator("#online").getAttribute("data-room-id");
    await blue.locator('[data-point="east"]').click();
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-map-view",
      "battle",
    );
    await expect(blue.locator("#field")).toHaveAttribute("data-width", "12000");
    await blue.locator("#focus-own").click();
    await blue.locator('[data-pan="1,0"]').click();
    await blue.locator("#view-overview").click();
    await expect(blue.locator("#field")).toHaveAttribute("data-width", "24000");
    const beforeX = await blue.locator("#dest-x").inputValue();
    const mini = await blue.locator("#strategic-map").boundingBox();
    await blue
      .locator("#strategic-map")
      .click({ position: { x: mini.width * 0.8, y: mini.height * 0.7 } });
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-map-view",
      "battle",
    );
    expect(await blue.locator("#dest-x").inputValue()).toBe(beforeX);
    expect(await blue.locator("#clock").textContent()).toBe(clock);
    expect(await blue.locator("#online").getAttribute("data-room-id")).toBe(
      room,
    );
    await expect(red.locator("#online")).toHaveAttribute(
      "data-map-view",
      "overview",
    );
    expect(
      await blue.evaluate(
        () =>
          document.querySelector("#field").dataset.tick ===
          document.querySelector("#strategic-map").dataset.tick,
      ),
    ).toBe(true);
  } finally {
    await blue.close();
    await red.close();
  }
});

test("zoomed hit testing and destination mapping control the intended world position while ticks keep advancing", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(blue.locator("#move")).toBeEnabled();
    await blue.locator('[data-point="west"]').click();
    await blue.locator("#squad").selectOption("blue-2");
    await clickWorld(blue, 6000, 4000);
    await expect(blue.locator("#squad")).toHaveValue("blue-1");
    await clickWorld(blue, 8000, 3000);
    await expect(blue.locator("#dest-x")).toHaveValue("8");
    await expect(blue.locator("#dest-y")).toHaveValue("3");
    await blue.locator("#field").click({ position: { x: 1, y: 1 } });
    await expect(blue.locator("#dest-x")).toHaveValue("8");
    await blue.locator("#move").click();
    const first = await blue.locator("#clock").textContent();
    await blue.locator("#view-overview").click();
    await blue.locator('[data-point="west"]').click();
    await expect
      .poll(async () =>
        Number(await blue.locator("#online").getAttribute("data-render-x")),
      )
      .toBeCloseTo((await fieldPoint(blue, 8000, 3000)).x, 0);
    await expect(blue.locator("#objective-points")).toContainText(
      "서쪽 거점 (+1점): blue",
      { timeout: 12000 },
    );
    expect(await blue.locator("#clock").textContent()).not.toBe(first);
  } finally {
    await blue.close();
    await red.close();
  }
});

test("switching views preserves fog and the frozen last sighting without restoring hidden enemy controls", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(red.locator("#move")).toBeEnabled();
    await Promise.all([move(blue, "blue-1", 2, 2), move(red, "red-1", 22, 12)]);
    await Promise.all([move(blue, "blue-2", 2, 2), move(red, "red-2", 22, 12)]);
    await expect(blue.locator("#target option")).toHaveCount(0, {
      timeout: 15000,
    });
    const memory = await blue.locator("#last-seen").textContent();
    expect(memory).toContain("red-1");
    await blue.locator('[data-point="east"]').click();
    await blue.locator("#view-overview").click();
    await blue.locator("#view-battle").click();
    await expect(blue.locator("#target option")).toHaveCount(0);
    expect(await blue.locator("#last-seen").textContent()).toBe(memory);
    await blue.locator("#focus-own").click();
    await blue.waitForTimeout(100);
    const labels = await blue.evaluate(() => window.fieldLabels.field ?? []);
    expect(labels).not.toContain("red-1");
    expect(labels).not.toContain("red-2");
  } finally {
    await blue.close();
    await red.close();
  }
});

test("finished matches remain frozen while browsing and a new match resets the local view", async ({
  browser,
}) => {
  const { blue, red } = await guests(browser);
  try {
    await blue.locator("#start").click();
    await expect(red.locator("#move")).toBeEnabled();
    await red.locator("#leave").click();
    await expect(blue.locator("#match-result")).toContainText("경기 중단");
    const clock = await blue.locator("#clock").textContent();
    await blue.locator('[data-point="east"]').click();
    await blue.locator("#view-overview").click();
    await blue.locator("#view-battle").click();
    await expect(blue.locator("#move")).toBeDisabled();
    expect(await blue.locator("#clock").textContent()).toBe(clock);
    await expect(blue.locator("#match-result")).toContainText("경기 중단");
    await blue.locator("#next-match").click();
    await expect(blue.locator("#connection")).toContainText("로비 대기");
    await expect(blue.locator("#online")).toHaveAttribute(
      "data-map-view",
      "overview",
    );
    await expect(blue.locator("#field")).toHaveAttribute("data-width", "24000");
  } finally {
    await blue.close();
    await red.close();
  }
});
