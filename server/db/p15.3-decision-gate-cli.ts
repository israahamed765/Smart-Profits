import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { fkGateMarkerPath } from "@/server/db/p15.3-fk-gate";
import {
  decisionGateMarkerPath,
  decisionSqlIsReadOnly,
  runDecisionGate,
} from "@/server/db/p15.3-decision-gate";

async function main() {
  if (!existsSync(join(process.cwd(), "data", ".p15.1-postgres-audit"))) {
    console.error("[p15.3-gate] refuse: P15.1 audit marker is missing.");
    process.exit(1);
  }
  if (!existsSync(fkGateMarkerPath())) {
    console.error("[p15.3-gate] refuse: P15.3 FK-gate marker is missing.");
    process.exit(1);
  }
  if (!decisionSqlIsReadOnly()) {
    console.error("[p15.3-gate] refuse: decision SQL is not read-only.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.3-gate] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.3-gate] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  try {
    const report = await runDecisionGate(pool);
    const lines = [
      "P15.3 Decision Gate: SELECT-only",
      `PostgreSQL mutated:        ${report.postgresMutated}`,
      `Rows deleted:              ${report.rowsDeleted}`,
      `FK / UNIQUE / 002:         ${report.foreignKeysAdded} / ${report.uniqueConstraintsAdded} / ${report.migration002}`,
      `P15.4 started:             ${report.p15_4_started}`,
      "",
      "Decisions:",
      ...report.items.map((item) => `  ${item.verdict.padEnd(22)} ${item.id}`),
    ];
    console.log(lines.join("\n"));
    console.log("");
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(decisionGateMarkerPath(), JSON.stringify(report, null, 2), "utf8");
  } catch (error) {
    console.error("[p15.3-gate] failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
