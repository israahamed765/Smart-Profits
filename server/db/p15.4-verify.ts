import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import { decideGuardCreatedAtIndex, planNodeName, planTotalCost } from "@/server/db/p15.3-index-eval";

export const EXPECTED_P15_4_COUNTS = {
  merchants: 205,
  workspaces: 3,
  track_events: 181,
  guard_decisions: 115,
} as const;

export const P15_4_PROBE_EMAIL = "p15.4-probe@smartprofit.verify";
export const P15_4_PROBE_EVENT_ID = "p15.4-probe-event";
export const P15_4_PROBE_GUARD_ID = "p15.4-probe-guard";
export const P15_4_EXPECTED_MIGRATION = "001_current_schema.sql";

export function p15_4MarkerPath() {
  return join(process.cwd(), "data", ".p15.4-final-hardening");
}

export type CatalogCounts = {
  merchants: number;
  workspaces: number;
  track_events: number;
  guard_decisions: number;
};

export const P15_4_SELECT_SQL = {
  counts: `SELECT
       (SELECT COUNT(*)::int FROM merchants) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions) AS guard_decisions`,
  workspaceOrphans: `SELECT COUNT(*)::int AS n
     FROM workspaces w
     WHERE NOT EXISTS (
       SELECT 1 FROM merchants m WHERE lower(m.email) = lower(w.email)
     )`,
  guardOrphans: `SELECT COUNT(*)::int AS n
     FROM guard_decisions g
     WHERE coalesce(g.email, '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )`,
  eventOrphans: `SELECT COUNT(*)::int AS n
     FROM track_events e
     WHERE coalesce(e.payload->>'email', '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(e.payload->>'email')
       )`,
  workspaceEmails: `SELECT lower(email) AS email FROM workspaces ORDER BY 1`,
  foreignKeys: `SELECT constraint_name
     FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'`,
  extraUnique: `SELECT constraint_name, table_name
     FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND constraint_type = 'UNIQUE'`,
  migrations: `SELECT id FROM schema_migrations ORDER BY id`,
  indexes: `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname`,
  explainGuardsAll: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions ORDER BY created_at DESC LIMIT 50`,
  explainGuardsByEmail: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions WHERE email = $1 ORDER BY created_at DESC LIMIT 50`,
  explainMerchantByEmail: `EXPLAIN (FORMAT JSON) SELECT payload FROM merchants WHERE email = $1`,
  sampleMerchant: `SELECT email FROM merchants ORDER BY email LIMIT 1`,
  probeHits: `SELECT
       (SELECT COUNT(*)::int FROM merchants WHERE lower(email) = $1) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces WHERE lower(email) = $1) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events WHERE id = $2 OR lower(payload->>'email') = $1) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions WHERE id = $3 OR lower(email) = $1) AS guard_decisions`,
} as const;

export const P15_4_PROBE_SQL = {
  insertMerchant: `INSERT INTO merchants (email, payload) VALUES ($1, $2::jsonb)`,
  insertWorkspace: `INSERT INTO workspaces (email, payload) VALUES ($1, $2::jsonb)`,
  insertEvent: `INSERT INTO track_events (id, at, payload) VALUES ($1, $2, $3::jsonb)`,
  insertGuard: `INSERT INTO guard_decisions (id, email, phone, action, decision, reason, summary, created_at)
     VALUES ($1, $2, $3, 'login', 'allow', 'p15.4-probe', 'rolled-back probe', NOW())`,
} as const;

export function allP15_4SelectSql(): string[] {
  return Object.values(P15_4_SELECT_SQL);
}

export function p15_4SelectSqlIsReadOnly() {
  return allP15_4SelectSql().every(auditSqlIsReadOnly);
}

export function p15_4ProbeNeverDeletes() {
  const blob = Object.values(P15_4_PROBE_SQL).join("\n");
  return (
    /INSERT INTO merchants/.test(blob) &&
    /INSERT INTO workspaces/.test(blob) &&
    /INSERT INTO track_events/.test(blob) &&
    /INSERT INTO guard_decisions/.test(blob) &&
    !/\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bUPDATE\b/i.test(blob)
  );
}

function asCounts(row: Record<string, unknown> | undefined): CatalogCounts {
  return {
    merchants: Number(row?.merchants ?? 0),
    workspaces: Number(row?.workspaces ?? 0),
    track_events: Number(row?.track_events ?? 0),
    guard_decisions: Number(row?.guard_decisions ?? 0),
  };
}

function countsEqual(got: CatalogCounts, expected: CatalogCounts) {
  return (
    got.merchants === expected.merchants &&
    got.workspaces === expected.workspaces &&
    got.track_events === expected.track_events &&
    got.guard_decisions === expected.guard_decisions
  );
}

function countsLabel(counts: CatalogCounts) {
  return `${counts.merchants}/${counts.workspaces}/${counts.track_events}/${counts.guard_decisions}`;
}

