import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_COUNTS_AFTER,
  EXPECTED_COUNTS_BEFORE,
  P12_2_WORKSPACE_DELETE_EMAILS,
  executeP12_2WorkspaceDelete,
  planP12_2WorkspaceDelete,
  workspaceDeleteMutationIsScoped,
  workspaceDeleteSelectSqlIsReadOnly,
  type CatalogCounts,
  type TargetWorkspaceRow,
} from "@/server/db/p15.3-workspace-delete";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.3-workspace-delete.md";
const CLI = "server/db/p15.3-workspace-delete-cli.ts";
const MOD = "server/db/p15.3-workspace-delete.ts";
const MIGRATION_DIR = "server/db/migrations";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function targets(): TargetWorkspaceRow[] {
  return P12_2_WORKSPACE_DELETE_EMAILS.map((email) => ({
    email,
    ownerEmail: email,
    files: 1,
    updatedAt: "2026-08-26T18:57:27.493Z",
  }));
}

describe("P15.3 targeted P12.2 workspace delete", () => {
  it("scopes DELETE to two P12.2 workspaces; no P15.4, FK, UNIQUE, or 002", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.3-workspace-delete":/);
    assert.match(source("package.json"), /tests\/p15\.3-workspace-delete\.test\.ts/);
    assert.equal(workspaceDeleteSelectSqlIsReadOnly(), true);
    assert.equal(workspaceDeleteMutationIsScoped(), true);
    const mutation = source(MOD).match(/export const WORKSPACE_DELETE_MUTATION_SQL = `([^`]+)`/)?.[1] ?? "";
    assert.match(mutation, /DELETE FROM workspaces/);
    assert.match(mutation, /lower\(email\) = ANY\(\$1::text\[\]\)/);
    assert.doesNotMatch(mutation, /DELETE FROM merchants|DELETE FROM guard_decisions|DELETE FROM track_events/);
    assert.doesNotMatch(source(MOD), /FOREIGN KEY|CREATE UNIQUE|CREATE INDEX|002_/);
    const cli = source(CLI);
    assert.match(cli, /executeP12_2WorkspaceDelete/);
    assert.doesNotMatch(cli, /db:backfill|db:reconcile|runBackfill|upsertAccount/);
    assert.doesNotMatch(cli, /DELETE FROM merchants|DELETE FROM guard_decisions|DELETE FROM track_events/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.deepEqual([...P12_2_WORKSPACE_DELETE_EMAILS], ["p12.2-alice@test.com", "p12.2-bob@test.com"]);
  });

  it("plans GO only for one workspace each, matching ownerEmail, with no other catalog refs", () => {
    const ok = planP12_2WorkspaceDelete({
      targets: targets(),
      merchantHits: [],
      eventHits: [],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(ok.go, true);
    const merchant = planP12_2WorkspaceDelete({
      targets: targets(),
      merchantHits: ["p12.2-alice@test.com"],
      eventHits: [],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(merchant.go, false);
    const events = planP12_2WorkspaceDelete({
      targets: targets(),
      merchantHits: [],
      eventHits: [{ email: "p12.2-bob@test.com", n: 1 }],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(events.go, false);
    const guards = planP12_2WorkspaceDelete({
      targets: targets(),
      merchantHits: [],
      eventHits: [],
      guardHits: [{ email: "p12.2-alice@test.com", n: 1 }],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(guards.go, false);
    const owner = planP12_2WorkspaceDelete({
      targets: [
        { email: "p12.2-alice@test.com", ownerEmail: "other@test.com", files: 1, updatedAt: null },
        { email: "p12.2-bob@test.com", ownerEmail: "p12.2-bob@test.com", files: 1, updatedAt: null },
      ],
      merchantHits: [],
      eventHits: [],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(owner.go, false);
    const missing = planP12_2WorkspaceDelete({
      targets: targets().slice(0, 1),
      merchantHits: [],
      eventHits: [],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE },
    });
    assert.equal(missing.go, false);
    const counts = planP12_2WorkspaceDelete({
      targets: targets(),
      merchantHits: [],
      eventHits: [],
      guardHits: [],
      before: { ...EXPECTED_COUNTS_BEFORE, workspaces: 4 },
    });
    assert.equal(counts.go, false);
  });

  it("commits when after counts are 205/3/181/115 and rolls back on drift", async () => {
    const goClient = fakeClient({
      before: { ...EXPECTED_COUNTS_BEFORE },
      targets: targets(),
      after: { ...EXPECTED_COUNTS_AFTER },
      remaining: 0,
    });
    const go = await executeP12_2WorkspaceDelete(goClient);
    assert.equal(go.go, "GO");
    assert.equal(go.rowsDeleted, 2);
    assert.equal(go.rolledBack, false);
    assert.deepEqual(goClient.log, ["BEGIN", "DELETE", "COMMIT"]);
    assert.equal(go.after?.workspaces, 3);

    const driftClient = fakeClient({
      before: { ...EXPECTED_COUNTS_BEFORE },
      targets: targets(),
      after: { ...EXPECTED_COUNTS_AFTER, merchants: 204 },
      remaining: 0,
    });
    const drift = await executeP12_2WorkspaceDelete(driftClient);
    assert.equal(drift.go, "NO-GO");
    assert.equal(drift.rolledBack, true);
    assert.deepEqual(driftClient.log, ["BEGIN", "DELETE", "ROLLBACK"]);

    const shortClient = fakeClient({
      before: { ...EXPECTED_COUNTS_BEFORE },
      targets: targets().slice(0, 1),
      after: { ...EXPECTED_COUNTS_BEFORE },
      remaining: 1,
    });
    const short = await executeP12_2WorkspaceDelete(shortClient);
    assert.equal(short.go, "NO-GO");
    assert.deepEqual(shortClient.log, ["BEGIN", "ROLLBACK"]);
  });
});

function fakeClient(opts: {
  before: CatalogCounts;
  targets: TargetWorkspaceRow[];
  after: CatalogCounts;
  remaining: number;
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
      if (text.startsWith("DELETE FROM workspaces")) {
        log.push("DELETE");
        deleted = true;
        const emails = (values?.[0] as string[]) ?? [];
        return { rows: emails.map((email) => ({ email, owner_email: email })) };
      }
      if (text.includes("FOR UPDATE")) {
        return {
          rows: opts.targets.map((row) => ({
            email: row.email,
            owner_email: row.ownerEmail,
            files: row.files,
            updated_at: row.updatedAt,
          })),
        };
      }
      if (text.includes("SELECT COUNT(*)::int AS n") && text.includes("FROM workspaces")) {
        return { rows: [{ n: deleted ? opts.remaining : opts.targets.length }] };
      }
      if (text.includes("FROM merchants WHERE lower(email) = ANY")) {
        return { rows: [] };
      }
      if (text.includes("FROM track_events")) {
        return { rows: [] };
      }
      if (text.includes("FROM guard_decisions")) {
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${text.slice(0, 80)}`);
    },
  };
}
