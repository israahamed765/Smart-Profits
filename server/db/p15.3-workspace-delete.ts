import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import { P12_2_WORKSPACE_ORPHANS } from "@/server/db/orphan-classify";
import { normalizeEmail } from "@/shared/identity";

export const EXPECTED_WORKSPACE_DELETE_COUNT = 2;
export const EXPECTED_COUNTS_BEFORE = {
  merchants: 205,
  workspaces: 5,
  track_events: 181,
  guard_decisions: 115,
} as const;
export const EXPECTED_COUNTS_AFTER = {
  merchants: 205,
  workspaces: 3,
  track_events: 181,
  guard_decisions: 115,
} as const;

export const P12_2_WORKSPACE_DELETE_EMAILS = [...P12_2_WORKSPACE_ORPHANS] as const;

export function workspaceDeleteMarkerPath() {
  return join(process.cwd(), "data", ".p15.3-workspace-delete");
}

export type CatalogCounts = {
  merchants: number;
  workspaces: number;
  track_events: number;
  guard_decisions: number;
};

export type TargetWorkspaceRow = {
  email: string;
  ownerEmail: string | null;
  files: number;
  updatedAt: string | null;
};

export const WORKSPACE_DELETE_SELECT_SQL = {
  counts: `SELECT
       (SELECT COUNT(*)::int FROM merchants) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions) AS guard_decisions`,
  targets: `SELECT w.email,
            w.payload->>'ownerEmail' AS owner_email,
            COALESCE(jsonb_array_length(w.payload->'files'), 0)::int AS files,
            w.updated_at
     FROM workspaces w
     WHERE lower(w.email) = ANY($1::text[])
     ORDER BY 1
     FOR UPDATE`,
  remainingTargets: `SELECT COUNT(*)::int AS n
     FROM workspaces
     WHERE lower(email) = ANY($1::text[])`,
  merchantsForEmails: `SELECT lower(email) AS email FROM merchants WHERE lower(email) = ANY($1::text[])`,
  eventsForEmails: `SELECT lower(payload->>'email') AS email, COUNT(*)::int AS n
     FROM track_events
     WHERE coalesce(payload->>'email', '') <> ''
       AND lower(payload->>'email') = ANY($1::text[])
     GROUP BY 1`,
  guardsForEmails: `SELECT lower(email) AS email, COUNT(*)::int AS n
     FROM guard_decisions
     WHERE coalesce(email, '') <> ''
       AND lower(email) = ANY($1::text[])
     GROUP BY 1`,
} as const;

export const WORKSPACE_DELETE_MUTATION_SQL = `DELETE FROM workspaces
     WHERE lower(email) = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(workspaces.email)
       )
     RETURNING lower(email) AS email, payload->>'ownerEmail' AS owner_email`;

export function allWorkspaceDeleteSelectSql(): string[] {
  return Object.values(WORKSPACE_DELETE_SELECT_SQL);
}

export function workspaceDeleteSelectSqlIsReadOnly() {
  return allWorkspaceDeleteSelectSql().every((sql) => auditSqlIsReadOnly(sql.replace(/\bFOR UPDATE\b/gi, " ")));
}

export function workspaceDeleteMutationIsScoped() {
  const sql = WORKSPACE_DELETE_MUTATION_SQL.replace(/\s+/g, " ").trim();
  const table = sql.match(/^DELETE FROM ([a-z_]+)/i)?.[1];
  return (
    table === "workspaces" &&
    /lower\(email\) = ANY\(\$1::text\[\]\)/.test(sql) &&
    /NOT EXISTS/.test(sql) &&
    !/\bINSERT\b|\bDROP\b|\bALTER\b|\bCREATE\b/i.test(sql)
  );
}

export type WorkspaceDeletePlan =
  | { go: true; emails: string[] }
  | { go: false; reason: string };

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
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
  return `merchants ${counts.merchants}, workspaces ${counts.workspaces}, track_events ${counts.track_events}, guard_decisions ${counts.guard_decisions}`;
}

