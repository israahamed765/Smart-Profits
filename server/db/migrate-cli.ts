import { databaseUrl, getPool } from "./postgres";
import { runMigrations } from "./migrate";

async function main() {
  if (!databaseUrl()) {
    console.error("[migrate] DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("[migrate] PostgreSQL pool is unavailable.");
    process.exit(1);
  }
  try {
    const result = await runMigrations({ pool });
    console.log(`[migrate] applied: ${result.applied.join(", ") || "(none)"}`);
    console.log(`[migrate] skipped: ${result.skipped.join(", ") || "(none)"}`);
  } catch (error) {
    console.error("[migrate] failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
