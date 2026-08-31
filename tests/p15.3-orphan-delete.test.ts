import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_MERCHANT_BACKED_P125_EMAILS,
  EXPECTED_MERCHANT_BACKED_P125_ROWS,
  EXPECTED_ORPHAN_EMAIL_COUNT,
  EXPECTED_ORPHAN_ROW_COUNT,
  P15_2_GUARD_ORPHAN_ROWS,
  executeOrphanGuardDelete,
  orphanDeleteMutationIsScoped,
  orphanDeleteSelectSqlIsReadOnly,
  planOrphanGuardDelete,
  type CatalogCounts,
  type TargetGuardRow,
} from "@/server/db/p15.3-orphan-delete";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.3-orphan-delete.md";
const CLI = "server/db/p15.3-orphan-delete-cli.ts";
const MOD = "server/db/p15.3-orphan-delete.ts";
const MIGRATION_DIR = "server/db/migrations";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function classified() {
  return P15_2_GUARD_ORPHAN_ROWS.map((row) => ({
    email: row.email,
    n: row.n,
    class: "p125-guard-harness" as const,
  }));
}

function targetsFromFrozen(): TargetGuardRow[] {
  const rows: TargetGuardRow[] = [];
  for (const row of P15_2_GUARD_ORPHAN_ROWS) {
    for (let i = 0; i < row.n; i += 1) {
      rows.push({ id: `${row.email}:${i}`, email: row.email });
    }
  }
  return rows;
}

