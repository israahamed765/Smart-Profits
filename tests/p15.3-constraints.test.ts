import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideGuardCreatedAtIndex } from "@/server/db/p15.3-index-eval";
import { WORKSPACE_CAS_PLAN, fkGateFromOrphans } from "@/server/db/p15.3-fk-gate";
import { classifyWorkspaceOrphan, classifyGuardOrphan, type OrphanClassifyReport } from "@/server/db/orphan-classify";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.3-constraints.md";
const MIGRATION_DIR = "server/db/migrations";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function emptyOrphans(): OrphanClassifyReport {
  return {
    classifiedAt: "2026-08-28T00:00:00.000Z",
    postgresMutated: false,
    rowsDeleted: 0,
    workspaceOrphans: [
      {
        email: "p12.2-alice@test.com",
        class: "p12.2-workspace-fixture",
        disposition: "keep-until-explicit-delete-go",
        origin: "fixture",
      },
      {
        email: "p12.2-bob@test.com",
        class: "p12.2-workspace-fixture",
        disposition: "keep-until-explicit-delete-go",
        origin: "fixture",
      },
    ],
    guardOrphans: [
      {
        email: "p125-1@test.com",
        n: 52,
        class: "p125-guard-harness",
        disposition: "keep-until-explicit-delete-go",
        origin: "fixture",
      },
    ],
    unknownCount: 0,
    guardIndex: {
      unfilteredNode: "Seq Scan",
      byEmailNode: "Index Scan",
      createIndexNow: false,
      reason: "deferred",
    },
  };
}

describe("P15.3 conservative index and concurrency", () => {
  it("does not add 002, FK, UNIQUE, deletes, or start P15.4", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.3-fk-gate":/);
    assert.match(source("package.json"), /tests\/p15\.3-constraints\.test\.ts/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES |CREATE UNIQUE INDEX/);
    for (const cli of [
      "server/db/p15.3-fk-gate-cli.ts",
      "server/db/p15.3-index-eval-cli.ts",
      "server/db/p15.3-decision-gate-cli.ts",
    ]) {
      const body = source(cli);
      assert.doesNotMatch(body, /INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE TABLE|CREATE INDEX/);
      assert.doesNotMatch(body, /db:backfill|db:reconcile|runBackfill/);
    }
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-decision-gate.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.match(source("server/repositories/event.repository.ts"), /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres|withPostgresTransaction/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres|withPostgresTransaction/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres|withPostgresTransaction/);
  });

  it("locks merchant FOR UPDATE transaction and defers workspace CAS", () => {
    const users = source("server/repositories/user.repository.ts");
    assert.match(users, /withPostgresTransaction/);
    assert.match(users, /SELECT payload FROM merchants WHERE email = \$1 FOR UPDATE/);
    assert.doesNotMatch(users, /const previous = await findAccount\(email\)/);
    const pg = source("server/db/postgres.ts");
    assert.match(pg, /export async function withPostgresTransaction/);
    assert.match(pg, /await client.query\("BEGIN"\)/);
    assert.match(pg, /await client.query\("COMMIT"\)/);
    const workspace = source("server/repositories/workspace.repository.ts");
    assert.match(workspace, /ON CONFLICT \(email\) DO UPDATE SET payload = EXCLUDED.payload/);
    assert.doesNotMatch(workspace, /FOR UPDATE|expectedSavedAt|rowCount === 0/);
    assert.equal(WORKSPACE_CAS_PLAN.applyNow, false);
  });

  it("refuses created_at index at current cardinality; FK gate waits for a separate GO", () => {
    const small = decideGuardCreatedAtIndex({
      unfilteredNode: "Seq Scan",
      unfilteredCost: 35.26,
      byEmailNode: "Index Scan",
      rowCount: 167,
      indexDefs: [
        "CREATE INDEX guard_decisions_email_created_idx ON public.guard_decisions USING btree (email, created_at DESC)",
      ],
    });
    assert.equal(small.createIndexNow, false);
    const large = decideGuardCreatedAtIndex({
      unfilteredNode: "Seq Scan",
      unfilteredCost: 12000,
      byEmailNode: "Index Scan",
      rowCount: 10_000,
      indexDefs: [
        "CREATE INDEX guard_decisions_email_created_idx ON public.guard_decisions USING btree (email, created_at DESC)",
      ],
    });
    assert.equal(large.createIndexNow, true);
    assert.equal(classifyWorkspaceOrphan("p12.2-alice@test.com"), "p12.2-workspace-fixture");
    assert.equal(classifyGuardOrphan("p125-1@test.com"), "p125-guard-harness");
    const gate = fkGateFromOrphans(emptyOrphans());
    assert.equal(gate.foreignKeysAdded, 0);
    assert.equal(gate.rowsDeleted, 0);
    assert.equal(gate.items.every((item) => item.addNow === false), true);
    assert.equal(gate.items.find((item) => item.id === "fk-guard-email")?.blockedByRows, 52);
    assert.equal(gate.go, "wait-for-fk-go");
  });
});
