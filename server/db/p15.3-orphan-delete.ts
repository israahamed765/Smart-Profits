import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import { GUARD_HARNESS_EMAIL, type ClassifiedGuardOrphan } from "@/server/db/orphan-classify";
import { normalizeEmail } from "@/shared/identity";

export const EXPECTED_ORPHAN_ROW_COUNT = 52;
export const EXPECTED_ORPHAN_EMAIL_COUNT = 33;
export const EXPECTED_MERCHANT_BACKED_P125_EMAILS = 60;
export const EXPECTED_MERCHANT_BACKED_P125_ROWS = 103;

/** Frozen P15.2 orphan classification. Live SELECT must match this set exactly. */
export const P15_2_GUARD_ORPHAN_ROWS: ReadonlyArray<{ email: string; n: number }> = [
  { email: "p125-1787652982835-32@test.com", n: 2 },
  { email: "p125-1787655080712-2@test.com", n: 2 },
  { email: "p125-1787655082324-32@test.com", n: 2 },
  { email: "p125-1787656721697-32@test.com", n: 2 },
  { email: "p125-1787658033571-2@test.com", n: 2 },
  { email: "p125-1787658035963-32@test.com", n: 2 },
  { email: "p125-1787747442052-2@test.com", n: 2 },
  { email: "p125-1787747444398-32@test.com", n: 2 },
  { email: "p125-1787747645262-32@test.com", n: 2 },
  { email: "p125-1787751100286-2@test.com", n: 2 },
  { email: "p125-1787751102501-32@test.com", n: 2 },
  { email: "p125-1787753701172-2@test.com", n: 2 },
  { email: "p125-1787753705765-32@test.com", n: 2 },
  { email: "p125-1787754421975-2@test.com", n: 2 },
  { email: "p125-1787755211736-2@test.com", n: 2 },
  { email: "p125-1787755297191-2@test.com", n: 2 },
  { email: "p125-1787756382841-2@test.com", n: 2 },
  { email: "p125-1787758182676-2@test.com", n: 2 },
  { email: "p125-1787758665126-2@test.com", n: 2 },
  { email: "p125-1787652982389-20@test.com", n: 1 },
  { email: "p125-1787655081734-20@test.com", n: 1 },
  { email: "p125-1787656719495-20@test.com", n: 1 },
  { email: "p125-1787658035002-20@test.com", n: 1 },
  { email: "p125-1787747443697-20@test.com", n: 1 },
  { email: "p125-1787747644095-20@test.com", n: 1 },
  { email: "p125-1787751101717-20@test.com", n: 1 },
  { email: "p125-1787753704394-20@test.com", n: 1 },
  { email: "p125-1787754423483-20@test.com", n: 1 },
  { email: "p125-1787755212783-20@test.com", n: 1 },
  { email: "p125-1787755298008-20@test.com", n: 1 },
  { email: "p125-1787756385137-20@test.com", n: 1 },
  { email: "p125-1787758184342-20@test.com", n: 1 },
  { email: "p125-1787758666720-20@test.com", n: 1 },
];

export function orphanDeleteMarkerPath() {
  return join(process.cwd(), "data", ".p15.3-orphan-delete");
}

export type CatalogCounts = {
  merchants: number;
  workspaces: number;
  track_events: number;
  guard_decisions: number;
};

export type TargetGuardRow = { id: string; email: string };