describe("P15.3 targeted P15.2 orphan guard delete", () => {
  it("scopes DELETE to 52 orphan guard_decisions by id; no P15.4, FK, UNIQUE, or 002", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.3-orphan-delete":/);
    assert.match(source("package.json"), /tests\/p15\.3-orphan-delete\.test\.ts/);
    assert.equal(orphanDeleteSelectSqlIsReadOnly(), true);
    assert.equal(orphanDeleteMutationIsScoped(), true);
    const mutation = source(MOD).match(/export const ORPHAN_DELETE_MUTATION_SQL = `([^`]+)`/)?.[1] ?? "";
    assert.match(mutation, /DELETE FROM guard_decisions/);
    assert.match(mutation, /id = ANY\(\$1::text\[\]\)/);
    assert.doesNotMatch(mutation, /DELETE FROM merchants|DELETE FROM workspaces|DELETE FROM track_events/);
    assert.doesNotMatch(source(MOD), /FOREIGN KEY|CREATE UNIQUE|CREATE INDEX|002_/);
    const cli = source(CLI);
    assert.match(cli, /executeOrphanGuardDelete/);
    assert.match(cli, /ROLLBACK|executeOrphanGuardDelete/);
    assert.doesNotMatch(cli, /db:backfill|db:reconcile|runBackfill|upsertAccount/);
    assert.doesNotMatch(cli, /DELETE FROM merchants|DELETE FROM workspaces|DELETE FROM track_events/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-decision-gate.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.equal(P15_2_GUARD_ORPHAN_ROWS.length, EXPECTED_ORPHAN_EMAIL_COUNT);
    assert.equal(
      P15_2_GUARD_ORPHAN_ROWS.reduce((sum, row) => sum + row.n, 0),
      EXPECTED_ORPHAN_ROW_COUNT,
    );
  });

  it("plans GO only for the frozen 33 emails / 52 rows with no merchant and no events", () => {
    const ok = planOrphanGuardDelete({
      classified: classified(),
      targets: targetsFromFrozen(),
      merchantHits: [],
      eventHits: [],
      merchantBacked: {
        emails: EXPECTED_MERCHANT_BACKED_P125_EMAILS,
        rows: EXPECTED_MERCHANT_BACKED_P125_ROWS,
      },
    });
    assert.equal(ok.go, true);
    if (ok.go) {
      assert.equal(ok.ids.length, 52);
      assert.equal(ok.emails.length, 33);
    }
    const tooFew = planOrphanGuardDelete({
      classified: classified(),
      targets: targetsFromFrozen().slice(0, 51),
      merchantHits: [],
      eventHits: [],
      merchantBacked: { emails: 60, rows: 103 },
    });
    assert.equal(tooFew.go, false);
    const merchant = planOrphanGuardDelete({
      classified: classified(),
      targets: targetsFromFrozen(),
      merchantHits: ["p125-1787652982835-32@test.com"],
      eventHits: [],
      merchantBacked: { emails: 60, rows: 103 },
    });
    assert.equal(merchant.go, false);
    const events = planOrphanGuardDelete({
      classified: classified(),
      targets: targetsFromFrozen(),
      merchantHits: [],
      eventHits: [{ email: "p125-1787652982835-32@test.com", n: 1 }],
      merchantBacked: { emails: 60, rows: 103 },
    });
    assert.equal(events.go, false);
    const outsider = planOrphanGuardDelete({
      classified: classified(),
      targets: [...targetsFromFrozen().slice(0, 51), { id: "x", email: "p125-outsider@test.com" }],
      merchantHits: [],
      eventHits: [],
      merchantBacked: { emails: 60, rows: 103 },
    });
    assert.equal(outsider.go, false);
    const backedDrift = planOrphanGuardDelete({
      classified: classified(),
      targets: targetsFromFrozen(),
      merchantHits: [],
      eventHits: [],
      merchantBacked: { emails: 60, rows: 102 },
    });
    assert.equal(backedDrift.go, false);
  });

  it("commits when post-delete checks match and rolls back on after-count drift", async () => {
    const before: CatalogCounts = {
      merchants: 205,
      workspaces: 5,
      track_events: 181,
      guard_decisions: 167,
    };
    const planned = targetsFromFrozen();
    const goClient = fakeClient({
      before,
      targets: planned,
      deleted: planned,
      remaining: 0,
      after: { ...before, guard_decisions: 115 },
      merchantBackedAfter: { emails: 60, rows: 103 },
    });
    const go = await executeOrphanGuardDelete(goClient, classified());
    assert.equal(go.go, "GO");
    assert.equal(go.rowsDeleted, 52);
    assert.equal(go.rolledBack, false);
    assert.deepEqual(goClient.log, ["BEGIN", "DELETE", "COMMIT"]);
    assert.equal(go.before.merchants, 205);
    assert.equal(go.after?.guard_decisions, 115);
    assert.equal(go.merchantBackedAfter?.rows, 103);

    const driftClient = fakeClient({
      before,
      targets: planned,
      deleted: planned,
      remaining: 0,
      after: { ...before, merchants: 204, guard_decisions: 115 },
      merchantBackedAfter: { emails: 60, rows: 103 },
    });
    const drift = await executeOrphanGuardDelete(driftClient, classified());
    assert.equal(drift.go, "NO-GO");
    assert.equal(drift.rolledBack, true);
    assert.equal(drift.postgresMutated, false);
    assert.deepEqual(driftClient.log, ["BEGIN", "DELETE", "ROLLBACK"]);

    const shortClient = fakeClient({
      before,
      targets: planned.slice(0, 51),
      deleted: [],
      remaining: 51,
      after: before,
      merchantBackedAfter: { emails: 60, rows: 103 },
    });
    const short = await executeOrphanGuardDelete(shortClient, classified());
    assert.equal(short.go, "NO-GO");
    assert.deepEqual(shortClient.log, ["BEGIN", "ROLLBACK"]);
  });
});

function fakeClient(opts: {
  before: CatalogCounts;
  targets: TargetGuardRow[];
  deleted: TargetGuardRow[];
  remaining: number;
  after: CatalogCounts;
  merchantBackedAfter: { emails: number; rows: number };
}) {
  const log: string[] = [];
  let deleted = false;
  return {
    log,
    async query(sql: string, values?: unknown[]) {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text === "BEGIN") {
        log.push("BEGIN");
        return { rows: [] };
      }
      if (text === "COMMIT") {
        log.push("COMMIT");
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        log.push("ROLLBACK");
        return { rows: [] };
      }
      if (text.includes("AS merchants") && text.includes("AS guard_decisions")) {
        return { rows: [deleted ? opts.after : opts.before] };
      }
      if (text.startsWith("DELETE FROM guard_decisions")) {
        log.push("DELETE");
        deleted = true;
        const ids = new Set((values?.[0] as string[]) ?? []);
        return { rows: opts.deleted.filter((row) => ids.has(row.id)) };
      }
      if (text.includes("FOR UPDATE")) {
        return { rows: opts.targets };
      }
      if (text.includes("SELECT COUNT(*)::int AS n") && text.includes("NOT EXISTS")) {
        return { rows: [{ n: deleted ? opts.remaining : opts.targets.length }] };
      }
      if (text.includes("COUNT(DISTINCT lower(g.email))")) {
        return { rows: [deleted ? opts.merchantBackedAfter : { emails: 60, rows: 103 }] };
      }
      if (text.includes("FROM merchants WHERE lower(email) = ANY")) {
        return { rows: [] };
      }
      if (text.includes("FROM track_events")) {
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${text.slice(0, 80)}`);
    },
  };
}
