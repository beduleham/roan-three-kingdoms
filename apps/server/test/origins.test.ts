import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { registerAccountRoutes } from "../src/auth.js";

afterEach(() => vi.unstubAllEnvs());
async function withAuth(check: (base: string) => Promise<void>) {
  const app = express();
  registerAccountRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
describe("Render authentication origin boundary", () => {
  it("allows the assigned HTTPS origin and local dev origins, while rejecting other hosts", async () => {
    vi.stubEnv("CLIENT_ORIGINS", undefined);
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://roan-demo.onrender.com");
    await withAuth(async (base) => {
      for (const origin of [
        "https://roan-demo.onrender.com",
        "http://127.0.0.1:4174",
      ]) {
        const response = await fetch(`${base}/auth/config`, {
          headers: { Origin: origin },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
      }
      expect(
        (
          await fetch(`${base}/auth/config`, {
            headers: { Origin: "https://other.onrender.com" },
          })
        ).status,
      ).toBe(403);
    });
  });
  it("keeps explicit operator origins authoritative", async () => {
    vi.stubEnv("CLIENT_ORIGINS", " https://play.example.test ");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://roan-demo.onrender.com");
    await withAuth(async (base) => {
      expect(
        (
          await fetch(`${base}/auth/config`, {
            headers: { Origin: "https://play.example.test" },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${base}/auth/config`, {
            headers: { Origin: "https://roan-demo.onrender.com" },
          })
        ).status,
      ).toBe(403);
    });
  });
  it.each([
    "http://untrusted.test",
    "not-a-url",
    "https://user:password@example.test",
  ])("rejects invalid platform URL %s", (url) => {
    vi.stubEnv("CLIENT_ORIGINS", undefined);
    vi.stubEnv("RENDER_EXTERNAL_URL", url);
    expect(() => registerAccountRoutes(express())).toThrow();
  });
});
