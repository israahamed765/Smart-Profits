import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";

export const P15_3_EXPLAIN_SQL = {
  counts: `SELECT 'merchants' AS name, COUNT(*)::int AS n FROM merchants
     UNION ALL SELECT 'workspaces', COUNT(*)::int FROM workspaces
     UNION ALL SELECT 'track_events', COUNT(*)::int FROM track_events
     UNION ALL SELECT 'guard_decisions', COUNT(*)::int FROM guard_decisions`,
  explainGuardsAll: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions ORDER BY created_at DESC LIMIT 50`,
  explainGuardsByEmail: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions WHERE email = $1 ORDER BY created_at DESC LIMIT 50`,
  indexes: `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'guard_decisions'
     ORDER BY indexname`,
} as const;

export function p153ExplainSqlIsReadOnly() {
  return Object.values(P15_3_EXPLAIN_SQL).every(auditSqlIsReadOnly);
}

function asPlan(raw: unknown): Record<string, unknown> {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first && typeof first === "object" && "Plan" in first) {
    return (first as { Plan: Record<string, unknown> }).Plan;
  }
  return {};
}

export function planNodeName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  if (/\bSeq Scan\b/i.test(text)) return "Seq Scan";
  if (/Index Only Scan/i.test(text) || /Index Scan/i.test(text)) return "Index Scan";
  if (/\bLimit\b/i.test(text)) return "Limit";
  return "unknown";
}

export function planTotalCost(raw: unknown): number {
  const plan = asPlan(raw);
  const cost = Number(plan["Total Cost"]);
  return Number.isFinite(cost) ? cost : 0;
}

export type GuardIndexDecision = {
  unfilteredNode: string;
  unfilteredCost: number;
  byEmailNode: string;
  rowCount: number;
  hasCreatedAtOnlyIndex: boolean;
  createIndexNow: boolean;
  reason: string;
};

/**
 * Create the index only when EXPLAIN already shows the planner would benefit:
 * Seq Scan on unfiltered listing AND cardinality high enough that a sort is not cheap.
 * At ~167 rows PostgreSQL prefers Seq Scan; an unused index is not "proven useful".
 */
export function decideGuardCreatedAtIndex(input: {
  unfilteredNode: string;
  unfilteredCost: number;
  byEmailNode: string;
  rowCount: number;
  indexDefs: string[];
}): GuardIndexDecision {
  const hasCreatedAtOnlyIndex = input.indexDefs.some(
    (def) =>
      /guard_decisions/i.test(def) &&
      /created_at/i.test(def) &&
      !/\(email/i.test(def) &&
      !/\(decision/i.test(def),
  );
  const seq = /Seq Scan/i.test(input.unfilteredNode);
  const largeEnough = input.rowCount >= 10_000;
  const createIndexNow = seq && largeEnough && !hasCreatedAtOnlyIndex;
  const reason = hasCreatedAtOnlyIndex
    ? "created_at-only index already exists. P15.3 does not add another."
    : createIndexNow
      ? `Unfiltered listing is ${input.unfilteredNode} (cost ${input.unfilteredCost}) at ${input.rowCount} rows. Index is proven useful.`
      : `Unfiltered listing is ${input.unfilteredNode} (cost ${input.unfilteredCost}) at ${input.rowCount} rows. Merchant path is ${input.byEmailNode}. Planner prefers Seq Scan at this cardinality; an unused created_at DESC index is not proven useful. P15.3 does not add 002.`;
  return {
    unfilteredNode: input.unfilteredNode,
    unfilteredCost: input.unfilteredCost,
    byEmailNode: input.byEmailNode,
    rowCount: input.rowCount,
    hasCreatedAtOnlyIndex,
    createIndexNow,
    reason,
  };
}
