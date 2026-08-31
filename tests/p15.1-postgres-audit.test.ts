import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIT_SQL,
  EXPECTED_LIVE_COUNTS,
  P15_1_CATALOG_REPOS,
  allAuditSql,
  auditSqlIsReadOnly,
  canFinishAudit,
  countsMatchExpected,
  postgresAuditGo,
  schemaFindings,
  sourceConcurrencyFindings,
} from "@/server/db/postgres-audit";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST = "tests/p15.1-postgres-audit.test.ts";
const DOC = "docs/p15.1-postgres-audit.md";
const CLI = "server/db/postgres-audit-cli.ts";
const PLAN = "server/db/postgres-audit.ts";
const MIGRATION = "server/db/migrations/001_current_schema.sql";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function finish(patch: Partial<Parameters<typeof canFinishAudit>[0]> = {}) {
  return {
    pgReachable: true,
    migration001: true,
    tablesPresent: true,
    sqlReadOnly: true,
    reposUnchanged: true,
    schemaUnchanged: true,
    ...patch,
  };
}

describe("P15.1 production PostgreSQL audit", () => {
  it("ships a SELECT-only CLI; does not mutate schema, API, or start P15.4", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:audit-postgres":/);
    assert.match(source("package.json"), /tests\/p15\.1-postgres-audit\.test\.ts/);
    const cli = source(CLI);
    assert.match(cli, /runProductionAudit/);
    assert.match(cli, /auditSqlIsReadOnly/);
    assert.doesNotMatch(cli, /INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE TABLE/);
    assert.doesNotMatch(cli, /upsertAccount|saveWorkspace|appendEvent|appendGuardDecision/);
    assert.doesNotMatch(cli, /runBackfill|applyMigrations|runMigrations/);
    for (const sql of allAuditSql()) {
      assert.equal(auditSqlIsReadOnly(sql), true, sql.slice(0, 60));
    }
    assert.equal(auditSqlIsReadOnly("INSERT INTO merchants (email) VALUES ('x')"), false);
    assert.equal(auditSqlIsReadOnly("SELECT payload FROM merchants"), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.2-schema-hardening.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-constraints.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-decision-gate.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.doesNotMatch(source(TEST), /from ["']@\/server\/db\/postgres["']/);
    assert.doesNotMatch(source("tests/setup.ts"), /DATABASE_URL/);
  });

  it("does not change catalog repositories, migration 001, API, Auth, Guard, or the engine", () => {
    for (const rel of P15_1_CATALOG_REPOS) {
      const body = source(rel);
      assert.match(body, /requirePostgres/);
      assert.doesNotMatch(body, /readJsonFile|writeJsonFile/);
      assert.doesNotMatch(body, /\.p14\.17-json-archive/);
    }
    assert.match(source(MIGRATION), /CREATE TABLE IF NOT EXISTS merchants/);
    assert.doesNotMatch(source(MIGRATION), /FOREIGN KEY|REFERENCES /);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres|json-store/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres|json-store/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.match(source("server/repositories/event.repository.ts"), /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
  });

  it("locks audit gates and documents merchant RMW plus mixed event ids", () => {
    assert.equal(canFinishAudit(finish()), true);
    assert.equal(canFinishAudit(finish({ sqlReadOnly: false })), false);
    assert.equal(canFinishAudit(finish({ schemaUnchanged: false })), false);
    assert.equal(postgresAuditGo({ ...finish(), reportRecorded: true, noMutations: true }), true);
    assert.equal(postgresAuditGo({ ...finish(), reportRecorded: true, noMutations: false }), false);
    assert.equal(countsMatchExpected({ ...EXPECTED_LIVE_COUNTS }), true);
    assert.equal(countsMatchExpected({ ...EXPECTED_LIVE_COUNTS, merchants: 206 }), false);

    const concurrency = sourceConcurrencyFindings({
      userRepo: "const accounts = await readAccounts();\nwriteAccountPg\nSELECT payload FROM merchants\n",
      workspaceRepo: "ON CONFLICT (email) DO UPDATE",
      eventRepo: "LIMIT $1\nORDER BY at DESC\nON CONFLICT (id) DO NOTHING",
      guardRepo: ["INSERT", "INTO", "guard_decisions"].join(" "),
      postgres: "downUntil = Date.now() + 30_000",
    });
    assert.equal(concurrency.some((row) => row.id === "rmw-merchants"), true);
    assert.equal(concurrency.some((row) => row.id === "merchant-no-pk-lookup"), true);
    assert.equal(concurrency.some((row) => row.id === "events-cap"), true);
    assert.equal(concurrency.some((row) => row.id === "pool-poison"), true);
    assert.equal(concurrency.find((row) => row.id === "event-uuid-insert")?.p152, false);

    const schema = schemaFindings({
      tables: ["guard_decisions", "merchants", "schema_migrations", "track_events", "workspaces"],
      foreignKeyCount: 0,
      sequences: [],
      indexes: [
        { tablename: "track_events", indexname: "track_events_at_idx" },
        { tablename: "guard_decisions", indexname: "guard_decisions_email_created_idx" },
        { tablename: "guard_decisions", indexname: "guard_decisions_decision_created_idx" },
      ],
      migrations: [{ id: "001_current_schema.sql" }],
    });
    assert.equal(schema.some((row) => row.id === "no-foreign-keys"), true);
    assert.equal(schema.some((row) => row.id === "missing-tables"), false);
    assert.match(source(PLAN), /Do not unify/);
    assert.match(AUDIT_SQL.eventIdShapes, /sha256/);
  });
});