export function planP12_2WorkspaceDelete(input: {
  targets: TargetWorkspaceRow[];
  merchantHits: string[];
  eventHits: Array<{ email: string; n: number }>;
  guardHits: Array<{ email: string; n: number }>;
  before: CatalogCounts;
}): WorkspaceDeletePlan {
  if (!countsEqual(input.before, EXPECTED_COUNTS_BEFORE)) {
    return {
      go: false,
      reason: `Before counts are ${countsLabel(input.before)}, expected ${countsLabel(EXPECTED_COUNTS_BEFORE)}.`,
    };
  }
  if (input.merchantHits.length > 0) {
    return { go: false, reason: `Target emails still match merchants: ${input.merchantHits.join(", ")}.` };
  }
  if (input.eventHits.length > 0) {
    return {
      go: false,
      reason: `Target emails have track_events: ${input.eventHits.map((row) => `${row.email}:${row.n}`).join(", ")}.`,
    };
  }
  if (input.guardHits.length > 0) {
    return {
      go: false,
      reason: `Target emails have guard_decisions: ${input.guardHits.map((row) => `${row.email}:${row.n}`).join(", ")}.`,
    };
  }
  const frozen = [...P12_2_WORKSPACE_DELETE_EMAILS];
  if (input.targets.length !== EXPECTED_WORKSPACE_DELETE_COUNT) {
    return {
      go: false,
      reason: `Target SELECT returned ${input.targets.length} workspace rows, expected ${EXPECTED_WORKSPACE_DELETE_COUNT}.`,
    };
  }
  const seen = new Set<string>();
  for (const row of input.targets) {
    const email = normalizeEmail(row.email);
    if (!frozen.includes(email as (typeof frozen)[number])) {
      return { go: false, reason: `Workspace email ${email} is outside the P12.2 set.` };
    }
    if (seen.has(email)) return { go: false, reason: `${email} has more than one workspace row.` };
    seen.add(email);
    const owner = row.ownerEmail == null ? "" : normalizeEmail(row.ownerEmail);
    if (!owner || owner !== email) {
      return { go: false, reason: `ownerEmail for ${email} is ${row.ownerEmail ?? "null"}, expected ${email}.` };
    }
  }
  for (const email of frozen) {
    if (!seen.has(email)) return { go: false, reason: `Missing workspace row for ${email}.` };
  }
  return { go: true, emails: frozen };
}

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;
};

export type WorkspaceDeleteReport = {
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
  merchantsDeleted: 0;
  trackEventsDeleted: 0;
  guardsDeleted: 0;
  before: CatalogCounts;
  after: CatalogCounts | null;
  emails: string[];
  deletedEmails: string[];
  remainingTargets: number | null;
  targets: TargetWorkspaceRow[];
};

function asCounts(row: Record<string, unknown> | undefined): CatalogCounts {
  return {
    merchants: Number(row?.merchants ?? 0),
    workspaces: Number(row?.workspaces ?? 0),
    track_events: Number(row?.track_events ?? 0),
    guard_decisions: Number(row?.guard_decisions ?? 0),
  };
}

function asTargets(rows: Array<Record<string, unknown>>): TargetWorkspaceRow[] {
  return rows.map((row) => ({
    email: normalizeEmail(String(row.email || "")),
    ownerEmail: row.owner_email == null || row.owner_email === "" ? null : normalizeEmail(String(row.owner_email)),
    files: Number(row.files ?? 0),
    updatedAt: iso(row.updated_at),
  }));
}

function noGo(
  partial: Pick<WorkspaceDeleteReport, "before" | "targets"> & {
    reason: string;
    after?: CatalogCounts | null;
    remainingTargets?: number | null;
    deletedEmails?: string[];
  },
): WorkspaceDeleteReport {
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
    merchantsDeleted: 0,
    trackEventsDeleted: 0,
    guardsDeleted: 0,
    before: partial.before,
    after: partial.after ?? null,
    emails: [...P12_2_WORKSPACE_DELETE_EMAILS],
    deletedEmails: partial.deletedEmails ?? [],
    remainingTargets: partial.remainingTargets ?? null,
    targets: partial.targets,
  };
}

