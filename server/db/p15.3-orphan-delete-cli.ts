import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { orphanMarkerPath } from "@/server/db/orphan-classify";
import { decisionGateMarkerPath } from "@/server/db/p15.3-decision-gate";
import {
  executeOrphanGuardDelete,
  loadClassifiedGuardOrphans,
  orphanDeleteMarkerPath,
  orphanDeleteMutationIsScoped,
  orphanDeleteSelectSqlIsReadOnly,
} from "@/server/db/p15.3-orphan-delete";

async function main() {
  if (!existsSync(join(process.cwd(), "data", ".p15.1-postgres-audit"))) {
    console.error("[p15.3-delete] refuse: P15.1 audit marker is missing.");
    process.exit(1);
  }
  if (!existsSync(orphanMarkerPath())) {
    console.error("[p15.3-delete] refuse: P15.2 orphan classification marker is missing.");
    process.exit(1);
  }
  if (!existsSync(decisionGateMarkerPath())) {
    console.error("[p15.3-delete] refuse: P15.3 Decision Gate marker is missing.");
    process.exit(1);
  }
  if (existsSync(join(process.cwd(), "docs", "p15.4.md"))) {
    console.error("[p15.3-delete] refuse: docs/p15.4.md exists. This GO is not P15.4.");
    process.exit(1);
  }
  if (!orphanDeleteSelectSqlIsReadOnly() || !orphanDeleteMutationIsScoped()) {
    console.error("[p15.3-delete] refuse: delete SQL is not scoped to orphan guard_decisions by id.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.3-delete] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.3-delete] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  const classified = loadClassifiedGuardOrphans(JSON.parse(readFileSync(orphanMarkerPath(), "utf8")));
  const client = await pool.connect();
  try {
    const report = await executeOrphanGuardDelete(client, classified);
    const lines = [
      `P15.3 targeted orphan delete: ${report.go}`,
      `PostgreSQL mutated:        ${report.postgresMutated}`,
      `Rolled back:               ${report.rolledBack}`,
      `Rows deleted:              ${report.rowsDeleted}`,
      `FK / UNIQUE / 002:         ${report.foreignKeysAdded} / ${report.uniqueConstraintsAdded} / ${report.migration002}`,
      `P15.4 started:             ${report.p15_4_started}`,
      `Reason:                    ${report.reason}`,
    ];
    console.log(lines.join("\n"));
    console.log("");
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(orphanDeleteMarkerPath(), JSON.stringify(report, null, 2), "utf8");
    if (report.go !== "GO") process.exitCode = 1;
  } catch (error) {
    console.error("[p15.3-delete] failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