export const ORPHAN_DELETE_SELECT_SQL = {
  counts: `SELECT
       (SELECT COUNT(*)::int FROM merchants) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions) AS guard_decisions`,
  targetRows: `SELECT g.id, lower(g.email) AS email
     FROM guard_decisions g
     WHERE g.email ~* '^p125-.+@test\\.com$'
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )
     ORDER BY g.email, g.id
     FOR UPDATE`,
  remainingOrphanCount: `SELECT COUNT(*)::int AS n
     FROM guard_decisions g
     WHERE g.email ~* '^p125-.+@test\\.com$'
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )`,
  merchantBackedP125: `SELECT COUNT(DISTINCT lower(g.email))::int AS emails,
            COUNT(*)::int AS rows
     FROM guard_decisions g
     WHERE g.email ~* '^p125-.+@test\\.com$'
       AND EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )`,
  merchantsForEmails: `SELECT lower(email) AS email FROM merchants WHERE lower(email) = ANY($1::text[])`,
  eventsForEmails: `SELECT lower(payload->>'email') AS email, COUNT(*)::int AS n
     FROM track_events
     WHERE coalesce(payload->>'email', '') <> ''
       AND lower(payload->>'email') = ANY($1::text[])
     GROUP BY 1`,
} as const;

export const ORPHAN_DELETE_MUTATION_SQL = `DELETE FROM guard_decisions
     WHERE id = ANY($1::text[])
       AND email ~* '^p125-.+@test\\.com$'
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(guard_decisions.email)
       )
     RETURNING id, lower(email) AS email`;

export function allOrphanDeleteSelectSql(): string[] {
  return Object.values(ORPHAN_DELETE_SELECT_SQL);
}

export function orphanDeleteSelectSqlIsReadOnly() {
  return allOrphanDeleteSelectSql().every((sql) => auditSqlIsReadOnly(sql.replace(/\bFOR UPDATE\b/gi, " ")));
}

export function orphanDeleteMutationIsScoped() {
  const sql = ORPHAN_DELETE_MUTATION_SQL.replace(/\s+/g, " ").trim();
  const table = sql.match(/^DELETE FROM ([a-z_]+)/i)?.[1];
  return (
    table === "guard_decisions" &&
    /id = ANY\(\$1::text\[\]\)/.test(sql) &&
    /NOT EXISTS/.test(sql) &&
    !/\bINSERT\b|\bDROP\b|\bALTER\b|\bCREATE\b/i.test(sql)
  );
}

export function frozenOrphanEmailSet() {
  return new Set(P15_2_GUARD_ORPHAN_ROWS.map((row) => row.email));
}

export function frozenOrphanCountMap() {
  return new Map(P15_2_GUARD_ORPHAN_ROWS.map((row) => [row.email, row.n]));
}

export function classifiedMatchesFrozen(classified: Array<{ email: string; n: number; class?: string }>): string | null {
  if (classified.length !== EXPECTED_ORPHAN_EMAIL_COUNT) {
    return `Classified email count is ${classified.length}, expected ${EXPECTED_ORPHAN_EMAIL_COUNT}.`;
  }
  const frozen = frozenOrphanCountMap();
  const seen = new Set<string>();
  let rows = 0;
  for (const row of classified) {
    const email = normalizeEmail(row.email);
    if (row.class && row.class !== "p125-guard-harness") {
      return `Classified email ${email} is ${row.class}, not p125-guard-harness.`;
    }
    const expected = frozen.get(email);
    if (expected == null) {
      return `Classified email ${email} is not in the frozen P15.2 orphan set.`;
    }
    if (Number(row.n) !== expected) {
      return `Classified ${email} has n=${row.n}, frozen n=${expected}.`;
    }
    if (seen.has(email)) return `Duplicate classified email ${email}.`;
    seen.add(email);
    rows += Number(row.n);
  }
  if (seen.size !== frozen.size) {
    return `Classified set size ${seen.size} does not match frozen ${frozen.size}.`;
  }
  if (rows !== EXPECTED_ORPHAN_ROW_COUNT) {
    return `Classified row sum is ${rows}, expected ${EXPECTED_ORPHAN_ROW_COUNT}.`;
  }
  return null;
}

export type OrphanDeletePlan =
  | { go: true; ids: string[]; emails: string[]; byEmail: Array<{ email: string; n: number; ids: string[] }> }
  | { go: false; reason: string };