export async function executeP12_2WorkspaceDelete(client: QueryClient): Promise<WorkspaceDeleteReport> {
  const emails = [...P12_2_WORKSPACE_DELETE_EMAILS];
  await client.query("BEGIN");
  try {
    const before = asCounts((await client.query(WORKSPACE_DELETE_SELECT_SQL.counts)).rows[0]);
    const targets = asTargets((await client.query(WORKSPACE_DELETE_SELECT_SQL.targets, [emails])).rows);
    const merchantHits = (await client.query(WORKSPACE_DELETE_SELECT_SQL.merchantsForEmails, [emails])).rows.map((row) =>
      normalizeEmail(String(row.email || "")),
    );
    const eventHits = (await client.query(WORKSPACE_DELETE_SELECT_SQL.eventsForEmails, [emails])).rows.map((row) => ({
      email: normalizeEmail(String(row.email || "")),
      n: Number(row.n ?? 0),
    }));
    const guardHits = (await client.query(WORKSPACE_DELETE_SELECT_SQL.guardsForEmails, [emails])).rows.map((row) => ({
      email: normalizeEmail(String(row.email || "")),
      n: Number(row.n ?? 0),
    }));
    const plan = planP12_2WorkspaceDelete({ targets, merchantHits, eventHits, guardHits, before });
    const base = { before, targets };
    if (!plan.go) {
      await client.query("ROLLBACK");
      return noGo({ ...base, reason: plan.reason });
    }

    const deleted = (await client.query(WORKSPACE_DELETE_MUTATION_SQL, [plan.emails])).rows.map((row) =>
      normalizeEmail(String(row.email || "")),
    );
    if (deleted.length !== EXPECTED_WORKSPACE_DELETE_COUNT) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        reason: `DELETE RETURNING ${deleted.length} rows, expected ${EXPECTED_WORKSPACE_DELETE_COUNT}.`,
        deletedEmails: deleted,
      });
    }
    const deletedSet = new Set(deleted);
    if (plan.emails.some((email) => !deletedSet.has(email))) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        reason: "DELETE RETURNING emails do not match the P12.2 set.",
        deletedEmails: deleted,
      });
    }

    const after = asCounts((await client.query(WORKSPACE_DELETE_SELECT_SQL.counts)).rows[0]);
    const remaining = Number((await client.query(WORKSPACE_DELETE_SELECT_SQL.remainingTargets, [emails])).rows[0]?.n ?? 0);
    if (!countsEqual(after, EXPECTED_COUNTS_AFTER)) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingTargets: remaining,
        deletedEmails: deleted,
        reason: `After counts are ${countsLabel(after)}, expected ${countsLabel(EXPECTED_COUNTS_AFTER)}.`,
      });
    }
    if (remaining !== 0) {
      await client.query("ROLLBACK");
      return noGo({
        ...base,
        after,
        remainingTargets: remaining,
        deletedEmails: deleted,
        reason: `${remaining} P12.2 workspace rows remain after DELETE.`,
      });
    }

    await client.query("COMMIT");
    return {
      executedAt: new Date().toISOString(),
      go: "GO",
      postgresMutated: true,
      rowsDeleted: EXPECTED_WORKSPACE_DELETE_COUNT,
      rolledBack: false,
      reason: "Deleted 2 P12.2 fixture workspaces. Merchants, track_events, and guard_decisions unchanged.",
      foreignKeysAdded: 0,
      uniqueConstraintsAdded: 0,
      migration002: false,
      p15_4_started: false,
      merchantsDeleted: 0,
      trackEventsDeleted: 0,
      guardsDeleted: 0,
      before,
      after,
      emails,
      deletedEmails: deleted.sort(),
      remainingTargets: 0,
      targets,
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