export type P15_4Evidence = {
  counts: CatalogCounts;
  workspaceOrphans: number;
  guardOrphans: number;
  eventOrphans: number;
  workspaceEmails: string[];
  foreignKeyCount: number;
  extraUnique: Array<{ table: string; name: string }>;
  appliedMigrations: string[];
  indexNames: string[];
  unfilteredNode: string;
  unfilteredCost: number;
  byEmailNode: string;
  merchantByEmailNode: string;
  createIndexNow: boolean;
  probePresentBefore: boolean;
  probeWriteVisible: boolean;
  probeRolledBack: boolean;
  countsAfterProbe: CatalogCounts;
  probeHitsAfter: CatalogCounts;
};

export type P15_4Report = {
  evaluatedAt: string;
  go: "GO" | "NO-GO";
  reasons: string[];
  postgresMutated: false;
  rowsDeleted: 0;
  foreignKeysAdded: 0;
  uniqueConstraintsAdded: 0;
  migration002: false;
  finalAuditStarted: false;
  p16_started: false;
  evidence: P15_4Evidence;
};

export function classifyP15_4(input: P15_4Evidence): { go: "GO" | "NO-GO"; reasons: string[] } {
  const reasons: string[] = [];
  if (!countsEqual(input.counts, EXPECTED_P15_4_COUNTS)) {
    reasons.push(`Catalog counts are ${countsLabel(input.counts)}, expected ${countsLabel(EXPECTED_P15_4_COUNTS)}.`);
  }
  if (input.workspaceOrphans !== 0) reasons.push(`Workspace orphans: ${input.workspaceOrphans}.`);
  if (input.guardOrphans !== 0) reasons.push(`Guard orphans: ${input.guardOrphans}.`);
  if (input.eventOrphans !== 0) reasons.push(`Event orphans: ${input.eventOrphans}.`);
  if (input.foreignKeyCount !== 0) reasons.push(`Foreign keys present: ${input.foreignKeyCount}.`);
  if (input.extraUnique.length) {
    reasons.push(`Unexpected UNIQUE constraints: ${input.extraUnique.map((row) => `${row.table}.${row.name}`).join(", ")}.`);
  }
  if (input.appliedMigrations.join(",") !== P15_4_EXPECTED_MIGRATION) {
    reasons.push(`schema_migrations is [${input.appliedMigrations.join(", ")}], expected only ${P15_4_EXPECTED_MIGRATION}.`);
  }
  if (input.createIndexNow) reasons.push("Index eval wants a created_at DESC index. P15.4 must not add 002.");
  if (input.probePresentBefore) reasons.push(`Probe identity ${P15_4_PROBE_EMAIL} already exists. Refusing to write.`);
  if (!input.probePresentBefore && !input.probeWriteVisible) reasons.push("Probe INSERT was not visible inside the transaction.");
  if (!input.probePresentBefore && !input.probeRolledBack) reasons.push("Probe transaction did not roll back.");
  if (!countsEqual(input.countsAfterProbe, EXPECTED_P15_4_COUNTS)) {
    reasons.push(`Counts after probe rollback are ${countsLabel(input.countsAfterProbe)}, expected ${countsLabel(EXPECTED_P15_4_COUNTS)}.`);
  }
  const leftover =
    input.probeHitsAfter.merchants +
    input.probeHitsAfter.workspaces +
    input.probeHitsAfter.track_events +
    input.probeHitsAfter.guard_decisions;
  if (leftover !== 0) reasons.push("Probe rows remain after ROLLBACK.");
  return { go: reasons.length ? "NO-GO" : "GO", reasons };
}

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function n(row: Record<string, unknown> | undefined) {
  return Number(row?.n ?? 0);
}

