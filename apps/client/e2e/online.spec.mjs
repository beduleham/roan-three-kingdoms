import { test, expect } from "@playwright/test";

test("two browser pages share authoritative ticks and reject enemy control", async ({
  browser,
}) => {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  try {
    await blue.goto("/online.html");
    await red.goto("/online.html");
    await blue.locator("#join").click();
    await expect(blue.locator("#identity")).toContainText("blue");
    await red.locator("#join").click();
    await expect(red.locator("#identity")).toContainText("red");
    expect(await blue.locator("#online").getAttribute("data-room-id")).toBe(
      await red.locator("#online").getAttribute("data-room-id"),
    );
    await expect(blue.locator("#clock")).toContainText("tick");
    await expect(red.locator("#clock")).toContainText("tick");
    await expect
      .poll(async () =>
        Number(await blue.locator("#online").getAttribute("data-delta-count")),
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => {
        const a = await blue.locator("#clock").textContent();
        const b = await red.locator("#clock").textContent();
        return a === b && Number(a?.split(" ")[0]) >= 3;
      })
      .toBe(true);
    await blue.locator("#squad").evaluate((select) => {
      select.add(new Option("red-1", "red-1"));
      select.value = "red-1";
      document.querySelector("#attack").click();
    });
    await expect(blue.locator("#result")).toContainText("NOT_OWNER");
    await blue.locator("#squad").selectOption("blue-1");
    await blue.locator("#advance").click();
    await expect(blue.locator("#result")).toContainText("명령 접수");
    const samples = await blue.evaluate(async () => {
      const values = [];
      const deadline = performance.now() + 700;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        values.push(Number(document.querySelector("#online").dataset.renderX));
      }
      return values;
    });
    expect(new Set(samples).size).toBeGreaterThan(3);
    await expect
      .poll(async () => {
        const a = await blue.locator("#clock").textContent();
        const b = await red.locator("#clock").textContent();
        return a === b && Number(a?.split(" ")[0]) >= 5;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([
          blue.locator("#units").textContent(),
          red.locator("#units").textContent(),
        ]);
        return a === b;
      })
      .toBe(true);
    await blue.screenshot({
      path: test.info().outputPath("blue-online.png"),
      fullPage: true,
    });
  } finally {
    await blue.close();
    await red.close();
  }
});

test("reloaded player resumes the reserved seat in the same room", async ({
  browser,
}) => {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  try {
    await blue.goto("/online.html");
    await red.goto("/online.html");
    await blue.locator("#join").click();
    await expect(blue.locator("#identity")).toContainText("blue");
    await red.locator("#join").click();
    await expect(red.locator("#identity")).toContainText("red");
    const roomId = await blue.locator("#online").getAttribute("data-room-id");
    await blue.reload();
    await expect(red.locator("#connection")).toContainText("상대 접속 대기");
    const paused = await red.locator("#clock").textContent();
    await blue.locator("#join").click();
    await expect(blue.locator("#identity")).toContainText("blue");
    expect(await blue.locator("#online").getAttribute("data-room-id")).toBe(
      roomId,
    );
    await expect(red.locator("#connection")).toContainText("전투 진행");
    await expect
      .poll(async () => red.locator("#clock").textContent())
      .not.toBe(paused);
    await blue.locator("#squad").evaluate((select) => {
      select.add(new Option("red-1", "red-1"));
      select.value = "red-1";
      document.querySelector("#attack").click();
    });
    await expect(blue.locator("#result")).toContainText("NOT_OWNER");
  } finally {
    await blue.close();
    await red.close();
  }
});

