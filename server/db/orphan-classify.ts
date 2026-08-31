import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import { normalizeEmail } from "@/shared/identity";

export const P12_2_WORKSPACE_ORPHANS = ["p12.2-alice@test.com", "p12.2-bob@test.com"] as const;

export const GUARD_HARNESS_EMAIL = /^p125-.+@test\.com$/i;

export type OrphanClass = "p12.2-workspace-fixture" | "p125-guard-harness" | "unknown";

export type OrphanDisposition = "keep-until-explicit-delete-go";

export const ORPHAN_DISPOSITION: OrphanDisposition = "keep-until-explicit-delete-go";

export function orphanMarkerPath() {
  return join(process.cwd(), "data", ".p15.2-orphan-classification");
}

export function classifyWorkspaceOrphan(email: string): OrphanClass {
  const key = normalizeEmail(email);
  return (P12_2_WORKSPACE_ORPHANS as readonly string[]).includes(key) ? "p12.2-workspace-fixture" : "unknown";
}

export function classifyGuardOrphan(email: string): OrphanClass {
  return GUARD_HARNESS_EMAIL.test(normalizeEmail(email)) ? "p125-guard-harness" : "unknown";
}

export const ORPHAN_SQL = {
  workspaceOrphans: `SELECT w.email, w.updated_at
     FROM workspaces w
     WHERE NOT EXISTS (
       SELECT 1 FROM merchants m WHERE lower(m.email) = lower(w.email)
     )
     ORDER BY 1`,
  guardOrphans: `SELECT g.email, COUNT(*)::int AS n,
            MIN(g.created_at) AS first_at,
            MAX(g.created_at) AS last_at,
            array_agg(DISTINCT g.decision) AS decisions
     FROM guard_decisions g
     WHERE coalesce(g.email, '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )
     GROUP BY g.email
     ORDER BY n DESC, g.email`,
  explainGuardsAll: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions ORDER BY created_at DESC LIMIT 50`,
  explainGuardsByEmail: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions WHERE email = 'p15.2-eval@store.test' ORDER BY created_at DESC LIMIT 50`,
  guardCount: `SELECT COUNT(*)::int AS n FROM guard_decisions`,
} as const;

export function allOrphanSql(): string[] {
  return Object.values(ORPHAN_SQL);
}

export function orphanSqlIsReadOnly() {
  return allOrphanSql().every(auditSqlIsReadOnly);
}

export type GuardIndexEval = {
  unfilteredNode: string;
  byEmailNode: string;
  createIndexNow: false;
  reason: string;
};

export function evaluateGuardCreatedAtIndex(input: { unfilteredNode: string; byEmailNode: string; rowCount: number }): GuardIndexEval {
  const seq = /Seq Scan/i.test(input.unfilteredNode);
  return {
    unfilteredNode: input.unfilteredNode,
    byEmailNode: input.byEmailNode,
    createIndexNow: false,
    reason: seq
      ? `Unfiltered listing is ${input.unfilteredNode} at ${input.rowCount} rows. guard_decisions_email_created_idx already covers the merchant path (${input.byEmailNode}). A created_at DESC index would help admin listing at larger scale. P15.2 does not add a migration.`
      : `Planner already avoids Seq Scan (${input.unfilteredNode}). No new index in P15.2.`,
  };
}

export type ClassifiedWorkspaceOrphan = {
  email: string;
  class: OrphanClass;
  disposition: OrphanDisposition;
  origin: string;
};

export type ClassifiedGuardOrphan = {
  email: string;
  n: number;
  class: OrphanClass;
  disposition: OrphanDisposition;
  origin: string;
};

export function classifyWorkspaceRows(rows: Array<{ email: string }>): ClassifiedWorkspaceOrphan[] {
  return rows.map((row) => {
    const cls = classifyWorkspaceOrphan(row.email);
    return {
      email: normalizeEmail(row.email),
      class: cls,
      disposition: ORPHAN_DISPOSITION,
      origin:
        cls === "p12.2-workspace-fixture"
          ? "P12.2 API-contract test leftover. Workspace row exists; no merchants.email match."
          : "Unclassified workspace orphan. Do not delete in P15.2.",
    };
  });
}

export function classifyGuardRows(rows: Array<{ email: string; n: number }>): ClassifiedGuardOrphan[] {
  return rows.map((row) => {
    const cls = classifyGuardOrphan(row.email);
    return {
      email: normalizeEmail(row.email),
      n: Number(row.n),
      class: cls,
      disposition: ORPHAN_DISPOSITION,
      origin:
        cls === "p125-guard-harness"
          ? "Guard/NAC harness emails (p125-<epoch>-<variant>@test.com). No merchants.email match."
          : "Unclassified guard orphan. Do not delete in P15.2.",
    };
  });
}

function planNode(rows: Array<Record<string, unknown>>) {
  const raw = rows[0]?.["QUERY PLAN"];
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  if (/\bSeq Scan\b/i.test(text)) return "Seq Scan";
  if (/Index Scan/i.test(text)) return "Index Scan";
  if (/\bLimit\b/i.test(text)) return "Limit";
  return "unknown";
}

export type OrphanClassifyReport = {
  classifiedAt: string;
  postgresMutated: false;
  rowsDeleted: 0;
  workspaceOrphans: ClassifiedWorkspaceOrphan[];
  guardOrphans: ClassifiedGuardOrphan[];
  unknownCount: number;
  guardIndex: GuardIndexEval;
};

export async function classifyLiveOrphans(client: {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<OrphanClassifyReport> {
  if (!orphanSqlIsReadOnly()) {
    throw new Error("P15.2 refuse: orphan SQL is not read-only.");
  }
  const workspaceRows = (await client.query(ORPHAN_SQL.workspaceOrphans)).rows as Array<{ email: string }>;
  const guardRows = (await client.query(ORPHAN_SQL.guardOrphans)).rows as Array<{ email: string; n: number }>;
  const workspaceOrphans = classifyWorkspaceRows(workspaceRows);
  const guardOrphans = classifyGuardRows(guardRows);
  const unfiltered = planNode((await client.query(ORPHAN_SQL.explainGuardsAll)).rows);
  const byEmail = planNode((await client.query(ORPHAN_SQL.explainGuardsByEmail)).rows);
  const guardCount = Number((await client.query(ORPHAN_SQL.guardCount)).rows[0]?.n ?? 0);
  const unknownCount =
    workspaceOrphans.filter((row) => row.class === "unknown").length +
    guardOrphans.filter((row) => row.class === "unknown").length;
  return {
    classifiedAt: new Date().toISOString(),
    postgresMutated: false,
    rowsDeleted: 0,
    workspaceOrphans,
    guardOrphans,
    unknownCount,
    guardIndex: evaluateGuardCreatedAtIndex({
      unfilteredNode: unfiltered,
      byEmailNode: byEmail,
      rowCount: guardCount,
    }),
  };
}
