import { databaseUrl, getPool } from "@/server/db/postgres";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";

const SQL = {
  workspaceOrphanEmails: `SELECT w.email
     FROM workspaces w
     WHERE NOT EXISTS (
       SELECT 1 FROM merchants m WHERE lower(m.email) = lower(w.email)
     )
     ORDER BY 1`,
  guardOrphanEmails: `SELECT g.email, COUNT(*)::int AS n
     FROM guard_decisions g
     WHERE coalesce(g.email, '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )
     GROUP BY g.email
     ORDER BY n DESC, g.email`,
} as const;

async function main() {
  for (const sql of Object.values(SQL)) {
    if (!auditSqlIsReadOnly(sql)) {
      console.error("refuse: non-read-only SQL");
      process.exit(1);
    }
  }
  if (!databaseUrl()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = getPool();
  if (!pool) {
    console.error("pool unavailable");
    process.exit(1);
  }
  try {
    const out: Record<string, unknown> = {};
    for (const [name, sql] of Object.entries(SQL)) {
      const result = await pool.query(sql);
      out[name] = result.rows;
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

void main();
