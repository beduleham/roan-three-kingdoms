import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import express, { type Application } from "express";
import { MemoryAccountRepository, type AccountRepository } from "./accounts.js";

const CHALLENGE_MS = 5 * 60_000;
const SESSION_MS = 60 * 60_000;
const MAX_ENTRIES = 1000;
export type Identity =
  | { provider: "guest" }
  | { provider: "google"; accountId: string; name: string };
type Session = { identity: Identity; expiresAt: number };
export class AccountStorageUnavailable extends Error {
  constructor(cause: unknown) {
    super("ACCOUNT_STORAGE_UNAVAILABLE", { cause });
  }
}

/** Process-local demo sessions. Never use browser claims as an account identity. */
export class AccountAuth {
  private challenges = new Map<string, number>();
  private sessions = new Map<string, Session>();
  constructor(
    readonly clientId = process.env.GOOGLE_CLIENT_ID?.trim() || null,
    private verifier: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client(),
    private now = () => Date.now(),
    private accounts: AccountRepository = new MemoryAccountRepository(),
  ) {}
  initializeAccounts(accounts: AccountRepository) {
    if (this.sessions.size || this.challenges.size)
      throw new Error("AUTH_ALREADY_STARTED");
    this.accounts = accounts;
  }
  private prune() {
    for (const [key, expires] of this.challenges)
      if (expires <= this.now()) this.challenges.delete(key);
    for (const [key, session] of this.sessions)
      if (session.expiresAt <= this.now()) this.sessions.delete(key);
  }
  challenge() {
    if (!this.clientId) throw new Error("GOOGLE_UNAVAILABLE");
    this.prune();
    if (this.challenges.size >= MAX_ENTRIES) throw new Error("AUTH_BUSY");
    const nonce = randomBytes(32).toString("hex");
    this.challenges.set(nonce, this.now() + CHALLENGE_MS);
    return { nonce };
  }
  async login(body: unknown) {
    if (!this.clientId) throw new Error("GOOGLE_UNAVAILABLE");
    this.prune();
    const { credential, nonce } = (body ?? {}) as Record<string, unknown>;
    if (
      typeof credential !== "string" ||
      credential.length > 8192 ||
      typeof nonce !== "string" ||
      !this.challenges.has(nonce)
    )
      throw new Error("INVALID_GOOGLE_LOGIN");
    // Consume before awaiting: parallel exchanges cannot reuse a challenge.
    this.challenges.delete(nonce);
    const ticket = await this.verifier.verifyIdToken({
      idToken: credential,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      !payload.exp ||
      payload.exp * 1000 <= this.now() ||
      (payload as unknown as { nonce?: string }).nonce !== nonce
    )
      throw new Error("INVALID_GOOGLE_LOGIN");
    this.prune();
    if (this.sessions.size >= MAX_ENTRIES) throw new Error("AUTH_BUSY");
    const sessionToken = randomBytes(32).toString("hex");
    let account;
    try {
      account = this.accounts.resolveGoogle(
        payload.sub,
        payload.name?.slice(0, 80) || "Google 플레이어",
        this.now(),
      );
    } catch (error) {
      throw new AccountStorageUnavailable(error);
    }
    const identity: Identity = {
      provider: "google",
      accountId: account.id,
      name: account.name,
    };
    const expiresAt = Math.min(payload.exp * 1000, this.now() + SESSION_MS);
    this.sessions.set(sessionToken, { identity, expiresAt });
    return { sessionToken, expiresAt, identity: publicIdentity(identity) };
  }
  authenticate(options: unknown): Identity {
    const token = (options as { accountSession?: unknown } | null)
      ?.accountSession;
    if (token === undefined) return { provider: "guest" };
    const session = typeof token === "string" ? this.sessions.get(token) : null;
    if (!session || session.expiresAt <= this.now()) {
      if (typeof token === "string") this.sessions.delete(token);
      throw new Error("ACCOUNT_SESSION_EXPIRED");
    }
    return session.identity;
  }
  logout(token: string) {
    this.sessions.delete(token);
  }
}
export function publicIdentity(identity: Identity) {
  return identity.provider === "google"
    ? { provider: "google" as const, name: identity.name }
    : { provider: "guest" as const };
}
export const accountAuth = new AccountAuth();

function clientOrigins() {
  if (process.env.CLIENT_ORIGINS !== undefined)
    return new Set(
      process.env.CLIENT_ORIGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
  const origins = new Set(
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4174,http://127.0.0.1:4174"
      .split(",")
      .map((value) => value.trim()),
  );
  // Render assigns this HTTPS URL. Explicit CLIENT_ORIGINS always takes precedence.
  if (process.env.RENDER_EXTERNAL_URL) {
    const url = new URL(process.env.RENDER_EXTERNAL_URL);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("INVALID_RENDER_EXTERNAL_URL");
    origins.add(url.origin);
  }
  return origins;
}

export function registerAccountRoutes(app: Application, auth = accountAuth) {
  const origins = clientOrigins();
  app.use(
    "/auth",
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) {
        res.status(403).json({ error: "ORIGIN_DENIED" });
        return;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    },
    express.json({ limit: "10kb" }),
  );
  app.get("/auth/config", (_req, res) =>
    res.json({ googleClientId: auth.clientId }),
  );
  app.post("/auth/challenge", (_req, res) => {
    try {
      res.json(auth.challenge());
    } catch {
      res.status(503).json({ error: "GOOGLE_UNAVAILABLE" });
    }
  });
  app.post("/auth/google", async (req, res) => {
    try {
      res.json(await auth.login(req.body));
    } catch (error) {
      if (error instanceof AccountStorageUnavailable)
        res.status(503).json({ error: "ACCOUNT_STORAGE_UNAVAILABLE" });
      else res.status(401).json({ error: "INVALID_GOOGLE_LOGIN" });
    }
  });
  const bearer = (header?: string) =>
    header?.startsWith("Bearer ") ? header.slice(7) : "";
  app.get("/auth/session", (req, res) => {
    try {
      const identity = auth.authenticate({
        accountSession: bearer(req.headers.authorization),
      });
      res.json(publicIdentity(identity));
    } catch {
      res.status(401).json({ error: "ACCOUNT_SESSION_EXPIRED" });
    }
  });
  app.delete("/auth/session", (req, res) => {
    auth.logout(bearer(req.headers.authorization));
    res.sendStatus(204);
  });
}
