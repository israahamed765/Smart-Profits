import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { requirePostgres } from "@/server/db/postgres";
import {
  EXPECTED_P15_4_COUNTS,
  P15_4_PROBE_EMAIL,
  classifyP15_4,
  p15_4ProbeNeverDeletes,
  p15_4SelectSqlIsReadOnly,
  runP15_4Verify,
  type CatalogCounts,
  type P15_4Evidence,
} from "@/server/db/p15.4-verify";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.4.md";
const CLI = "server/db/p15.4-verify-cli.ts";
const MOD = "server/db/p15.4-verify.ts";
const MIGRATION_DIR = "server/db/migrations";
const CATALOG_REPOS = [
  "server/repositories/user.repository.ts",
  "server/repositories/workspace.repository.ts",
  "server/repositories/event.repository.ts",
  "server/repositories/guard-log.repository.ts",
];

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function okEvidence(patch: Partial<P15_4Evidence> = {}): P15_4Evidence {
  return {
    counts: { ...EXPECTED_P15_4_COUNTS },
    workspaceOrphans: 0,
    guardOrphans: 0,
    eventOrphans: 0,
    workspaceEmails: ["a@store.test", "b@store.test", "c@store.test"],
    foreignKeyCount: 0,
    extraUnique: [],
    appliedMigrations: ["001_current_schema.sql"],
    indexNames: ["guard_decisions_email_created_idx", "merchants_pkey"],
    unfilteredNode: "Seq Scan",
    unfilteredCost: 24,
    byEmailNode: "Index Scan",
    merchantByEmailNode: "Index Scan",
    createIndexNow: false,
    probePresentBefore: false,
    probeWriteVisible: true,
    probeRolledBack: true,
    countsAfterProbe: { ...EXPECTED_P15_4_COUNTS },
    probeHitsAfter: { merchants: 0, workspaces: 0, track_events: 0, guard_decisions: 0 },
    ...patch,
  };
}