export function planOrphanGuardDelete(input: {
  classified: Array<{ email: string; n: number; class?: string }>;
  targets: TargetGuardRow[];
  merchantHits: string[];
  eventHits: Array<{ email: string; n: number }>;
  merchantBacked: { emails: number; rows: number };
}): OrphanDeletePlan {
  const classifiedError = classifiedMatchesFrozen(input.classified);
  if (classifiedError) return { go: false, reason: classifiedError };
  if (input.targets.length !== EXPECTED_ORPHAN_ROW_COUNT) {
    return {
      go: false,
      reason: `Target SELECT returned ${input.targets.length} rows, expected ${EXPECTED_ORPHAN_ROW_COUNT}.`,
    };
  }
  if (input.merchantHits.length > 0) {
    return {
      go: false,
      reason: `Target emails still match merchants: ${input.merchantHits.join(", ")}.`,
    };
  }
  if (input.eventHits.length > 0) {
    return {
      go: false,
      reason: `Target emails have track_events: ${input.eventHits.map((row) => `${row.email}:${row.n}`).join(", ")}.`,
    };
  }
  if (
    input.merchantBacked.emails !== EXPECTED_MERCHANT_BACKED_P125_EMAILS ||
    input.merchantBacked.rows !== EXPECTED_MERCHANT_BACKED_P125_ROWS
  ) {
    return {
      go: false,
      reason: `Merchant-backed p125 is ${input.merchantBacked.emails} emails / ${input.merchantBacked.rows} rows, expected ${EXPECTED_MERCHANT_BACKED_P125_EMAILS} / ${EXPECTED_MERCHANT_BACKED_P125_ROWS}.`,
    };
  }

  const frozen = frozenOrphanCountMap();
  const byEmail = new Map<string, string[]>();
  const ids: string[] = [];
  const idSet = new Set<string>();
  for (const row of input.targets) {
    const id = String(row.id || "").trim();
    const email = normalizeEmail(row.email);
    if (!id) return { go: false, reason: "A target guard row is missing id." };
    if (idSet.has(id)) return { go: false, reason: `Duplicate target id ${id}.` };
    if (!GUARD_HARNESS_EMAIL.test(email)) {
      return { go: false, reason: `Target email ${email} is not a p125-*@test.com harness address.` };
    }
    if (!frozen.has(email)) {
      return { go: false, reason: `Target id ${id} email ${email} is outside the P15.2 orphan set.` };
    }
    idSet.add(id);
    ids.push(id);
    const list = byEmail.get(email) ?? [];
    list.push(id);
    byEmail.set(email, list);
  }
  if (byEmail.size !== EXPECTED_ORPHAN_EMAIL_COUNT) {
    return {
      go: false,
      reason: `Target emails are ${byEmail.size}, expected ${EXPECTED_ORPHAN_EMAIL_COUNT}.`,
    };
  }
  for (const [email, expected] of frozen) {
    const got = byEmail.get(email)?.length ?? 0;
    if (got !== expected) {
      return { go: false, reason: `Live ${email} has ${got} rows, frozen P15.2 n=${expected}.` };
    }
  }
  const grouped = [...byEmail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([email, emailIds]) => ({ email, n: emailIds.length, ids: emailIds }));
  return { go: true, ids, emails: grouped.map((row) => row.email), byEmail: grouped };
}

function asCounts(row: Record<string, unknown> | undefined): CatalogCounts {
  return {
    merchants: Number(row?.merchants ?? 0),
    workspaces: Number(row?.workspaces ?? 0),
    track_events: Number(row?.track_events ?? 0),
    guard_decisions: Number(row?.guard_decisions ?? 0),
  };
}

function asTargets(rows: Array<Record<string, unknown>>): TargetGuardRow[] {
  return rows.map((row) => ({ id: String(row.id || ""), email: normalizeEmail(String(row.email || "")) }));
}

