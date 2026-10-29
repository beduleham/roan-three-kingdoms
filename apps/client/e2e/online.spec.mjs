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
    await expect(blue.locator("#clock")).toContainText("tick");
    await expect(red.locator("#clock")).toContainText("tick");
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
    await expect
      .poll(async () => {
        const a = await blue.locator("#clock").textContent();
        const b = await red.locator("#clock").textContent();
        return a === b && Number(a?.split(" ")[0]) >= 5;
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
