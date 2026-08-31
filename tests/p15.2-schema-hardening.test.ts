import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PG_CONNECT_BACKOFF_MS,
  PG_STATEMENT_TIMEOUT_MS,
  isPostgresConnectivityError,
} from "@/server/db/postgres";
import {
  classifyGuardOrphan,
  classifyWorkspaceOrphan,
  evaluateGuardCreatedAtIndex,
  orphanSqlIsReadOnly,
} from "@/server/db/orphan-classify";
import { sourceConcurrencyFindings } from "@/server/db/postgres-audit";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.2-schema-hardening.md";
const CLI = "server/db/orphan-classify-cli.ts";
const MIGRATION_DIR = "server/db/migrations";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P15.2 safe PostgreSQL hardening", () => {
  it("ships SELECT-only orphan classification; no FK, UNIQUE, or migration 002", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:classify-orphans":/);
    assert.match(source("package.json"), /tests\/p15\.2-schema-hardening\.test\.ts/);
    const cli = source(CLI);
    assert.match(cli, /classifyLiveOrphans/);
    assert.doesNotMatch(cli, /INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE TABLE|CREATE INDEX/);
    assert.doesNotMatch(cli, /upsertAccount|appendEvent|appendGuardDecision/);
    assert.equal(orphanSqlIsReadOnly(), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-constraints.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-decision-gate.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES |CREATE UNIQUE INDEX/);
    assert.match(source("server/repositories/event.repository.ts"), /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
  });

  it("locks merchant PK lookup, event keyset pagination, and pool timeout without 30s poison", () => {
    const users = source("server/repositories/user.repository.ts");
    assert.match(users, /SELECT payload FROM merchants WHERE email = \$1/);
    assert.match(users, /payload->>'phone'/);
    assert.doesNotMatch(users, /const accounts = await readAccounts\(\)/);
    const events = source("server/repositories/event.repository.ts");
    assert.match(events, /\(at, id\)/);
    assert.match(events, /ORDER BY at DESC, id DESC/);
    const pg = source("server/db/postgres.ts");
    assert.match(pg, /statement_timeout: PG_STATEMENT_TIMEOUT_MS/);
    assert.match(pg, /PG_CONNECT_BACKOFF_MS/);
    assert.doesNotMatch(pg, /30_000/);
    assert.equal(PG_STATEMENT_TIMEOUT_MS, 8_000);
    assert.equal(PG_CONNECT_BACKOFF_MS, 5_000);
    const live = sourceConcurrencyFindings({
      userRepo: users,
      workspaceRepo: source("server/repositories/workspace.repository.ts"),
      eventRepo: events,
      guardRepo: source("server/repositories/guard-log.repository.ts"),
      postgres: pg,
    });
    assert.equal(live.some((row) => row.id === "rmw-merchants"), false);
    assert.equal(live.some((row) => row.id === "merchant-no-pk-lookup"), false);
    assert.equal(live.some((row) => row.id === "events-cap"), false);
    assert.equal(live.some((row) => row.id === "pool-poison"), false);
  });

  it("classifies known orphans as keep; defers guard created_at index", () => {
    assert.equal(classifyWorkspaceOrphan("P12.2-alice@test.com"), "p12.2-workspace-fixture");
    assert.equal(classifyWorkspaceOrphan("p12.2-bob@test.com"), "p12.2-workspace-fixture");
    assert.equal(classifyWorkspaceOrphan("real@store.test"), "unknown");
    assert.equal(classifyGuardOrphan("p125-1787652982835-32@test.com"), "p125-guard-harness");
    assert.equal(classifyGuardOrphan("owner@store.test"), "unknown");
    const evaled = evaluateGuardCreatedAtIndex({ unfilteredNode: "Seq Scan", byEmailNode: "Index Scan", rowCount: 52 });
    assert.equal(evaled.createIndexNow, false);
    assert.match(evaled.reason, /does not add a migration/);
    assert.equal(isPostgresConnectivityError({ code: "ECONNREFUSED" }), true);
    assert.equal(
      isPostgresConnectivityError({ code: "57014", message: "canceling statement due to statement timeout" }),
      false,
    );
  });
});
