import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { databaseUrl, getPool } from "@/server/db/postgres";
import { parseArchiveDeletedMarker, archiveDeleteMarkerPath } from "@/server/db/p14.23-archive-marker";
import {
  classifyLiveOrphans,
  orphanMarkerPath,
  orphanSqlIsReadOnly,
} from "@/server/db/orphan-classify";

async function main() {
  const p23 = parseArchiveDeletedMarker(
    existsSync(archiveDeleteMarkerPath()) ? readFileSync(archiveDeleteMarkerPath(), "utf8") : null,
  );
  if (!p23) {
    console.error("[p15.2] refuse: P14.23 archive-deleted marker is missing or invalid.");
    process.exit(1);
  }
  if (!existsSync(join(process.cwd(), "data", ".p15.1-postgres-audit"))) {
    console.error("[p15.2] refuse: P15.1 audit marker is missing.");
    process.exit(1);
  }
  if (!orphanSqlIsReadOnly()) {
    console.error("[p15.2] refuse: orphan SQL is not read-only.");
    process.exit(1);
  }
  if (!databaseUrl()) {
    console.error("[p15.2] DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[p15.2] PostgreSQL pool is unavailable.");
    process.exit(1);
  }

  try {
    const report = await classifyLiveOrphans(pool);
    console.log(
      [
        "P15.2 orphan classification: GO",
        `Workspace orphans:         ${report.workspaceOrphans.length}`,
        `Guard orphan emails:       ${report.guardOrphans.length}`,
        `Guard orphan rows:         ${report.guardOrphans.reduce((sum, row) => sum + row.n, 0)}`,
        `Unknown class:             ${report.unknownCount}`,
        `Rows deleted:              ${report.rowsDeleted}`,
        `PostgreSQL mutated:        ${report.postgresMutated}`,
        `Guard created_at index:    deferred (${report.guardIndex.unfilteredNode})`,
      ].join("\n"),
    );
    console.log("");
    console.log(JSON.stringify(report, null, 2));

    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(orphanMarkerPath(), JSON.stringify(report, null, 2), "utf8");
  } catch (error) {
    console.error("[p15.2] classify failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
