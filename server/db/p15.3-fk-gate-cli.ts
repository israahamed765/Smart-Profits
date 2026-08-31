import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { orphanMarkerPath } from "@/server/db/orphan-classify";
import { fkGateMarkerPath, fkGateSqlIsReadOnly, runFkGate } from "@/server/db/p15.3-fk-gate";

async function main() {
  if (!existsSync(join(process.cwd(), "data", ".p15.1-postgres-audit"))) {
    console.error("[p15.3] refuse: P15.1 audit marker is missing.");
    process.exit(1);
  }
  if (!existsSync(orphanMarkerPath())) {
    console.error("[p15.3] refuse: P15.2 orphan classification marker is missing.");
    process.exit(1);
  }
  if (!fkGateSqlIsReadOnly()) {
    console.error("[p15.3] refuse: FK-gate SQL is not read-only.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.3] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.3] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  try {
    const { orphans, gate } = await runFkGate(pool);
    console.log(
      [
        "P15.3 FK gate: wait-for-fk-go",
        `Workspace orphans:         ${orphans.workspaceOrphans.length}`,
        `Guard orphan emails:       ${orphans.guardOrphans.length}`,
        `Guard orphan rows:         ${orphans.guardOrphans.reduce((sum, row) => sum + row.n, 0)}`,
        `Unknown class:             ${orphans.unknownCount}`,
        `Rows deleted:              ${gate.rowsDeleted}`,
        `FK added:                  ${gate.foreignKeysAdded}`,
        `UNIQUE added:              ${gate.uniqueConstraintsAdded}`,
        `Workspace CAS:             deferred`,
        `PostgreSQL mutated:        ${gate.postgresMutated}`,
      ].join("\n"),
    );
    console.log("");
    console.log(JSON.stringify({ orphans, gate }, null, 2));
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(fkGateMarkerPath(), JSON.stringify({ orphans, gate }, null, 2), "utf8");
  } catch (error) {
    console.error("[p15.3] FK gate failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