export async function runP15_4Verify(client: QueryClient): Promise<P15_4Report> {
  const counts = asCounts((await client.query(P15_4_SELECT_SQL.counts)).rows[0]);
  const workspaceOrphans = n((await client.query(P15_4_SELECT_SQL.workspaceOrphans)).rows[0]);
  const guardOrphans = n((await client.query(P15_4_SELECT_SQL.guardOrphans)).rows[0]);
  const eventOrphans = n((await client.query(P15_4_SELECT_SQL.eventOrphans)).rows[0]);
  const workspaceEmails = (await client.query(P15_4_SELECT_SQL.workspaceEmails)).rows.map((row) =>
    String(row.email || "").toLowerCase(),
  );
  const foreignKeyCount = (await client.query(P15_4_SELECT_SQL.foreignKeys)).rows.length;
  const extraUnique = (await client.query(P15_4_SELECT_SQL.extraUnique)).rows.map((row) => ({
    table: String(row.table_name || ""),
    name: String(row.constraint_name || ""),
  }));
  const appliedMigrations = (await client.query(P15_4_SELECT_SQL.migrations)).rows.map((row) => String(row.id || ""));
  const indexRows = (await client.query(P15_4_SELECT_SQL.indexes)).rows;
  const indexNames = indexRows.map((row) => String(row.indexname || ""));
  const indexDefs = indexRows.map((row) => String(row.indexdef || ""));
  const sampleEmail = String((await client.query(P15_4_SELECT_SQL.sampleMerchant)).rows[0]?.email || P15_4_PROBE_EMAIL);
  const unfilteredRaw = (await client.query(P15_4_SELECT_SQL.explainGuardsAll)).rows[0]?.["QUERY PLAN"];
  const byEmailRaw = (await client.query(P15_4_SELECT_SQL.explainGuardsByEmail, [sampleEmail])).rows[0]?.["QUERY PLAN"];
  const merchantRaw = (await client.query(P15_4_SELECT_SQL.explainMerchantByEmail, [sampleEmail])).rows[0]?.["QUERY PLAN"];
  const unfilteredNode = planNodeName(unfilteredRaw);
  const byEmailNode = planNodeName(byEmailRaw);
  const merchantByEmailNode = planNodeName(merchantRaw);
  const unfilteredCost = planTotalCost(unfilteredRaw);
  const indexDecision = decideGuardCreatedAtIndex({
    unfilteredNode,
    unfilteredCost,
    byEmailNode,
    rowCount: counts.guard_decisions,
    indexDefs,
  });
  const probeBefore = asCounts(
    (
      await client.query(P15_4_SELECT_SQL.probeHits, [
        P15_4_PROBE_EMAIL,
        P15_4_PROBE_EVENT_ID,
        P15_4_PROBE_GUARD_ID,
      ])
    ).rows[0],
  );
  const probePresentBefore =
    probeBefore.merchants + probeBefore.workspaces + probeBefore.track_events + probeBefore.guard_decisions > 0;

  let probeWriteVisible = false;
  let probeRolledBack = false;
  if (!probePresentBefore) {
    await client.query("BEGIN");
    try {
      await client.query(P15_4_PROBE_SQL.insertMerchant, [
        P15_4_PROBE_EMAIL,
        JSON.stringify({ email: P15_4_PROBE_EMAIL, storeName: "p15.4-probe", phone: "+970599000000" }),
      ]);
      await client.query(P15_4_PROBE_SQL.insertWorkspace, [
        P15_4_PROBE_EMAIL,
        JSON.stringify({ ownerEmail: P15_4_PROBE_EMAIL, files: [], savedAt: new Date().toISOString() }),
      ]);
      await client.query(P15_4_PROBE_SQL.insertEvent, [
        P15_4_PROBE_EVENT_ID,
        Date.now(),
        JSON.stringify({ type: "p15.4-probe", at: Date.now(), email: P15_4_PROBE_EMAIL }),
      ]);
      await client.query(P15_4_PROBE_SQL.insertGuard, [P15_4_PROBE_GUARD_ID, P15_4_PROBE_EMAIL, "+970599000000"]);
      const mid = asCounts((await client.query(P15_4_SELECT_SQL.counts)).rows[0]);
      const probeMid = asCounts(
        (
          await client.query(P15_4_SELECT_SQL.probeHits, [
            P15_4_PROBE_EMAIL,
            P15_4_PROBE_EVENT_ID,
            P15_4_PROBE_GUARD_ID,
          ])
        ).rows[0],
      );
      probeWriteVisible =
        mid.merchants === counts.merchants + 1 &&
        mid.workspaces === counts.workspaces + 1 &&
        mid.track_events === counts.track_events + 1 &&
        mid.guard_decisions === counts.guard_decisions + 1 &&
        probeMid.merchants === 1 &&
        probeMid.workspaces === 1 &&
        probeMid.track_events >= 1 &&
        probeMid.guard_decisions === 1;
      await client.query("ROLLBACK");
      probeRolledBack = true;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
        probeRolledBack = true;
      } catch {
        // keep the original error
      }
      throw error;
    }
  }

  const countsAfterProbe = asCounts((await client.query(P15_4_SELECT_SQL.counts)).rows[0]);
  const probeHitsAfter = asCounts(
    (
      await client.query(P15_4_SELECT_SQL.probeHits, [
        P15_4_PROBE_EMAIL,
        P15_4_PROBE_EVENT_ID,
        P15_4_PROBE_GUARD_ID,
      ])
    ).rows[0],
  );

  const evidence: P15_4Evidence = {
    counts,
    workspaceOrphans,
    guardOrphans,
    eventOrphans,
    workspaceEmails,
    foreignKeyCount,
    extraUnique,
    appliedMigrations,
    indexNames,
    unfilteredNode,
    unfilteredCost,
    byEmailNode,
    merchantByEmailNode,
    createIndexNow: indexDecision.createIndexNow,
    probePresentBefore,
    probeWriteVisible,
    probeRolledBack,
    countsAfterProbe,
    probeHitsAfter,
  };
  const classified = classifyP15_4(evidence);
  return {
    evaluatedAt: new Date().toISOString(),
    go: classified.go,
    reasons: classified.go === "GO" ? ["Post-delete counts, orphans, schema, probe rollback, and plans all match."] : classified.reasons,
    postgresMutated: false,
    rowsDeleted: 0,
    foreignKeysAdded: 0,
    uniqueConstraintsAdded: 0,
    migration002: false,
    finalAuditStarted: false,
    p16_started: false,
    evidence,
  };
}
