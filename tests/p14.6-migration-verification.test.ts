import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIGRATIONS_DIR, listMigrationFiles, runMigrations, type MigrationPool } from "@/server/db/migrate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE_PATTERN = /^(\d+)_.+\.sql$/;
const BASELINE = "001_current_schema.sql";

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "data") continue;
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
    if (options?.failIf?.(sql)) throw new Error("p14.6 injected migration failure");
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

describe("P14.6 migration verification — baseline locked", () => {
  const temps: string[] = [];
  after(() => {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  });

  it("baseline: 001_current_schema.sql exists, is uniquely numbered, and is the only product migration", () => {
    const files = listMigrationFiles(DEFAULT_MIGRATIONS_DIR);
    assert.equal(existsSync(join(ROOT, "server/db/migrations", BASELINE)), true);
    assert.equal(FILE_PATTERN.test(BASELINE), true);
    assert.deepEqual(files, [BASELINE]);
    const prefixes = files.map((name) => FILE_PATTERN.exec(name)?.[1]);
    assert.deepEqual(prefixes, ["001"]);
    assert.equal(new Set(files).size, files.length);
  });

  it("deterministic ordering: numeric prefix 001 precedes later files", () => {
    const dir = mkdtempSync(join(tmpdir(), "p14.6-order-"));
    temps.push(dir);
    writeFileSync(join(dir, "002_next.sql"), "SELECT 2;");
    writeFileSync(join(dir, "010_later.sql"), "SELECT 10;");
    writeFileSync(join(dir, BASELINE), "SELECT 1;");
    const ordered = listMigrationFiles(dir);
    assert.equal(ordered[0], BASELINE);
    assert.deepEqual(ordered, [BASELINE, "002_next.sql", "010_later.sql"]);
  });

  it("tracking: applied migration is recorded and a second run is skipped", async () => {
    const pool = createFakePool();
    const first = await runMigrations({ pool, dir: DEFAULT_MIGRATIONS_DIR });
    assert.deepEqual(first.applied, [BASELINE]);
    assert.equal(pool.applied.has(BASELINE), true);
    assert.ok(pool.statements.some((sql) => sql.startsWith("INSERT INTO schema_migrations")));
    const second = await runMigrations({ pool, dir: DEFAULT_MIGRATIONS_DIR });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, [BASELINE]);
    assert.equal([...pool.applied].length, 1);
  });

  it("transaction safety: success COMMITs; failure ROLLBACKs and is not applied", async () => {
    const okDir = mkdtempSync(join(tmpdir(), "p14.6-ok-"));
    temps.push(okDir);
    writeFileSync(join(okDir, "001_ok.sql"), "SELECT 1;");
    const okPool = createFakePool();
    await runMigrations({ pool: okPool, dir: okDir });
    assert.ok(okPool.statements.includes("BEGIN"));
    assert.ok(okPool.statements.includes("COMMIT"));
    assert.equal(okPool.applied.has("001_ok.sql"), true);

    const failDir = mkdtempSync(join(tmpdir(), "p14.6-fail-"));
    temps.push(failDir);
    writeFileSync(join(failDir, "001_ok.sql"), "SELECT 1;");
    writeFileSync(join(failDir, "002_bad.sql"), "SELECT * FROM p14_6_force_fail;");
    const failPool = createFakePool({ failIf: (sql) => sql.includes("p14_6_force_fail") });
    await assert.rejects(() => runMigrations({ pool: failPool, dir: failDir }), /p14.6 injected migration failure/);
    assert.equal(failPool.applied.has("001_ok.sql"), true);
    assert.equal(failPool.applied.has("002_bad.sql"), false);
    assert.ok(failPool.statements.includes("ROLLBACK"));
  });

  it("runner isolation: handlers, services, repositories, BFF, frontend, and queryPostgres do not run migrations", () => {
    const leak = /from ["']@\/server\/db\/migrate|migrate-cli|runMigrations/;
    const roots = [
      "backend/src/http",
      "app/api",
      "frontend",
      "server/services",
      "server/repositories",
    ];
    for (const file of roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
    const postgres = source("server/db/postgres.ts");
    assert.doesNotMatch(postgres, leak);
    assert.doesNotMatch(postgres, /runMigrations/);
    assert.doesNotMatch(source("backend/src/index.ts"), leak);
    assert.match(source("package.json"), /"db:migrate": "npx --yes tsx --tsconfig tsconfig.json --env-file=\.env server\/db\/migrate-cli\.ts"/);
  });

  it("schema baseline: 001 has product tables/indexes; schema_migrations is runner bootstrap", () => {
    const sql = source("server/db/migrations/001_current_schema.sql");
    const runner = source("server/db/migrate.ts");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS merchants/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS workspaces/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS track_events/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS guard_decisions/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS track_events_at_idx/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS guard_decisions_email_created_idx/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS guard_decisions_decision_created_idx/);
    assert.doesNotMatch(sql, /schema_migrations/);
    assert.match(runner, /CREATE TABLE IF NOT EXISTS schema_migrations/);
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
    assert.deepEqual(tables.sort(), ["guard_decisions", "merchants", "track_events", "workspaces"]);
  });

  it("no accidental migration: no backfill, FK, UNIQUE(phone), or JSONB reshape", () => {
    const sql = source("server/db/migrations/001_current_schema.sql");
    const files = listMigrationFiles(DEFAULT_MIGRATIONS_DIR);
    assert.equal(files.length, 1);
    assert.doesNotMatch(sql, /FOREIGN KEY/);
    assert.doesNotMatch(sql, /UNIQUE\s*\(\s*phone\s*\)/i);
    assert.doesNotMatch(sql, /CREATE UNIQUE INDEX/);
    assert.doesNotMatch(sql, /INSERT INTO merchants/);
    assert.doesNotMatch(sql, /INSERT INTO workspaces/);
    assert.doesNotMatch(sql, /INSERT INTO track_events/);
    assert.doesNotMatch(sql, /INSERT INTO guard_decisions/);
    assert.doesNotMatch(sql, /ALTER TABLE/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS \w+_transactions/);
    assert.match(sql, /payload JSONB NOT NULL/);
  });

  it("P14.18 catalogs are PostgreSQL-only; repositories do not import the runner", () => {
    assert.doesNotMatch(source("server/repositories/user.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.match(source("server/repositories/user.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/repositories/workspace.repository.ts"), /writeJsonFile|readJsonFile|listJsonFiles/);
    assert.doesNotMatch(source("server/repositories/event.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.match(source("server/repositories/guard-log.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/db/postgres.ts"), /ensureGuardSchema|SCHEMA_SQL|CREATE TABLE/);
    for (const file of walkTsFiles(join(ROOT, "server/repositories"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /runMigrations|migrate-cli/, posixRel(file));
    }
  });
});
