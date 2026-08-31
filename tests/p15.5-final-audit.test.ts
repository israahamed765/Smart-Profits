import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { requirePostgres } from "@/server/db/postgres";
import { EXPECTED_PUBLIC_TABLES } from "@/server/db/postgres-audit";
import { EXPECTED_P15_4_COUNTS, type CatalogCounts } from "@/server/db/p15.4-verify";
import {
  allP15_5SelectSql,
  classifyP15_5,
  inspectP15_5Sources,
  p15_5HasNoMutationSql,
  p15_5SelectSqlIsReadOnly,
  runP15_5Audit,
  type P15_5Evidence,
  type P15_5SourceScan,
} from "@/server/db/p15.5-final-audit";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.5-final-audit.md";
const CLI = "server/db/p15.5-final-audit-cli.ts";
const MOD = "server/db/p15.5-final-audit.ts";
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

function okSources(patch: Partial<P15_5SourceScan> = {}): P15_5SourceScan {
  return {
    catalogJsonFallback: false,
    demoUsesJsonStore: true,
    demoFile: true,
    migration002OnDisk: false,
    p15UmbrellaDoc: false,
    p16Doc: false,
    libUtilsPresent: true,
    ...patch,
  };
}

function okEvidence(patch: Partial<P15_5Evidence> = {}): P15_5Evidence {
  return {
    tables: [...EXPECTED_PUBLIC_TABLES],
    counts: { ...EXPECTED_P15_4_COUNTS },
    workspaceOrphans: 0,
    guardOrphans: 0,
    eventOrphans: 0,
    workspaceEmails: [
      "pitch.demo.1786709548@smartprofits.dev",
      "pitch.demo.1786709716@smartprofits.dev",
      "tsraathmd@gmail.com",
    ],
    foreignKeyCount: 0,
    extraUnique: [],
    appliedMigrations: ["001_current_schema.sql"],
    indexNames: ["guard_decisions_email_created_idx", "merchants_pkey"],
    merchantEmailMismatch: 0,
    merchantBadPayload: 0,
    workspaceOwnerMismatch: 0,
    workspaceMissingFiles: 0,
    eventBadPayload: 0,
    eventIds: { sha256: 100, uuid: 81, other: 0 },
    emptyPhoneCount: 2,
    emptyPhoneEmails: ["p124-admin-patch@test.com", "p124-live-patch@test.com"],
    duplicatePhones: 0,
    sources: okSources(),
    ...patch,
  };
}

