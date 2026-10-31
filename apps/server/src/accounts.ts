import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

export interface AccountRecord {
  id: string;
  name: string;
  createdAt: number;
  lastLoginAt: number;
}
export interface AccountRepository {
  resolveGoogle(subject: string, name: string, at: number): AccountRecord;
}
export class MemoryAccountRepository implements AccountRepository {
  private accounts = new Map<string, AccountRecord>();
  resolveGoogle(subject: string, name: string, at: number) {
    const previous = this.accounts.get(subject);
    const account = {
      id: previous?.id ?? randomUUID(),
      name,
      createdAt: previous?.createdAt ?? at,
      lastLoginAt: Math.max(previous?.lastLoginAt ?? at, at),
    };
    this.accounts.set(subject, account);
    return { ...account };
  }
}

/** Single-host demo repository. Tokens, guest progress and battle results never enter this DB. */
export class SqliteAccountRepository implements AccountRepository {
  private db: DatabaseSync;
  private upsert: StatementSync;
  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      closeSync(openSync(path, "a", 0o600));
    }
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
      );
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const version = this.db.prepare("PRAGMA user_version").get() as {
          user_version: number;
        };
        if (version.user_version === 0) {
          this.db.exec(`CREATE TABLE accounts (
            id TEXT PRIMARY KEY NOT NULL,
            google_subject TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_login_at INTEGER NOT NULL
          ) STRICT;
          PRAGMA user_version=1;`);
        } else if (version.user_version !== 1) {
          throw new Error("UNSUPPORTED_ACCOUNT_SCHEMA");
        }
        this.upsert = this.db.prepare(`INSERT INTO accounts
          (id, google_subject, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(google_subject) DO UPDATE SET
            display_name=excluded.display_name,
            last_login_at=MAX(accounts.last_login_at, excluded.last_login_at)
          RETURNING id, display_name AS name, created_at AS createdAt, last_login_at AS lastLoginAt`);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  resolveGoogle(subject: string, name: string, at: number): AccountRecord {
    return this.upsert.get(
      randomUUID(),
      subject,
      name,
      at,
      at,
    ) as unknown as AccountRecord;
  }
  close() {
    this.db.close();
  }
}
