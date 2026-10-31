import { test, expect } from "@playwright/test";

async function visibleUnitsAgree(first, second) {
  const read = (page) =>
    page.evaluate(() => ({
      tick: document.querySelector("#clock").textContent.split(" ")[0],
      rows: document.querySelector("#units").textContent.split("\n"),
    }));
  const [a, b] = await Promise.all([read(first), read(second)]);
  if (a.tick !== b.tick) return false;
  const other = new Map(b.rows.map((row) => [row.split(":")[0], row]));
  const shared = a.rows.filter((row) => other.has(row.split(":")[0]));
  return (
    shared.length > 0 &&
    shared.every((row) => other.get(row.split(":")[0]) === row)
  );
}

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
        return (
          a?.split(" ")[0] === b?.split(" ")[0] && Number(a?.split(" ")[0]) >= 3
        );
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
        return (
          a?.split(" ")[0] === b?.split(" ")[0] && Number(a?.split(" ")[0]) >= 5
        );
      })
      .toBe(true);
    await expect.poll(() => visibleUnitsAgree(blue, red)).toBe(true);
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
    await expect.poll(() => visibleUnitsAgree(blue, red)).toBe(true);
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
          (await host.locator("#clock").textContent())?.split(" ")[0] ===
          (await opponent.locator("#clock").textContent())?.split(" ")[0],
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
    await expect
      .poll(async () => {
        const clocks = await Promise.all(
          [pages[0], pages[2], pages[4]].map((page) =>
            page.locator("#clock").textContent(),
          ),
        );
        return new Set(clocks).size;
      })
      .toBe(1);
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
});

test("private invite joins the intended 3v3 room while quick match stays separate", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    outsider = await browser.newPage(),
    guest = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await host.locator("#create-private").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    const invite = await host.locator("#invite-link").getAttribute("href");
    expect(invite).toContain("room=");
    await outsider.goto("/online.html?mode=3v3");
    await outsider.locator("#join").click();
    await expect(outsider.locator("#identity")).toContainText("blue-1");
    expect(
      await outsider.locator("#online").getAttribute("data-room-id"),
    ).not.toBe(await host.locator("#online").getAttribute("data-room-id"));
    await guest.goto(invite);
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    expect(await guest.locator("#online").getAttribute("data-room-id")).toBe(
      await host.locator("#online").getAttribute("data-room-id"),
    );
    await host.locator("#start").click();
    await expect(guest.locator("#connection")).toContainText("전투 진행");
    await expect(outsider.locator("#clock")).toContainText("0 tick");
    await guest.reload();
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
  } finally {
    await Promise.all([host.close(), outsider.close(), guest.close()]);
  }
});

test("invite for another mode is rejected before showing a seat", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    guest = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await host.locator("#create-private").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    const invite = new URL(
      await host.locator("#invite-link").getAttribute("href"),
    );
    invite.searchParams.delete("mode");
    await guest.goto(invite.href);
    await guest.locator("#join").click();
    await expect(guest.locator("#connection")).toContainText(
      "경기 종류가 다릅니다",
    );
    await expect(guest.locator("#identity")).toBeEmpty();
  } finally {
    await host.close();
    await guest.close();
  }
});

test("private room rejects missing or revoked keys and only the host rotates invites", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    guest = await browser.newPage(),
    outsider = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await host.locator("#create-private").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    const original = await host.locator("#invite-link").getAttribute("href");
    expect(original).toMatch(/#invite=[0-9a-f]{64}$/);
    const missing = new URL(original);
    missing.hash = "";
    await outsider.goto(missing.href);
    await outsider.locator("#join").click();
    await expect(outsider.locator("#connection")).toContainText(
      "INVITE_REQUIRED",
    );
    await expect(outsider.locator("#clock")).toBeEmpty();
    const tampered = new URL(original);
    tampered.hash = "invite=" + "0".repeat(64);
    await outsider.goto(tampered.href);
    await outsider.locator("#join").click();
    await expect(outsider.locator("#connection")).toContainText(
      "INVITE_REQUIRED",
    );
    await guest.goto(original);
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    await guest.locator("#rotate-invite").evaluate((button) => {
      button.disabled = false;
      button.click();
    });
    await expect(guest.locator("#result")).toContainText("NOT_HOST");
    await host.locator("#rotate-invite").click();
    await expect(host.locator("#result")).toContainText("재발급 완료");
    const current = await host.locator("#invite-link").getAttribute("href");
    expect(current).not.toBe(original);
    await outsider.goto(original);
    await outsider.locator("#join").click();
    await expect(outsider.locator("#connection")).toContainText(
      "INVITE_REQUIRED",
    );
    await outsider.goto(current);
    await outsider.locator("#join").click();
    await expect(outsider.locator("#identity")).toContainText("blue-2");
    await guest.reload();
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    expect(await guest.locator("#invite-link").getAttribute("href")).toBe(
      current,
    );
  } finally {
    await Promise.all([host.close(), guest.close(), outsider.close()]);
  }
});

