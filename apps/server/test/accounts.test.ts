import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { SqliteAccountRepository } from "../src/accounts.js";

const directories: string[] = [];
function location() {
  const directory = mkdtempSync(join(tmpdir(), "roan-accounts-"));
  directories.push(directory);
  return join(directory, "accounts.sqlite");
}
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("persistent local account repository", () => {
  it("retains IDs and creation times across independent processes", () => {
    const path = location();
    const source = new URL("../src/accounts.ts", import.meta.url).href;
    const code = `import {SqliteAccountRepository} from ${JSON.stringify(source)};
      const repo = new SqliteAccountRepository(process.argv[1]);
      console.log(JSON.stringify(repo.resolveGoogle('subject-one', process.argv[2], Number(process.argv[3])))); repo.close();`;
    const run = (name: string, at: number) => {
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "-e",
          code,
          path,
          name,
          String(at),
        ],
        { encoding: "utf8" },
      );
      expect(result.stderr, "separate process failed").not.toContain("Error:");
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout);
    };
    const first = run("첫 이름", 1000),
      second = run("바뀐 이름", 2000);
    expect(second).toEqual({ ...first, name: "바뀐 이름", lastLoginAt: 2000 });
    expect(first.id).not.toContain("subject-one");
  });
  it("resolves the same subject through two connections without creating a second account", () => {
    const path = location();
    const first = new SqliteAccountRepository(path),
      second = new SqliteAccountRepository(path);
    try {
      const a = first.resolveGoogle("same-subject", "첫 이름", 1000);
      const b = second.resolveGoogle("same-subject", "둘째 이름", 2000);
      const c = first.resolveGoogle("different-subject", "같은 이름", 3000);
      expect(b.id).toBe(a.id);
      expect(c.id).not.toBe(a.id);
      expect(
        first.resolveGoogle("same-subject", "시계 역행", 500).lastLoginAt,
      ).toBe(2000);
      const inspection = new DatabaseSync(path);
      try {
        expect(
          inspection.prepare("SELECT COUNT(*) AS total FROM accounts").get()
            ?.total,
        ).toBe(2);
      } finally {
        inspection.close();
      }
    } finally {
      first.close();
      second.close();
    }
  });
  it("binds SQL values and stores only the account fields", () => {
    const path = location(),
      repo = new SqliteAccountRepository(path);
    const name = "장수'); DROP TABLE accounts; --";
    try {
      expect(repo.resolveGoogle("quoted-'subject", name, 1).name).toBe(name);
    } finally {
      repo.close();
    }
    const db = new DatabaseSync(path);
    try {
      expect(
        db.prepare("SELECT COUNT(*) AS total FROM accounts").get()?.total,
      ).toBe(1);
      const fields = db
        .prepare("PRAGMA table_info(accounts)")
        .all()
        .map((field) => field.name);
      expect(fields).toEqual([
        "id",
        "google_subject",
        "display_name",
        "created_at",
        "last_login_at",
      ]);
    } finally {
      db.close();
    }
    if (process.platform !== "win32")
      expect(statSync(path).mode & 0o777).toBe(0o600);
  });
  it("rejects newer schema versions without resetting them", () => {
    const path = location(),
      db = new DatabaseSync(path);
    db.exec("PRAGMA user_version=99");
    db.close();
    expect(() => new SqliteAccountRepository(path)).toThrow(
      "UNSUPPORTED_ACCOUNT_SCHEMA",
    );
    const check = new DatabaseSync(path);
    try {
      expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(99);
    } finally {
      check.close();
    }
  });
  it("does not replace a corrupt database with an empty one", () => {
    const path = location(),
      contents = Buffer.from("existing-corrupt-account-database");
    writeFileSync(path, contents);
    expect(() => new SqliteAccountRepository(path)).toThrow();
    expect(readFileSync(path)).toEqual(contents);
  });
  it("rolls back initialization if an incompatible accounts table already exists", () => {
    const path = location(),
      db = new DatabaseSync(path);
    db.exec(
      "CREATE TABLE accounts (preserved TEXT); INSERT INTO accounts VALUES ('do not erase')",
    );
    db.close();
    expect(() => new SqliteAccountRepository(path)).toThrow();
    const check = new DatabaseSync(path);
    try {
      expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
      expect(
        check.prepare("SELECT preserved FROM accounts").get()?.preserved,
      ).toBe("do not erase");
    } finally {
      check.close();
    }
  });
  it("fails when the configured parent is a file", () => {
    const path = location();
    writeFileSync(path, "parent-file");
    expect(
      () => new SqliteAccountRepository(join(path, "accounts.sqlite")),
    ).toThrow();
    expect(readFileSync(path, "utf8")).toBe("parent-file");
  });
});
