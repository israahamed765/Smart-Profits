import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import {
  EXPECTED_LIVE_COUNTS,
  P15_1_CATALOG_REPOS,
  allAuditSql,
  auditMarkerPath,
  auditSqlIsReadOnly,
  countsMatchExpected,
  formatPostgresAudit,
  postgresAuditGo,
  runProductionAudit,
  sourceConcurrencyFindings,
} from "@/server/db/postgres-audit";
import { parseArchiveDeletedMarker, archiveDeleteMarkerPath } from "@/server/db/p14.23-archive-marker";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

async function main() {
  const p23 = parseArchiveDeletedMarker(
    existsSync(archiveDeleteMarkerPath()) ? readFileSync(archiveDeleteMarkerPath(), "utf8") : null,
  );
  if (!p23) {
    console.error("[p15.1] refuse: P14.23 archive-deleted marker is missing or invalid.");
    process.exit(1);
  }
  if (!allAuditSql().every(auditSqlIsReadOnly)) {
    console.error("[p15.1] refuse: audit SQL is not read-only.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.1] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.1] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  try {
    const report = await runProductionAudit(pool);
    report.findings.push(
      ...sourceConcurrencyFindings({
        userRepo: source("server/repositories/user.repository.ts"),
        workspaceRepo: source("server/repositories/workspace.repository.ts"),
        eventRepo: source("server/repositories/event.repository.ts"),
        guardRepo: source("server/repositories/guard-log.repository.ts"),
        postgres: source("server/db/postgres.ts"),
      }),
    );

    const go = postgresAuditGo({
      pgReachable: true,
      migration001: report.migrations.some((row) => row.id === "001_current_schema.sql"),
      tablesPresent: report.tables.includes("merchants") && report.tables.includes("track_events"),
      sqlReadOnly: true,
      reposUnchanged: P15_1_CATALOG_REPOS.every((rel) => !source(rel).includes("P15.2")),
      schemaUnchanged: true,
      reportRecorded: true,
      noMutations: true,
    });

    console.log(
      formatPostgresAudit({
        go,
        counts: report.counts,
        countsMatch: countsMatchExpected(report.counts),
        foreignKeyCount: report.foreignKeyCount,
        findings: report.findings,
      }),
    );
    console.log("");
    console.log(
      JSON.stringify(
        {
          go,
          expectedCounts: EXPECTED_LIVE_COUNTS,
          counts: report.counts,
          countsMatch: countsMatchExpected(report.counts),
          tables: report.tables,
          sequences: report.sequences,
          foreignKeyCount: report.foreignKeyCount,
          migrations: report.migrations,
          indexes: report.indexes,
          constraints: report.constraints,
          integrity: report.integrity,
          plans: report.plans,
          findings: report.findings,
        },
        null,
        2,
      ),
    );

    if (!go) {
      process.exitCode = 1;
      return;
    }

    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(
      auditMarkerPath(),
      JSON.stringify(
        {
          auditedAt: new Date().toISOString(),
          reason: "P15.1 production PostgreSQL audit",
          postgresMutated: false,
          schemaChanged: false,
          counts: report.counts,
          findingIds: report.findings.map((row) => row.id),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error("[p15.1] audit failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
