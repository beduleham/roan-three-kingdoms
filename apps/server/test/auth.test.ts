import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { defineRoom, defineServer } from "colyseus";
import { Client } from "@colyseus/sdk";
import {
  AccountAuth,
  publicIdentity,
  registerAccountRoutes,
} from "../src/auth.js";
import { Battle3v3Room } from "../src/room.js";

const audience = "test-client.apps.googleusercontent.com";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
function verifier() {
  const client = new OAuth2Client();
  // Only key retrieval is substituted. The real Google library verifies every JWT.
  vi.spyOn(client, "getFederatedSignonCertsAsync").mockResolvedValue({
    certs: {
      test: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    format: "PEM" as Awaited<
      ReturnType<OAuth2Client["getFederatedSignonCertsAsync"]>
    >["format"],
  });
  return client;
}
function credential(
  nonce: string,
  overrides: Record<string, unknown> = {},
  badSignature = false,
) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "RS256", kid: "test" })}.${encode({
    iss: "https://accounts.google.com",
    aud: audience,
    sub: "account-one",
    name: "테스트 장수",
    iat: now,
    exp: now + 3600,
    nonce,
    ...overrides,
  })}`;
  const signature = sign("RSA-SHA256", Buffer.from(data), keys.privateKey);
  if (badSignature) signature[0] = signature[0]! ^ 1;
  return `${data}.${signature.toString("base64url")}`;
}
async function login(
  auth: AccountAuth,
  overrides: Record<string, unknown> = {},
) {
  const { nonce } = auth.challenge();
  return auth.login({ nonce, credential: credential(nonce, overrides) });
}

describe("Google identity and guest sessions", () => {
  it("keeps guests available when Google is unconfigured and rejects claimed identities", async () => {
    const auth = new AccountAuth(null);
    expect(
      auth.authenticate({ provider: "google", accountId: "spoofed" }),
    ).toEqual({ provider: "guest" });
    expect(() => auth.challenge()).toThrow("GOOGLE_UNAVAILABLE");
    await expect(auth.login({})).rejects.toThrow("GOOGLE_UNAVAILABLE");
    expect(() => auth.authenticate({ accountSession: "fake" })).toThrow(
      "ACCOUNT_SESSION_EXPIRED",
    );
  });
  it("binds stable sub identity, hides subject/email and revokes opaque sessions", async () => {
    const auth = new AccountAuth(audience, verifier());
    const first = await login(auth, { email: "private@example.test" });
    const second = await login(auth, { name: "변경된 이름" });
    const a = auth.authenticate({ accountSession: first.sessionToken });
    const b = auth.authenticate({ accountSession: second.sessionToken });
    expect(a.provider === "google" && a.accountId).toBe("google:account-one");
    expect(b.provider === "google" && b.accountId).toBe("google:account-one");
    expect(publicIdentity(a)).toEqual({
      provider: "google",
      name: "테스트 장수",
    });
    expect(JSON.stringify(first)).not.toContain("private@example.test");
    expect(first.sessionToken).not.toBe(second.sessionToken);
    auth.logout(first.sessionToken);
    expect(() =>
      auth.authenticate({ accountSession: first.sessionToken }),
    ).toThrow();
    expect(
      auth.authenticate({ accountSession: second.sessionToken }).provider,
    ).toBe("google");
  });
  it.each([
    ["wrong audience", { aud: "another-client" }, false],
    ["wrong issuer", { iss: "https://attacker.test" }, false],
    ["expired", { iat: 1, exp: 2 }, false],
    ["nonce mismatch", { nonce: "wrong" }, false],
    ["missing subject", { sub: "" }, false],
    ["bad signature", {}, true],
  ])(
    "rejects %s with the real verification library",
    async (_label, overrides, badSignature) => {
      const auth = new AccountAuth(audience, verifier());
      const { nonce } = auth.challenge();
      await expect(
        auth.login({
          nonce,
          credential: credential(
            nonce,
            overrides as Record<string, unknown>,
            Boolean(badSignature),
          ),
        }),
      ).rejects.toThrow();
    },
  );
  it("rejects expired and concurrently replayed challenges, and expired sessions", async () => {
    let now = Date.now();
    const auth = new AccountAuth(audience, verifier(), () => now);
    const stale = auth.challenge();
    now += 5 * 60_000;
    await expect(
      auth.login({ ...stale, credential: credential(stale.nonce) }),
    ).rejects.toThrow();
    const { nonce } = auth.challenge();
    const body = { nonce, credential: credential(nonce) };
    const attempts = await Promise.allSettled([
      auth.login(body),
      auth.login(body),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const success = attempts.find((r) => r.status === "fulfilled")!;
    if (success.status !== "fulfilled") throw new Error("no success");
    now = success.value.expiresAt;
    expect(() =>
      auth.authenticate({ accountSession: success.value.sessionToken }),
    ).toThrow();
  });
});

describe("HTTP login and real room authority", () => {
  const auth = new AccountAuth(audience, verifier());
  class AccountRoom extends Battle3v3Room {
    protected override accounts = auth;
  }
  const server = defineServer({
    greet: false,
    gracefullyShutdown: false,
    express: (app) => registerAccountRoutes(app, auth),
    rooms: { account_test: defineRoom(AccountRoom) },
  });
  let base: string;
  beforeAll(async () => {
    await server.listen(0, "127.0.0.1");
    const address = server.transport.server!.address();
    if (!address || typeof address === "string") throw new Error("no address");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });
  it("exchanges a signed credential, mixes Google and guest seats, rejects duplicate/expired accounts and preserves reconnect identity", async () => {
    const config = await fetch(`${base}/auth/config`);
    expect(config.headers.get("cache-control")).toBe("no-store");
    expect(await config.json()).toEqual({ googleClientId: audience });
    expect(
      (
        await fetch(`${base}/auth/challenge`, {
          method: "POST",
          headers: { Origin: "https://attacker.test" },
        })
      ).status,
    ).toBe(403);
    const { nonce } = await (
      await fetch(`${base}/auth/challenge`, { method: "POST" })
    ).json();
    const response = await fetch(`${base}/auth/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ nonce, credential: credential(nonce) }),
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    const session = await response.json();
    const identity = await (
      await fetch(`${base}/auth/session`, {
        headers: { Authorization: `Bearer ${session.sessionToken}` },
      })
    ).json();
    expect(identity).toEqual({ provider: "google", name: "테스트 장수" });
    const api = new Client(base.replace("http:", "ws:"));
    const creatorProof = "a".repeat(64);
    const google = await api.create("account_test", {
      inviteOnly: true,
      creatorProof,
      accountSession: session.sessionToken,
    });
    google.onMessage("*", () => {});
    let inviteKey = "";
    const verified = new Promise<unknown>((resolve) =>
      google.onMessage("account", resolve),
    );
    const invited = new Promise<void>((resolve) =>
      google.onMessage("invite-key", ({ key }) => {
        inviteKey = key;
        resolve();
      }),
    );
    google.send("hello");
    expect(await verified).toEqual(identity);
    await invited;
    const guest = await api.joinById(google.roomId, { inviteKey });
    guest.onMessage("*", () => {});
    await expect(
      api.joinById(google.roomId, {
        inviteKey,
        accountSession: session.sessionToken,
      }),
    ).rejects.toThrow("ACCOUNT_ALREADY_IN_ROOM");
    await expect(
      api.joinById(google.roomId, { accountSession: session.sessionToken }),
    ).rejects.toThrow("INVITE_REQUIRED");
    await expect(
      api.joinById(google.roomId, { inviteKey, accountSession: "fake" }),
    ).rejects.toThrow("ACCOUNT_SESSION_EXPIRED");
    const otherSession = await login(auth, { sub: "account-two" });
    const concurrent = await Promise.allSettled(
      [1, 2].map(() =>
        api.joinById(google.roomId, {
          inviteKey,
          accountSession: otherSession.sessionToken,
        }),
      ),
    );
    expect(
      concurrent.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const otherSeat = concurrent.find(
      (attempt) => attempt.status === "fulfilled",
    )!;
    if (otherSeat.status !== "fulfilled")
      throw new Error("missing account seat");
    otherSeat.value.onMessage("*", () => {});
    const reconnectToken = google.reconnectionToken;
    const dropped = new Promise<void>((resolve) =>
      guest.onMessage("lobby", (lobby) => {
        if (
          lobby.slots.some(
            (slot: { id: string; connected: boolean }) =>
              slot.id === "blue-1" && !slot.connected,
          )
        )
          resolve();
      }),
    );
    google.reconnection.enabled = false;
    google.connection.close(4010);
    await dropped;
    await expect(
      api.joinById(google.roomId, {
        inviteKey,
        accountSession: session.sessionToken,
      }),
    ).rejects.toThrow("ACCOUNT_ALREADY_IN_ROOM");
    const restored = await api.reconnect(reconnectToken);
    restored.onMessage("*", () => {});
    const restoredIdentity = new Promise<unknown>((resolve) =>
      restored.onMessage("account", resolve),
    );
    restored.send("hello");
    expect(await restoredIdentity).toEqual(identity);
    await restored.leave();
    const rejoined = await api.joinById(guest.roomId, {
      inviteKey,
      accountSession: session.sessionToken,
    });
    rejoined.onMessage("*", () => {});
    await rejoined.leave();
    await otherSeat.value.leave();
    await guest.leave();
    await fetch(`${base}/auth/session`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.sessionToken}` },
    });
    expect(
      (
        await fetch(`${base}/auth/session`, {
          headers: { Authorization: `Bearer ${session.sessionToken}` },
        })
      ).status,
    ).toBe(401);
  }, 15000);
});
