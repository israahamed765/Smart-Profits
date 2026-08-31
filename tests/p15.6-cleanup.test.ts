import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const DELETED = [
  "server/db/backfill.ts",
  "server/db/backfill-cli.ts",
  "server/db/backfill-validate.ts",
  "server/db/post-backfill-verify.ts",
  "server/db/post-backfill-verify-cli.ts",
  "server/db/reconcile.ts",
  "server/db/reconcile-cli.ts",
  "server/db/reconcile-frozen-cli.ts",
  "server/db/reconcile-p14.15-pre-cutover-cli.ts",
  "server/db/reconcile-p14.15-plan.ts",
  "server/db/freeze-plan.ts",
  "server/db/freeze-cli.ts",
  "server/db/unfreeze-cli.ts",
  "server/db/json-snapshot.ts",
  "server/db/shadow-validate.ts",
  "server/db/shadow-validate-cli.ts",
  "server/db/archive-json-shadow.ts",
  "server/db/archive-json-shadow-cli.ts",
  "server/db/archive-delete.ts",
  "server/db/archive-delete-cli.ts",
  "server/db/cutover-cli.ts",
  "server/db/final-cutover.ts",
  "server/db/final-cutover-cli.ts",
  "server/db/post-cutover.ts",
  "server/db/post-cutover-cli.ts",
  "server/db/final-verify.ts",
  "server/db/final-verify-cli.ts",
  "server/db/operational-verify.ts",
  "server/db/operational-verify-cli.ts",
  "server/db/intentional-pg-only-guards.ts",
  "server/db/test-artifact-pg-only-guards.ts",
  "server/db/cli-data-dir.ts",
  "server/db/track-event-identity.ts",
  "scripts/pg-counts.ts",
  "scripts/p14.12-preflight.ts",
  "scripts/p14.12-preflight-detail.ts",
  "scripts/freeze-json-snapshot.ts",
  "scripts/diagnose-guard-created-at.ts",
  "tests/p14.8-postgres-reconciliation.test.ts",
  "tests/p14.9-backfill-dry-run.test.ts",
  "tests/p14.10-controlled-backfill.test.ts",
  "tests/p14.11-post-backfill-verification.test.ts",
  "tests/p14.12r-write-freeze.test.ts",
  "tests/p14.13-data-reconciliation.test.ts",
  "tests/p14.14-final-verification.test.ts",
  "tests/p14.14r-frozen-reconciliation.test.ts",
  "tests/p14.15-postgres-primary-cutover.test.ts",
  "tests/p14.15-pre-cutover-reconciliation.test.ts",
  "tests/p14.16-shadow-validation.test.ts",
  "tests/p14.17-remove-json-shadow.test.ts",
  "tests/p14.19-postgres-only-operational.test.ts",
  "tests/p14.20-final-cutover.test.ts",
  "tests/p14.21-post-cutover.test.ts",
  "tests/p14.23-archive-cleanup.test.ts",
  "tests/helpers/p14.9-dry-run.ts",
] as const;

const KEPT = [
  "server/db/postgres.ts",
  "server/db/migrate.ts",
  "server/db/migrate-cli.ts",
  "server/db/migrations/001_current_schema.sql",
  "server/db/postgres-audit.ts",
  "server/db/postgres-audit-cli.ts",
  "server/db/postgres-audit-samples-cli.ts",
  "server/db/p14.23-archive-marker.ts",
  "server/db/orphan-classify.ts",
  "server/db/orphan-classify-cli.ts",
  "server/db/p15.3-index-eval.ts",
  "server/db/p15.3-fk-gate.ts",
  "server/db/p15.3-decision-gate.ts",
  "server/db/p15.3-orphan-delete.ts",
  "server/db/p15.3-workspace-delete.ts",
  "server/db/p15.4-verify.ts",
  "server/db/p15.5-final-audit.ts",
  "server/write-freeze.ts",
  "server/storage/json-store.ts",
  "lib/utils.ts",
  "scripts/start-persistent-postgres.ts",
  "scripts/ensure-smartprofit-db.ts",
  "tests/p14.4-repository-dual-write.test.ts",
  "tests/p14.5-migrations.test.ts",
  "tests/p14.15-test-storage-isolation.test.ts",
  "tests/p14.18-postgres-only-storage.test.ts",
  "tests/p14.22-remove-dual-write-remnants.test.ts",
  "tests/p15.5-final-audit.test.ts",
] as const;

describe("P15.6 operator-tool cleanup", () => {
  it("removes unused cutover tools and keeps runtime / P15 locks", () => {
    assert.equal(existsSync(join(ROOT, "docs/p15.6-cleanup.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.match(source("package.json"), /tests\/p15\.6-cleanup\.test\.ts/);
    assert.match(source("package.json"), /"db:migrate":/);
    assert.doesNotMatch(source("package.json"), /"db:backfill":|"db:reconcile":|"db:freeze":|"db:cutover":|"db:validate-shadow":/);
    for (const rel of DELETED) {
      assert.equal(existsSync(join(ROOT, rel)), false, rel);
    }
    for (const rel of KEPT) {
      assert.equal(existsSync(join(ROOT, rel)), true, rel);
    }
    const migrations = readdirSync(join(ROOT, "server/db/migrations")).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.match(source("server/smart-guard/run.ts"), /isWriteFrozenError/);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
  });
});
