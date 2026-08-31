import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIGRATIONS_DIR, listMigrationFiles } from "@/server/db/migrate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p14.7-production-data-readiness.md";
const TEST = "tests/p14.7-data-readiness.test.ts";
const BASELINE = "001_current_schema.sql";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

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

describe("P14.7 production data readiness — audit lock, no backfill", () => {
  it("ships the audit document and this characterization test only", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.equal(existsSync(join(ROOT, TEST)), true);
    assert.equal(existsSync(join(ROOT, "tmp-p14.7-audit.ts")), false);
    assert.match(source("package.json"), /tests\/p14\.7-data-readiness\.test\.ts/);
  });

  it("verdict is NO-GO and GO requires live PG plus an event identity strategy", () => {
    const doc = source(DOC);
    assert.match(doc, /Verdict: NO-GO/);
    assert.match(doc, /GO \/ NO-GO/);
    assert.match(doc, /schema_migrations/);
    assert.match(doc, /001_current_schema\.sql/);
    assert.match(doc, /DATABASE_URL/);
    assert.match(doc, /UNKNOWN/);
    assert.match(doc, /randomUUID\(\)/);
    assert.match(doc, /at\|type\|label\|email/);
    assert.match(doc, /Do not backfill `track_events`/);
    assert.match(doc, /Any UNKNOWN on 2–6, or no approved event identity, is NO-GO/);
    assert.match(doc, /Do \*\*not\*\* start P15/);
    assert.doesNotMatch(doc, /PostgreSQL-primary cutover complete/i);
  });

  it("P14.7 is read-only: 001 still has no product INSERT and no new migrations", () => {
    const sql = source(`server/db/migrations/${BASELINE}`);
    assert.deepEqual(listMigrationFiles(DEFAULT_MIGRATIONS_DIR), [BASELINE]);
    assert.doesNotMatch(sql, /INSERT INTO merchants/);
    assert.doesNotMatch(sql, /INSERT INTO workspaces/);
    assert.doesNotMatch(sql, /INSERT INTO track_events/);
    assert.doesNotMatch(sql, /INSERT INTO guard_decisions/);
    assert.doesNotMatch(sql, /ALTER TABLE/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS \w+_transactions/);
    assert.match(sql, /payload JSONB NOT NULL/);
  });

  it("track events still have no JSON id; PostgreSQL still mints randomUUID at insert", () => {
    const trackEvent = source("lib/admin/config.ts");
    assert.match(
      trackEvent,
      /export interface TrackEvent \{\s*type: TrackEventType;\s*at: number;\s*label\?: string;\s*email\?: string;\s*\}/,
    );
    const events = source("server/repositories/event.repository.ts");
    assert.match(events, /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
    assert.match(events, /\$\{item\.at\}\|\$\{item\.type\}\|\$\{item\.label \?\? ""\}\|\$\{item\.email \?\? ""\}/);
    assert.doesNotMatch(events, /INSERT INTO track_events[\s\S]*FROM json/i);
  });

  it("P14.18 catalogs are PostgreSQL-only; repositories are not the backfill runner", () => {
    assert.doesNotMatch(source("server/repositories/user.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.match(source("server/repositories/user.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/repositories/workspace.repository.ts"), /writeJsonFile|readJsonFile|listJsonFiles/);
    assert.doesNotMatch(source("server/repositories/event.repository.ts"), /writeJsonFile|readJsonFile/);
    assert.match(source("server/repositories/guard-log.repository.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/db/postgres.ts"), /ensureGuardSchema|SCHEMA_SQL|CREATE TABLE/);
    for (const file of walkTsFiles(join(ROOT, "server/repositories"))) {
      const body = readFileSync(file, "utf8");
      assert.doesNotMatch(body, /runMigrations|migrate-cli/, posixRel(file));
      assert.doesNotMatch(body, /p14\.7/, posixRel(file));
    }
  });

  it("this test does not connect to PostgreSQL or mutate data/", () => {
    const body = source(TEST);
    assert.doesNotMatch(body, /from ["']pg["']/);
    assert.doesNotMatch(body, /from ["']@\/server\/db\/postgres/);
    assert.doesNotMatch(body, /from ["']@\/server\/storage\/json-store/);
    assert.match(body, /import \{ existsSync, readdirSync, readFileSync \} from "node:fs"/);
    assert.doesNotMatch(source("tests/setup.ts"), /DATABASE_URL/);
  });
});