describe("P15.4 Final Hardening / Verification", () => {
  it("does not add FK, UNIQUE, 002, or extra deletes; Final Audit and P16 locks are present", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.4-verify":/);
    assert.match(source("package.json"), /tests\/p15\.4-final-hardening\.test\.ts/);
    assert.equal(p15_4SelectSqlIsReadOnly(), true);
    assert.equal(p15_4ProbeNeverDeletes(), true);
    const cli = source(CLI);
    assert.match(cli, /runP15_4Verify/);
    assert.match(source(MOD), /ROLLBACK/);
    assert.doesNotMatch(cli, /db:backfill|db:reconcile|runBackfill|upsertAccount/);
    assert.doesNotMatch(cli, /DELETE FROM merchants|DELETE FROM workspaces|DELETE FROM track_events|DELETE FROM guard_decisions/);
    assert.doesNotMatch(source(MOD), /CREATE UNIQUE|CREATE INDEX|002_/);
    assert.doesNotMatch(source(MOD), /ALTER TABLE|ADD CONSTRAINT/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.5-final-audit.md")), true);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
  });

  it("GO only when post-delete counts, zero orphans, and rolled-back probe match", () => {
    const ok = classifyP15_4(okEvidence());
    assert.equal(ok.go, "GO");
    const counts = classifyP15_4(okEvidence({ counts: { ...EXPECTED_P15_4_COUNTS, workspaces: 5 } }));
    assert.equal(counts.go, "NO-GO");
    const orphans = classifyP15_4(okEvidence({ guardOrphans: 1 }));
    assert.equal(orphans.go, "NO-GO");
    const fk = classifyP15_4(okEvidence({ foreignKeyCount: 1 }));
    assert.equal(fk.go, "NO-GO");
    const unique = classifyP15_4(okEvidence({ extraUnique: [{ table: "merchants", name: "merchants_phone_key" }] }));
    assert.equal(unique.go, "NO-GO");
    const leftover = classifyP15_4(
      okEvidence({ probeHitsAfter: { merchants: 1, workspaces: 0, track_events: 0, guard_decisions: 0 } }),
    );
    assert.equal(leftover.go, "NO-GO");
  });

  it("rolls the write probe back and throws when PostgreSQL returns null with no JSON fallback", async () => {
    for (const rel of CATALOG_REPOS) {
      const body = source(rel);
      assert.match(body, /requirePostgres/);
      assert.doesNotMatch(body, /from ["']@\/server\/storage\/json-store/);
      assert.doesNotMatch(body, /readJsonFile|writeJsonFile/);
    }
    assert.throws(
      () => requirePostgres(null, "read accounts from the database"),
      /Could not read accounts from the database/,
    );

    const client = fakeClient({
      counts: { ...EXPECTED_P15_4_COUNTS },
      workspaceEmails: ["live-a@store.test", "live-b@store.test", "live-c@store.test"],
    });
    const report = await runP15_4Verify(client);
    assert.equal(report.go, "GO");
    assert.equal(report.postgresMutated, false);
    assert.equal(report.rowsDeleted, 0);
    assert.equal(report.migration002, false);
    assert.equal(report.finalAuditStarted, false);
    assert.deepEqual(client.log, ["BEGIN", "INSERT", "INSERT", "INSERT", "INSERT", "ROLLBACK"]);
    assert.equal(report.evidence.probeWriteVisible, true);
    assert.equal(report.evidence.probeRolledBack, true);
    assert.equal(report.evidence.workspaceOrphans, 0);
  });
});

function fakeClient(opts: { counts: CatalogCounts; workspaceEmails: string[] }) {
  const log: string[] = [];
  let inTx = false;
  let inserted = false;
  return {
    log,
    async query(sql: string) {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text === "BEGIN") {
        log.push("BEGIN");
        inTx = true;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        log.push("ROLLBACK");
        inTx = false;
        inserted = false;
        return { rows: [] };
      }
      if (text === "COMMIT") {
        log.push("COMMIT");
        inTx = false;
        return { rows: [] };
      }
      if (text.startsWith("INSERT INTO")) {
        log.push("INSERT");
        inserted = true;
        return { rows: [] };
      }
      if (text.includes("AS merchants") && text.includes("AS guard_decisions") && text.includes("FROM merchants) AS merchants")) {
        const delta = inTx && inserted ? 1 : 0;
        return {
          rows: [
            {
              merchants: opts.counts.merchants + delta,
              workspaces: opts.counts.workspaces + delta,
              track_events: opts.counts.track_events + delta,
              guard_decisions: opts.counts.guard_decisions + delta,
            },
          ],
        };
      }
      if (text.includes("FROM workspaces w") && text.includes("NOT EXISTS")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("FROM guard_decisions g") && text.includes("NOT EXISTS")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("FROM track_events e") && text.includes("NOT EXISTS")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("FROM workspaces ORDER BY 1")) {
        return { rows: opts.workspaceEmails.map((email) => ({ email })) };
      }
      if (text.includes("constraint_type = 'FOREIGN KEY'")) {
        return { rows: [] };
      }
      if (text.includes("constraint_type = 'UNIQUE'")) {
        return { rows: [] };
      }
      if (text.includes("FROM schema_migrations")) {
        return { rows: [{ id: "001_current_schema.sql" }] };
      }
      if (text.includes("FROM pg_indexes")) {
        return {
          rows: [
            {
              tablename: "guard_decisions",
              indexname: "guard_decisions_email_created_idx",
              indexdef: "CREATE INDEX guard_decisions_email_created_idx ON public.guard_decisions USING btree (email, created_at DESC)",
            },
          ],
        };
      }
      if (text.startsWith("EXPLAIN") && text.includes("FROM merchants")) {
        return { rows: [{ "QUERY PLAN": "Index Scan" }] };
      }
      if (text.startsWith("EXPLAIN") && text.includes("WHERE email")) {
        return { rows: [{ "QUERY PLAN": "Index Scan" }] };
      }
      if (text.startsWith("EXPLAIN")) {
        return { rows: [{ "QUERY PLAN": "Seq Scan" }] };
      }
      if (text.includes("FROM merchants ORDER BY email LIMIT 1")) {
        return { rows: [{ email: "live-a@store.test" }] };
      }
      if (text.includes("p15.4-probe") || text.includes(P15_4_PROBE_EMAIL) || text.includes("FROM merchants WHERE lower(email) = $1")) {
        const hit = inTx && inserted ? 1 : 0;
        return {
          rows: [{ merchants: hit, workspaces: hit, track_events: hit, guard_decisions: hit }],
        };
      }
      throw new Error(`unexpected sql: ${text.slice(0, 100)}`);
    },
  };
}
