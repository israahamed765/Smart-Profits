import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { workspaceDeleteMarkerPath } from "@/server/db/p15.3-workspace-delete";
import { orphanDeleteMarkerPath } from "@/server/db/p15.3-orphan-delete";
import { decisionGateMarkerPath } from "@/server/db/p15.3-decision-gate";
import {
  p15_4MarkerPath,
  p15_4ProbeNeverDeletes,
  p15_4SelectSqlIsReadOnly,
  runP15_4Verify,
} from "@/server/db/p15.4-verify";

async function main() {
  if (!existsSync(join(process.cwd(), "data", ".p15.1-postgres-audit"))) {
    console.error("[p15.4] refuse: P15.1 audit marker is missing.");
    process.exit(1);
  }
  if (!existsSync(decisionGateMarkerPath())) {
    console.error("[p15.4] refuse: P15.3 Decision Gate marker is missing.");
    process.exit(1);
  }
  if (!existsSync(orphanDeleteMarkerPath())) {
    console.error("[p15.4] refuse: P15.3 orphan-guard delete marker is missing.");
    process.exit(1);
  }
  if (!existsSync(workspaceDeleteMarkerPath())) {
    console.error("[p15.4] refuse: P15.3 workspace delete marker is missing.");
    process.exit(1);
  }
  if (existsSync(join(process.cwd(), "docs", "p15.5-final-audit.md"))) {
    console.error("[p15.4] refuse: docs/p15.5-final-audit.md exists. Re-run would write a probe; Final Audit is SELECT-only.");
    process.exit(1);
  }
  if (existsSync(join(process.cwd(), "docs", "p16.md"))) {
    console.error("[p15.4] refuse: docs/p16.md exists. Final Audit / P16 is not this slice.");
    process.exit(1);
  }
  const migrations = readdirSync(join(process.cwd(), "server", "db", "migrations")).filter((name) => name.endsWith(".sql"));
  if (migrations.some((name) => name.startsWith("002"))) {
    console.error("[p15.4] refuse: migration 002 is present. P15.4 must not add it.");
    process.exit(1);
  }
  if (!p15_4SelectSqlIsReadOnly() || !p15_4ProbeNeverDeletes()) {
    console.error("[p15.4] refuse: verification SQL is not scoped.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.4] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.4] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const report = await runP15_4Verify(client);
    const lines = [
      `P15.4 Final Hardening / Verification: ${report.go}`,
      `PostgreSQL mutated:        ${report.postgresMutated}`,
      `Rows deleted:              ${report.rowsDeleted}`,
      `FK / UNIQUE / 002:         ${report.foreignKeysAdded} / ${report.uniqueConstraintsAdded} / ${report.migration002}`,
      `Final Audit / P16:         ${report.finalAuditStarted} / ${report.p16_started}`,
      `Counts:                    ${report.evidence.counts.merchants}/${report.evidence.counts.workspaces}/${report.evidence.counts.track_events}/${report.evidence.counts.guard_decisions}`,
      `Orphans ws/guard/event:    ${report.evidence.workspaceOrphans}/${report.evidence.guardOrphans}/${report.evidence.eventOrphans}`,
      `Probe rolled back:         ${report.evidence.probeRolledBack}`,
      `Reasons:                   ${report.reasons.join(" | ")}`,
    ];
    console.log(lines.join("\n"));
    console.log("");
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(p15_4MarkerPath(), JSON.stringify(report, null, 2), "utf8");
    if (report.go !== "GO") process.exitCode = 1;
  } catch (error) {
    console.error("[p15.4] failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