export type OrphanDeleteReport = {
  executedAt: string;
  go: "GO" | "NO-GO";
  postgresMutated: boolean;
  rowsDeleted: number;
  rolledBack: boolean;
  reason: string;
  foreignKeysAdded: 0;
  uniqueConstraintsAdded: 0;
  migration002: false;
  p15_4_started: false;
  workspacesDeleted: 0;
  merchantsDeleted: 0;
  trackEventsDeleted: 0;
  before: CatalogCounts;
  after: CatalogCounts | null;
  classifiedEmails: string[];
  targetIds: string[];
  deletedIds: string[];
  deletedByEmail: Array<{ email: string; n: number; ids: string[] }>;
  remainingOrphans: number | null;
  merchantBackedBefore: { emails: number; rows: number };
  merchantBackedAfter: { emails: number; rows: number } | null;
};

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;
};

function noGo(
  partial: Pick<OrphanDeleteReport, "before" | "classifiedEmails" | "targetIds" | "merchantBackedBefore"> & {
    reason: string;
    after?: CatalogCounts | null;
    remainingOrphans?: number | null;
    merchantBackedAfter?: { emails: number; rows: number } | null;
    deletedIds?: string[];
    deletedByEmail?: Array<{ email: string; n: number; ids: string[] }>;
  },
): OrphanDeleteReport {
  return {
    executedAt: new Date().toISOString(),
    go: "NO-GO",
    postgresMutated: false,
    rowsDeleted: 0,
    rolledBack: true,
    reason: partial.reason,
    foreignKeysAdded: 0,
    uniqueConstraintsAdded: 0,
    migration002: false,
    p15_4_started: false,
    workspacesDeleted: 0,
    merchantsDeleted: 0,
    trackEventsDeleted: 0,
    before: partial.before,
    after: partial.after ?? null,
    classifiedEmails: partial.classifiedEmails,
    targetIds: partial.targetIds,
    deletedIds: partial.deletedIds ?? [],
    deletedByEmail: partial.deletedByEmail ?? [],
    remainingOrphans: partial.remainingOrphans ?? null,
    merchantBackedBefore: partial.merchantBackedBefore,
    merchantBackedAfter: partial.merchantBackedAfter ?? null,
  };
}

export function loadClassifiedGuardOrphans(marker: {
  guardOrphans?: Array<{ email?: string; n?: number; class?: string }>;
}): ClassifiedGuardOrphan[] {
  return (marker.guardOrphans ?? []).map((row) => ({
    email: normalizeEmail(String(row.email || "")),
    n: Number(row.n ?? 0),
    class: (row.class as ClassifiedGuardOrphan["class"]) || "unknown",
    disposition: "keep-until-explicit-delete-go",
    origin: "P15.2 orphan classification marker",
  }));
}

