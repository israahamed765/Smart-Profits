import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIGRATIONS_DIR, listMigrationFiles, runMigrations, type MigrationPool } from "@/server/db/migrate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function posixRel(file: string) {
  return file.slice(ROOT.length).replaceAll("\\", "/").replace(/^\//, "");
}

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function createFakePool(options?: { failIf?: (sql: string) => boolean }) {
  const applied = new Set<string>();
  const statements: string[] = [];
  let inTx = false;
  const txInserts: string[] = [];

  const query = async (text: string, values: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    statements.push(sql);
    if (options?.failIf?.(sql)) throw new Error("p14.5 injected migration failure");
    if (sql === "BEGIN") {
      inTx = true;
      txInserts.length = 0;
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      inTx = false;
      txInserts.length = 0;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      for (const id of txInserts) applied.delete(id);
      inTx = false;
      txInserts.length = 0;
      return { rows: [] };
    }
    if (sql.includes("CREATE TABLE") && sql.includes("schema_migrations")) {
      return { rows: [] };
    }
    if (sql.startsWith("SELECT id FROM schema_migrations")) {
      return { rows: [...applied].map((id) => ({ id })) };
    }
    if (sql.startsWith("INSERT INTO schema_migrations")) {
      const id = String(values[0]);
      applied.add(id);
      if (inTx) txInserts.push(id);
      return { rows: [] };
    }
    return { rows: [] };
  };

  const pool: MigrationPool & { applied: Set<string>; statements: string[] } = {
    applied,
    statements,
    async connect() {
      return { query, release() {} };
    },
  };
  return pool;
}

describe("P14.5 migration infrastructure", () => {
  const temps: string[] = [];
  after(() => {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  });

  it("lists product migrations in deterministic numeric order", () => {
    const files = listMigrationFiles(DEFAULT_MIGRATIONS_DIR);
    assert.deepEqual(files, ["001_current_schema.sql"]);
    const dir = mkdtempSync(join(tmpdir(), "p14.5-order-"));
    temps.push(dir);
    writeFileSync(join(dir, "010_later.sql"), "SELECT 1;");
    writeFileSync(join(dir, "002_mid.sql"), "SELECT 1;");
    writeFileSync(join(dir, "001_first.sql"), "SELECT 1;");
    writeFileSync(join(dir, "readme.txt"), "ignore");
    assert.deepEqual(listMigrationFiles(dir), ["001_first.sql", "002_mid.sql", "010_later.sql"]);
  });

  it("creates schema_migrations and records a successful migration as applied", async () => {
    const pool = createFakePool();
    const result = await runMigrations({ pool, dir: DEFAULT_MIGRATIONS_DIR });
    assert.ok(pool.statements.some((sql) => sql.includes("CREATE TABLE") && sql.includes("schema_migrations")));
    assert.deepEqual(result.applied, ["001_current_schema.sql"]);
    assert.deepEqual(result.skipped, []);
    assert.equal(pool.applied.has("001_current_schema.sql"), true);
    assert.ok(pool.statements.includes("BEGIN"));
    assert.ok(pool.statements.includes("COMMIT"));
  });

  it("second run is idempotent and does not apply twice", async () => {
    const pool = createFakePool();
    const first = await runMigrations({ pool, dir: DEFAULT_MIGRATIONS_DIR });
    const second = await runMigrations({ pool, dir: DEFAULT_MIGRATIONS_DIR });
    assert.deepEqual(first.applied, ["001_current_schema.sql"]);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ["001_current_schema.sql"]);
    assert.equal([...pool.applied].length, 1);
  });

  it("applies migrations in filename order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p14.5-seq-"));
    temps.push(dir);
    writeFileSync(join(dir, "002_second.sql"), "SELECT 2;");
    writeFileSync(join(dir, "001_first.sql"), "SELECT 1;");
    const pool = createFakePool();
    const result = await runMigrations({ pool, dir });
    assert.deepEqual(result.applied, ["001_first.sql", "002_second.sql"]);
    const inserts = pool.statements.filter((sql) => sql.startsWith("INSERT INTO schema_migrations"));
    assert.equal(inserts.length, 2);
  });

  it("does not mark a failed migration as applied", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p14.5-fail-"));
    temps.push(dir);
    writeFileSync(join(dir, "001_ok.sql"), "SELECT 1;");
    writeFileSync(join(dir, "002_bad.sql"), "SELECT * FROM p14_5_force_fail;");
    const pool = createFakePool({ failIf: (sql) => sql.includes("p14_5_force_fail") });
    await assert.rejects(() => runMigrations({ pool, dir }), /p14.5 injected migration failure/);
    assert.equal(pool.applied.has("001_ok.sql"), true);
    assert.equal(pool.applied.has("002_bad.sql"), false);
    assert.ok(pool.statements.includes("ROLLBACK"));
  });

  it("001 represents the current product schema without extras", () => {
    const sql = source("server/db/migrations/001_current_schema.sql");
    const postgres = source("server/db/postgres.ts");
    assert.doesNotMatch(postgres, /CREATE TABLE/);
    assert.doesNotMatch(postgres, /ensureGuardSchema/);
    assert.doesNotMatch(postgres, /SCHEMA_SQL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS guard_decisions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS merchants/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS workspaces/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS track_events/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS guard_decisions_email_created_idx/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS guard_decisions_decision_created_idx/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS track_events_at_idx/);
    assert.doesNotMatch(sql, /FOREIGN KEY/);
    assert.doesNotMatch(sql, /CREATE UNIQUE INDEX/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
    assert.deepEqual(tables.sort(), ["guard_decisions", "merchants", "track_events", "workspaces"]);
  });

  it("queryPostgres stays on the request path without creating schema", () => {
    const pg = source("server/db/postgres.ts");
    assert.match(pg, /PG_CONNECT_BACKOFF_MS/);
    assert.match(pg, /statement_timeout: PG_STATEMENT_TIMEOUT_MS/);
    assert.doesNotMatch(pg, /30_000/);
    assert.doesNotMatch(pg, /await ensureGuardSchema/);
    assert.doesNotMatch(pg, /CREATE TABLE/);
  });

  it("HTTP handlers, Next BFF, and frontend do not import the migration runner", () => {
    const leak = /from ["']@\/server\/db\/migrate|migrate-cli|runMigrations/;
    const roots = ["backend/src/http", "app/api", "frontend", "server/services", "server/repositories"];
    for (const file of roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
    assert.equal(statSync(join(ROOT, "server/db/migrate-cli.ts")).isFile(), true);
    assert.equal(existsSync(join(ROOT, "database")), false);
  });

  it("P14.18 catalogs are PostgreSQL-only; repositories do not import the runner", () => {
    assert.doesNotMatch(source("server/repositories/user.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.match(source("server/repositories/user.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/repositories/workspace.repository.ts"), /writeJsonFile|readJsonFile|listJsonFiles/);
    assert.doesNotMatch(source("server/repositories/event.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.doesNotMatch(source("server/repositories/guard-log.repository.ts"), /writeJsonFile|readJsonFile|writeFileLogs/);
    assert.match(source("server/repositories/guard-log.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/db/postgres.ts"), /ensureGuardSchema|SCHEMA_SQL|CREATE TABLE/);
    assert.doesNotMatch(source("backend/src/index.ts"), /runMigrations|migrate-cli/);
  });
});
