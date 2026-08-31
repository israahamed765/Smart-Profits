import { databaseUrl, getPool } from "@/server/db/postgres";
import {
  P15_3_EXPLAIN_SQL,
  decideGuardCreatedAtIndex,
  p153ExplainSqlIsReadOnly,
  planNodeName,
  planTotalCost,
} from "@/server/db/p15.3-index-eval";

async function main() {
  if (!p153ExplainSqlIsReadOnly()) {
    console.error("[p15.3] refuse: index-eval SQL is not read-only.");
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
    const counts = (await pool.query(P15_3_EXPLAIN_SQL.counts)).rows as Array<{ name: string; n: number }>;
    const unfilteredRaw = (await pool.query(P15_3_EXPLAIN_SQL.explainGuardsAll)).rows[0]?.["QUERY PLAN"];
    const byEmailRaw = (
      await pool.query(P15_3_EXPLAIN_SQL.explainGuardsByEmail, ["p15.3-eval@store.test"])
    ).rows[0]?.["QUERY PLAN"];
    const indexRows = (await pool.query(P15_3_EXPLAIN_SQL.indexes)).rows as Array<{
      indexname: string;
      indexdef: string;
    }>;
    const guardCount = Number(counts.find((row) => row.name === "guard_decisions")?.n ?? 0);
    const decision = decideGuardCreatedAtIndex({
      unfilteredNode: planNodeName(unfilteredRaw),
      unfilteredCost: planTotalCost(unfilteredRaw),
      byEmailNode: planNodeName(byEmailRaw),
      rowCount: guardCount,
      indexDefs: indexRows.map((row) => row.indexdef),
    });
    const report = {
      evaluatedAt: new Date().toISOString(),
      postgresMutated: false,
      counts: Object.fromEntries(counts.map((row) => [row.name, row.n])),
      indexes: indexRows,
      decision,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = decision.createIndexNow ? 0 : 0;
  } catch (error) {
    console.error("[p15.3] index-eval failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