export async function executeOrphanGuardDelete(
  client: QueryClient,
  classified: Array<{ email: string; n: number; class?: string }>,
): Promise<OrphanDeleteReport> {
  const classifiedEmails = classified.map((row) => normalizeEmail(row.email)).sort();
  await client.query("BEGIN");
  try {
    const before = asCounts((await client.query(ORPHAN_DELETE_SELECT_SQL.counts)).rows[0]);
    const targets = asTargets((await client.query(ORPHAN_DELETE_SELECT_SQL.targetRows)).rows);
    const merchantBackedRow = (await client.query(ORPHAN_DELETE_SELECT_SQL.merchantBackedP125)).rows[0] ?? {};
    const merchantBackedBefore = {
      emails: Number(merchantBackedRow.emails ?? 0),
      rows: Number(merchantBackedRow.rows ?? 0),
    };
    const emails = [...new Set(targets.map((row) => row.email))];
    const merchantHits = emails.length
      ? (await client.query(ORPHAN_DELETE_SELECT_SQL.merchantsForEmails, [emails])).rows.map((row) =>
          normalizeEmail(String(row.email || "")),
        )
      : [];
    const eventHits = emails.length
      ? (await client.query(ORPHAN_DELETE_SELECT_SQL.eventsForEmails, [emails])).rows.map((row) => ({
          email: normalizeEmail(String(row.email || "")),
          n: Number(row.n ?? 0),
        }))
      : [];

    const plan = planOrphanGuardDelete({
      classified,
      targets,
      merchantHits,
      eventHits,
      merchantBacked: merchantBackedBefore,
    });
    const base = {
      before,
      classifiedEmails,
      targetIds: targets.map((row) => row.id),
      merchantBackedBefore,
    };
    if (!plan.go) {
      await client.query("ROLLBACK");
      return noGo({ ...base, reason: plan.reason });
    }

    const deleted = asTargets((await client.query(ORPHAN_DELETE_MUTATION_SQL, [plan.ids])).rows);
    if (deleted.length !== EXPECTED_ORPHAN_ROW_COUNT) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        reason: `DELETE RETURNING ${deleted.length} rows, expected ${EXPECTED_ORPHAN_ROW_COUNT}.`,
        deletedIds: deleted.map((row) => row.id),
      });
    }
    const deletedIdSet = new Set(deleted.map((row) => row.id));
    if (plan.ids.some((id) => !deletedIdSet.has(id))) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        reason: "DELETE RETURNING ids do not match the planned target ids.",
        deletedIds: deleted.map((row) => row.id),
      });
    }

    const after = asCounts((await client.query(ORPHAN_DELETE_SELECT_SQL.counts)).rows[0]);
    const remaining = Number((await client.query(ORPHAN_DELETE_SELECT_SQL.remainingOrphanCount)).rows[0]?.n ?? 0);
    const merchantBackedAfterRow = (await client.query(ORPHAN_DELETE_SELECT_SQL.merchantBackedP125)).rows[0] ?? {};
    const merchantBackedAfter = {
      emails: Number(merchantBackedAfterRow.emails ?? 0),
      rows: Number(merchantBackedAfterRow.rows ?? 0),
    };

    if (after.merchants !== before.merchants) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `merchants changed ${before.merchants} → ${after.merchants}.`,
      });
    }
    if (after.workspaces !== before.workspaces) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `workspaces changed ${before.workspaces} → ${after.workspaces}.`,
      });
    }
    if (after.track_events !== before.track_events) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `track_events changed ${before.track_events} → ${after.track_events}.`,
      });
    }
    if (after.guard_decisions !== before.guard_decisions - EXPECTED_ORPHAN_ROW_COUNT) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `guard_decisions after delete is ${after.guard_decisions}, expected ${before.guard_decisions - EXPECTED_ORPHAN_ROW_COUNT}.`,
      });
    }
    if (remaining !== 0) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `${remaining} p125 orphan guard_decisions remain after DELETE.`,
      });
    }
    if (
      merchantBackedAfter.emails !== EXPECTED_MERCHANT_BACKED_P125_EMAILS ||
      merchantBackedAfter.rows !== EXPECTED_MERCHANT_BACKED_P125_ROWS
    ) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingOrphans: remaining,
        merchantBackedAfter,
        deletedIds: deleted.map((row) => row.id),
        reason: `Merchant-backed p125 after delete is ${merchantBackedAfter.emails} emails / ${merchantBackedAfter.rows} rows; the 60/103 live-account rows must stay.`,
      });
    }

    await client.query("COMMIT");
    return {
      executedAt: new Date().toISOString(),
      go: "GO",
      postgresMutated: true,
      rowsDeleted: EXPECTED_ORPHAN_ROW_COUNT,
      rolledBack: false,
      reason: `Deleted ${EXPECTED_ORPHAN_ROW_COUNT} P15.2 orphan guard_decisions across ${EXPECTED_ORPHAN_EMAIL_COUNT} emails. Merchant-backed p125 rows unchanged.`,
      foreignKeysAdded: 0,
      uniqueConstraintsAdded: 0,
      migration002: false,
      p15_4_started: false,
      workspacesDeleted: 0,
      merchantsDeleted: 0,
      trackEventsDeleted: 0,
      before,
      after,
      classifiedEmails,
      targetIds: plan.ids,
      deletedIds: deleted.map((row) => row.id),
      deletedByEmail: plan.byEmail,
      remainingOrphans: 0,
      merchantBackedBefore,
      merchantBackedAfter,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // keep the original error
    }
    throw error;
  }
}
