import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { p15_4MarkerPath } from "@/server/db/p15.4-verify";
import {
  inspectP15_5Sources,
  p15_5HasNoMutationSql,
  p15_5MarkerPath,
  p15_5SelectSqlIsReadOnly,
  runP15_5Audit,
} from "@/server/db/p15.5-final-audit";

async function main() {
  if (!existsSync(p15_4MarkerPath())) {
    console.error("[p15.5] refuse: P15.4 final-hardening marker is missing.");
    process.exit(1);
  }
  if (existsSync(join(process.cwd(), "docs", "p16.md"))) {
    console.error("[p15.5] refuse: docs/p16.md exists. This GO is Final Audit only, not P16.");
    process.exit(1);
  }
  if (!p15_5SelectSqlIsReadOnly() || !p15_5HasNoMutationSql()) {
    console.error("[p15.5] refuse: Final Audit SQL is not SELECT-only.");
    process.exit(1);
  }
  const sources = inspectP15_5Sources();
  if (sources.migration002OnDisk) {
    console.error("[p15.5] refuse: migration 002 is present.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.5] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.5] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const report = await runP15_5Audit(client, sources);
    const lines = [
      `P15.5 Final Audit:         ${report.go}`,
      `Ready for cleanup then P16:${report.readyForCleanupThenP16}`,
      `PostgreSQL mutated:        ${report.postgresMutated}`,
      `Rows deleted:              ${report.rowsDeleted}`,
      `FK / UNIQUE / 002 / P16:   ${report.foreignKeysAdded} / ${report.uniqueConstraintsAdded} / ${report.migration002} / ${report.p16_started}`,
      `Counts:                    ${report.evidence.counts.merchants}/${report.evidence.counts.workspaces}/${report.evidence.counts.track_events}/${report.evidence.counts.guard_decisions}`,
      `Orphans ws/guard/event:    ${report.evidence.workspaceOrphans}/${report.evidence.guardOrphans}/${report.evidence.eventOrphans}`,
      `Empty phones:              ${report.evidence.emptyPhoneCount}`,
      `Reasons:                   ${report.reasons.join(" | ")}`,
      `Deferred:                  ${report.deferred.join(" | ")}`,
    ];
    console.log(lines.join("\n"));
    console.log("");
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(p15_5MarkerPath(), JSON.stringify(report, null, 2), "utf8");
    if (report.go !== "GO") process.exitCode = 1;
  } catch (error) {
    console.error("[p15.5] failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