test("online command desk changes server state and displays commander cooldown", async ({
  browser,
}) => {
  const blue = await browser.newPage(),
    red = await browser.newPage();
  try {
    await blue.goto("/online.html");
    await red.goto("/online.html");
    await blue.locator("#join").click();
    await red.locator("#join").click();
    await expect(blue.locator("#identity")).toContainText("blue");
    await expect(red.locator("#identity")).toContainText("red");
    await blue.locator("#field").click({ position: { x: 220, y: 160 } });
    await expect(blue.locator("#selected")).toContainText("선택 blue-1");
    await blue.locator("#field").click({ position: { x: 340, y: 220 } });
    await expect(blue.locator("#dest-x")).toHaveValue("10");
    await blue.locator("#stance").selectOption("aggressive");
    await blue.locator("#applyStance").click();
    await expect
      .poll(async () => blue.locator("#units").textContent())
      .toContain("blue-1: 20명");
    await expect
      .poll(async () => blue.locator("#units").textContent())
      .toContain("aggressive");
    await blue.locator("#formation").selectOption("offense");
    await blue.locator("#applyFormation").click();
    await expect
      .poll(async () => blue.locator("#units").textContent())
      .toContain("aggressive/offense");
    await blue.locator("#W").click();
    await expect
      .poll(async () => blue.locator("#commander").textContent())
      .toMatch(/Q\/W\/R 대기 \d+\/[1-9]\d*\//);
    await blue.locator("#dest-x").fill("9");
    await blue.locator("#dest-y").fill("4");
    await blue.locator("#move").click();
    await expect(blue.locator("#result")).toContainText("명령 접수");
    await expect
      .poll(async () => blue.locator("#clock").textContent())
      .toContain("상태 해시");
    await expect
      .poll(async () => {
        const a = await blue.locator("#units").textContent(),
          b = await red.locator("#units").textContent();
        return a === b;
      })
      .toBe(true);
  } finally {
    await blue.close();
    await red.close();
  }
});

test("3v3 lobby fills four AI seats and rejects other human or AI squad commands", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    opponent = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await opponent.goto("/online.html?mode=3v3");
    await host.locator("#join").click();
    await opponent.locator("#join").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    await expect(opponent.locator("#identity")).toContainText("red-1");
    await expect(host.locator("#lobby")).toContainText("blue-3: empty");
    await host.locator("#start").click();
    await expect(host.locator("#lobby")).toContainText("blue-3: AI");
    await expect(opponent.locator("#connection")).toContainText("전투 진행");
    await expect
      .poll(async () =>
        Number((await host.locator("#clock").textContent())?.split(" ")[0]),
      )
      .toBeGreaterThan(2);
    expect(await host.locator("#online").getAttribute("data-room-id")).toBe(
      await opponent.locator("#online").getAttribute("data-room-id"),
    );
    await host.locator("#squad").evaluate((select) => {
      select.add(new Option("blue-2-1", "blue-2-1"));
      select.value = "blue-2-1";
      document.querySelector("#attack").click();
    });
    await expect(host.locator("#result")).toContainText("NOT_OWNER");
    await host.locator("#squad").selectOption("blue-1-1");
    await host.locator("#advance").click();
    await expect(host.locator("#result")).toContainText("명령 접수");
    await expect
      .poll(
        async () =>
          (await host.locator("#clock").textContent()) ===
          (await opponent.locator("#clock").textContent()),
      )
      .toBe(true);
    await host.screenshot({
      path: test.info().outputPath("3v3-lobby.png"),
      fullPage: true,
    });
  } finally {
    await host.close();
    await opponent.close();
  }
});

test("six human browsers occupy one 3v3 room before start", async ({
  browser,
}) => {
  const pages = [];
  try {
    for (let i = 0; i < 6; i++) {
      const page = await browser.newPage();
      pages.push(page);
      await page.goto("/online.html?mode=3v3");
      await page.locator("#join").click();
      await expect(page.locator("#identity")).toContainText(
        i % 2
          ? `red-${Math.ceil((i + 1) / 2)}`
          : `blue-${Math.ceil((i + 1) / 2)}`,
      );
    }
    const roomIds = await Promise.all(
      pages.map((page) => page.locator("#online").getAttribute("data-room-id")),
    );
    expect(new Set(roomIds).size).toBe(1);
    await expect(pages[0].locator("#lobby")).not.toContainText("empty");
    await pages[0].locator("#start").click();
    await expect(pages[5].locator("#connection")).toContainText("전투 진행");
    await expect(pages[0].locator("#lobby")).not.toContainText("AI");
    await expect
      .poll(async () =>
        Number((await pages[0].locator("#clock").textContent())?.split(" ")[0]),
      )
      .toBeGreaterThan(2);
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
});