test("host removes a lobby guest, revokes its admission, and hands off on leave", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    guest = await browser.newPage(),
    survivor = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await host.locator("#create-private").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    const original = await host.locator("#invite-link").getAttribute("href");
    await guest.goto(original);
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    const saved = await guest.evaluate(() =>
      Object.entries(sessionStorage).find(([key]) =>
        key.startsWith("roan-online-reconnection-"),
      ),
    );
    await survivor.goto(original);
    await survivor.locator("#join").click();
    await expect(survivor.locator("#identity")).toContainText("blue-2");
    await guest.locator("#remove-seat").selectOption("blue-1");
    await guest.locator("#remove-player").evaluate((button) => {
      button.disabled = false;
      button.click();
    });
    await expect(guest.locator("#result")).toContainText("NOT_HOST");
    await host.locator("#remove-seat").selectOption("red-1");
    await host.locator("#remove-player").click();
    await expect(host.locator("#result")).toContainText("내보내기 완료");
    await expect(guest.locator("#connection")).toContainText("내보내졌습니다");
    await expect(guest.locator("#clock")).toBeEmpty();
    const current = await host.locator("#invite-link").getAttribute("href");
    expect(current).not.toBe(original);
    await expect(survivor.locator("#invite-link")).toHaveAttribute(
      "href",
      current,
    );
    await guest.evaluate(
      ([key, token]) => sessionStorage.setItem(key, token),
      saved,
    );
    await guest.locator("#join").click();
    await expect(guest.locator("#connection")).toContainText("INVITE_REQUIRED");
    await guest.goto(current);
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    await host.locator("#leave").click();
    await expect(host.locator("#clock")).toBeEmpty();
    await expect(survivor.locator("#rotate-invite")).toBeEnabled();
    await expect(survivor.locator("#remove-seat")).toHaveValue("red-1");
    await survivor.locator("#rotate-invite").click();
    await expect(survivor.locator("#result")).toContainText("재발급 완료");
  } finally {
    await Promise.all([host.close(), guest.close(), survivor.close()]);
  }
});

test("host can revoke a disconnected lobby seat before its reconnect window expires", async ({
  browser,
}) => {
  const host = await browser.newPage(),
    guest = await browser.newPage();
  try {
    await host.goto("/online.html?mode=3v3");
    await host.locator("#create-private").click();
    await expect(host.locator("#identity")).toContainText("blue-1");
    const invite = await host.locator("#invite-link").getAttribute("href");
    await guest.goto(invite);
    await guest.locator("#join").click();
    await expect(guest.locator("#identity")).toContainText("red-1");
    await guest.reload();
    await expect(host.locator("#lobby")).toContainText("재접속 대기");
    await host.locator("#remove-seat").selectOption("red-1");
    await host.locator("#remove-player").click();
    await expect(host.locator("#lobby")).toContainText("red-1: empty");
    await guest.locator("#join").click();
    await expect(guest.locator("#connection")).toContainText("INVITE_REQUIRED");
    await expect(guest.locator("#identity")).toBeEmpty();
  } finally {
    await host.close();
    await guest.close();
  }
});

test("hidden enemy leaves only a frozen sighting and cannot be directly commanded against", async ({
  browser,
}) => {
  test.setTimeout(45000);
  const blue = await browser.newPage(),
    red = await browser.newPage();
  try {
    await blue.goto("/online.html");
    await red.goto("/online.html");
    await blue.locator("#join").click();
    await red.locator("#join").click();
    await expect(red.locator("#identity")).toContainText("red");
    await expect(blue.locator("#vision-info")).toContainText("10타일");
    await expect(blue.locator('#target option[value="red-1"]')).toHaveCount(1);
    for (const [id, y] of [
      ["red-1", "4"],
      ["red-2", "9"],
    ]) {
      await red.locator("#squad").selectOption(id);
      await red.locator("#dest-x").fill("24");
      await red.locator("#dest-y").fill(y);
      await red.locator("#move").click();
    }
    await expect(blue.locator('#target option[value="red-1"]')).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(blue.locator("#units")).not.toContainText("red-1:");
    await expect(blue.locator("#last-seen")).toContainText(
      "red-1: 마지막 위치",
    );
    const sighting = await blue.locator("#last-seen").textContent();
    const tick = Number(
      (await blue.locator("#clock").textContent()).split(" ")[0],
    );
    await expect
      .poll(async () =>
        Number((await blue.locator("#clock").textContent()).split(" ")[0]),
      )
      .toBeGreaterThan(tick + 8);
    const red1Line = (text) =>
      text.split("\n").find((line) => line.startsWith("red-1:"));
    expect(red1Line(await blue.locator("#last-seen").textContent())).toBe(
      red1Line(sighting),
    );
    await blue.locator("#target").evaluate((select) => {
      select.add(new Option("red-1", "red-1"));
      select.value = "red-1";
      document.querySelector("#attack").disabled = false;
      document.querySelector("#attack").click();
    });
    await expect(blue.locator("#result")).toContainText("TARGET_NOT_VISIBLE");
    await blue.screenshot({
      path: test.info().outputPath("fog-last-sighting.png"),
      fullPage: true,
    });
    await blue.reload();
    await blue.locator("#join").click();
    await expect(blue.locator("#last-seen")).toContainText(red1Line(sighting));
    await expect(blue.locator('#target option[value="red-1"]')).toHaveCount(0);
    for (const [id, y] of [
      ["red-1", "4"],
      ["red-2", "9"],
    ]) {
      await red.locator("#squad").selectOption(id);
      await red.locator("#dest-x").fill("14");
      await red.locator("#dest-y").fill(y);
      await red.locator("#move").click();
    }
    await expect(blue.locator('#target option[value="red-1"]')).toHaveCount(1, {
      timeout: 15000,
    });
    await expect
      .poll(async () =>
        red1Line(await blue.locator("#last-seen").textContent()),
      )
      .toBeUndefined();
  } finally {
    await blue.close();
    await red.close();
  }
});
