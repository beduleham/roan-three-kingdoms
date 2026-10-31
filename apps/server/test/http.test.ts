import express from "express";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { registerHttp } from "../src/http.js";

describe("production static boundary", () => {
  it("serves built client and health while keeping source, account DB and dotfiles private", async () => {
    const directory = mkdtempSync(join(tmpdir(), "roan-http-"));
    const app = express(),
      server = createServer(app);
    try {
      for (const name of ["index.html", "online.html"])
        writeFileSync(join(directory, name), `<h1>${name}</h1>`);
      writeFileSync(join(directory, ".env"), "PRIVATE");
      writeFileSync(join(directory, "accounts.sqlite"), "PRIVATE");
      mkdirSync(join(directory, "assets"));
      writeFileSync(join(directory, "assets/game.js"), "console.log('built')");
      registerHttp(app, directory);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("NO_ADDRESS");
      const base = `http://127.0.0.1:${address.port}`;
      expect(
        (await fetch(base, { redirect: "manual" })).headers.get("location"),
      ).toBe("/online.html");
      expect(await (await fetch(`${base}/online.html`)).text()).toContain(
        "online.html",
      );
      expect((await fetch(`${base}/assets/game.js`)).status).toBe(200);
      expect(await (await fetch(`${base}/healthz`)).json()).toEqual({
        status: "ok",
      });
      for (const path of [
        "/.env",
        "/accounts.sqlite",
        "/accounts.sqlite-wal",
        "/data/accounts.sqlite",
        "/apps/server/src/index.ts",
      ])
        expect((await fetch(base + path)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("requires a built client directory when explicitly configured", () => {
    expect(() =>
      registerHttp(express(), "/nonexistent/roan-client-build"),
    ).toThrow();
  });
});