describe("P15.5 Final Audit", () => {
  it("is SELECT-only; does not add FK, UNIQUE, or 002; P16 lock is present", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.5-final-audit":/);
    assert.match(source("package.json"), /tests\/p15\.5-final-audit\.test\.ts/);
    assert.equal(p15_5SelectSqlIsReadOnly(), true);
    assert.equal(p15_5HasNoMutationSql(), true);
    for (const sql of allP15_5SelectSql()) {
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i, sql.slice(0, 80));
    }
    const cli = source(CLI);
    assert.match(cli, /runP15_5Audit/);
    assert.doesNotMatch(cli, /INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE TABLE|BEGIN|COMMIT|ROLLBACK/);
    assert.doesNotMatch(cli, /db:backfill|db:reconcile|runBackfill|upsertAccount/);
    assert.doesNotMatch(source(MOD), /CREATE UNIQUE|CREATE INDEX|002_|ADD CONSTRAINT/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.5-final-audit.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.equal(existsSync(join(ROOT, "lib/utils.ts")), true);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.equal(existsSync(join(ROOT, "server/db/backfill-cli.ts")), false);
    assert.equal(existsSync(join(ROOT, "server/db/p15.4-verify-cli.ts")), true);
  });

  it("GO only when catalog, schema, and repositories match the P15.4 close; UNIQUE/FK stay deferred", () => {
    const ok = classifyP15_5(okEvidence());
    assert.equal(ok.go, "GO");
    assert.ok(ok.deferred.some((row) => /UNIQUE\(phone\) stays BLOCKED/.test(row)));
    assert.ok(ok.deferred.some((row) => /FK not present/.test(row)));
    assert.ok(ok.deferred.some((row) => /P16/.test(row)));

    const growth = classifyP15_5(
      okEvidence({ counts: { ...EXPECTED_P15_4_COUNTS, track_events: 182, guard_decisions: 116 } }),
    );
    assert.equal(growth.go, "GO");
    assert.ok(growth.deferred.some((row) => /Activity after P15.4/.test(row)));

    assert.equal(classifyP15_5(okEvidence({ counts: { ...EXPECTED_P15_4_COUNTS, merchants: 204 } })).go, "NO-GO");
    assert.equal(classifyP15_5(okEvidence({ counts: { ...EXPECTED_P15_4_COUNTS, track_events: 180 } })).go, "NO-GO");
    assert.equal(classifyP15_5(okEvidence({ guardOrphans: 1 })).go, "NO-GO");
    assert.equal(classifyP15_5(okEvidence({ foreignKeyCount: 1 })).go, "NO-GO");
    assert.equal(
      classifyP15_5(okEvidence({ extraUnique: [{ table: "merchants", name: "merchants_phone_key" }] })).go,
      "NO-GO",
    );
    assert.equal(classifyP15_5(okEvidence({ eventIds: { sha256: 1, uuid: 1, other: 1 } })).go, "NO-GO");
    assert.equal(classifyP15_5(okEvidence({ sources: okSources({ catalogJsonFallback: true }) })).go, "NO-GO");
    assert.equal(classifyP15_5(okEvidence({ sources: okSources({ p16Doc: true }) })).go, "GO");
  });

  it("SELECT-only audit throws when PostgreSQL is null and does not write catalog rows", async () => {
    for (const rel of CATALOG_REPOS) {
      const body = source(rel);
      assert.match(body, /requirePostgres/);
      assert.doesNotMatch(body, /from ["']@\/server\/storage\/json-store/);
      assert.doesNotMatch(body, /readJsonFile|writeJsonFile/);
    }
    const sources = inspectP15_5Sources(ROOT);
    assert.equal(sources.catalogJsonFallback, false);
    assert.equal(sources.demoUsesJsonStore, true);
    assert.equal(sources.migration002OnDisk, false);
    assert.equal(sources.p16Doc, true);
    assert.throws(
      () => requirePostgres(null, "read accounts from the database"),
      /Could not read accounts from the database/,
    );

    const client = fakeClient({ counts: { ...EXPECTED_P15_4_COUNTS } });
    const report = await runP15_5Audit(client, sources);
    assert.equal(report.go, "GO");
    assert.equal(report.readyForCleanupThenP16, true);
    assert.equal(report.postgresMutated, false);
    assert.equal(report.rowsDeleted, 0);
    assert.equal(report.foreignKeysAdded, 0);
    assert.equal(report.uniqueConstraintsAdded, 0);
    assert.equal(report.migration002, false);
    assert.equal(report.p16_started, false);
    assert.deepEqual(client.log, []);
    assert.equal(report.evidence.workspaceOrphans, 0);
    assert.equal(report.evidence.guardOrphans, 0);
    assert.equal(report.evidence.eventOrphans, 0);
    assert.equal(report.evidence.emptyPhoneCount, 2);
  });
});

function fakeClient(opts: { counts: CatalogCounts }) {
  const log: string[] = [];
  return {
    log,
    async query(sql: string) {
      const text = sql.replace(/\s+/g, " ").trim();
      if (/\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|ALTER|DROP)\b/i.test(text)) {
        log.push(text.slice(0, 40));
        throw new Error(`mutation sql is not allowed in Final Audit: ${text.slice(0, 80)}`);
      }
      if (text.includes("FROM pg_class")) {
        return { rows: EXPECTED_PUBLIC_TABLES.map((table_name) => ({ table_name })) };
      }
      if (text.includes("AS merchants") && text.includes("AS guard_decisions")) {
        return { rows: [{ ...opts.counts }] };
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
        return {
          rows: [
            { email: "pitch.demo.1786709548@smartprofits.dev" },
            { email: "pitch.demo.1786709716@smartprofits.dev" },
            { email: "tsraathmd@gmail.com" },
          ],
        };
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
        return { rows: [{ tablename: "guard_decisions", indexname: "guard_decisions_email_created_idx" }] };
      }
      if (text.includes("payload->>'email'") && text.includes("FROM merchants")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("jsonb_typeof(payload)") && text.includes("FROM merchants")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("ownerEmail")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("payload->'files'")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("jsonb_typeof(payload)") && text.includes("FROM track_events")) {
        return { rows: [{ n: 0 }] };
      }
      if (text.includes("AS sha256")) {
        return { rows: [{ sha256: 100, uuid: 81, other: 0 }] };
      }
      if (text.includes("SELECT email") && text.includes("payload->>'phone'")) {
        return {
          rows: [{ email: "p124-admin-patch@test.com" }, { email: "p124-live-patch@test.com" }],
        };
      }
      if (text.includes("payload->>'phone'") && text.includes("COUNT(*)") && !text.includes("HAVING")) {
        return { rows: [{ n: 2 }] };
      }
      if (text.includes("HAVING COUNT(*) > 1")) {
        return { rows: [{ n: 0 }] };
      }
      throw new Error(`unexpected sql: ${text.slice(0, 120)}`);
    },
  };
}
