import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import { P12_2_WORKSPACE_ORPHANS, GUARD_HARNESS_EMAIL } from "@/server/db/orphan-classify";
import { normalizeEmail } from "@/shared/identity";
import { normalizeMobile } from "@/shared/phone";

export type DecisionVerdict = "SAFE TO DELETE" | "NEEDS REVIEW" | "SAFE FOR CONSTRAINT" | "BLOCKED";

export function decisionGateMarkerPath() {
  return join(process.cwd(), "data", ".p15.3-decision-gate");
}

export const DECISION_SQL = {
  counts: `SELECT
       (SELECT COUNT(*)::int FROM merchants) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions) AS guard_decisions`,
  workspaceTargets: `SELECT w.email,
            w.updated_at,
            w.payload->>'savedAt' AS saved_at,
            w.payload->>'ownerEmail' AS owner_email,
            COALESCE(jsonb_array_length(w.payload->'files'), 0)::int AS files
     FROM workspaces w
     WHERE lower(w.email) = ANY($1::text[])
     ORDER BY 1`,
  merchantExists: `SELECT lower(email) AS email FROM merchants WHERE lower(email) = ANY($1::text[])`,
  eventRefs: `SELECT lower(payload->>'email') AS email, COUNT(*)::int AS n
     FROM track_events
     WHERE coalesce(payload->>'email', '') <> ''
       AND lower(payload->>'email') = ANY($1::text[])
     GROUP BY 1`,
  guardRefs: `SELECT lower(email) AS email, COUNT(*)::int AS n
     FROM guard_decisions
     WHERE coalesce(email, '') <> ''
       AND lower(email) = ANY($1::text[])
     GROUP BY 1`,
  p125Guards: `SELECT lower(g.email) AS email,
            COUNT(*)::int AS n,
            MIN(g.created_at) AS first_at,
            MAX(g.created_at) AS last_at,
            array_agg(DISTINCT g.decision) AS decisions
     FROM guard_decisions g
     WHERE g.email ~* '^p125-.+@test\\.com$'
     GROUP BY 1
     ORDER BY n DESC, email`,
  p125Merchants: `SELECT lower(email) AS email FROM merchants WHERE email ~* '^p125-.+@test\\.com$'`,
  allPhones: `SELECT email, payload->>'phone' AS phone
     FROM merchants
     ORDER BY email`,
} as const;

export function allDecisionSql(): string[] {
  return Object.values(DECISION_SQL);
}

export function decisionSqlIsReadOnly() {
  return allDecisionSql().every(auditSqlIsReadOnly);
}

export type WorkspaceDecisionRow = {
  email: string;
  workspaceRows: number;
  updatedAt: string | null;
  savedAt: string | null;
  ownerEmail: string | null;
  files: number;
  hasMerchant: boolean;
  trackEvents: number;
  guardRows: number;
  otherRefs: string[];
  verdict: DecisionVerdict;
  reason: string;
};

export function classifyWorkspaceDelete(input: {
  email: string;
  workspaceRows: number;
  hasMerchant: boolean;
  trackEvents: number;
  guardRows: number;
}): { verdict: DecisionVerdict; reason: string; otherRefs: string[] } {
  const otherRefs = [
    input.hasMerchant ? "merchants" : "",
    input.trackEvents > 0 ? `track_events:${input.trackEvents}` : "",
    input.guardRows > 0 ? `guard_decisions:${input.guardRows}` : "",
  ].filter(Boolean);
  if (input.workspaceRows === 0) {
    return { verdict: "NEEDS REVIEW", reason: "No workspace row found for this email.", otherRefs };
  }
  if (input.hasMerchant) {
    return {
      verdict: "BLOCKED",
      reason: "A merchants.email row exists. Deleting the workspace would orphan a live account's files.",
      otherRefs,
    };
  }
  if (input.trackEvents > 0 || input.guardRows > 0) {
    return {
      verdict: "NEEDS REVIEW",
      reason: "No merchant, but other catalog rows reference this email. Deleting the workspace alone would not remove those refs.",
      otherRefs,
    };
  }
  return {
    verdict: "SAFE TO DELETE",
    reason: "P12.2 fixture leftover: one workspace row, no merchant, no track_events, no guard_decisions. Still requires an explicit delete GO.",
    otherRefs,
  };
}

export type GuardDecisionRow = {
  email: string;
  n: number;
  firstAt: string | null;
  lastAt: string | null;
  decisions: string[];
  hasMerchant: boolean;
  trackEvents: number;
  harness: boolean;
  verdict: DecisionVerdict;
  reason: string;
};

export function classifyGuardDelete(input: {
  email: string;
  n: number;
  hasMerchant: boolean;
  trackEvents: number;
}): { verdict: DecisionVerdict; reason: string; harness: boolean } {
  const harness = GUARD_HARNESS_EMAIL.test(normalizeEmail(input.email));
  if (input.hasMerchant) {
    return {
      verdict: "BLOCKED",
      reason: "A merchants.email row exists. Deleting these guard rows would drop audit history for a live account.",
      harness,
    };
  }
  if (!harness) {
    return {
      verdict: "NEEDS REVIEW",
      reason: "Email is not the p125-*@test.com harness pattern.",
      harness,
    };
  }
  if (input.trackEvents > 0) {
    return {
      verdict: "NEEDS REVIEW",
      reason: "Harness email has track_events as well as guard_decisions.",
      harness,
    };
  }
  return {
    verdict: "SAFE TO DELETE",
    reason: `P12.5/P125 harness leftover: ${input.n} guard_decisions, no merchant, no track_events. Still requires an explicit delete GO.`,
    harness,
  };
}

export type PhoneAnomaly = {
  kind: "null" | "empty" | "invalid-format" | "raw-duplicate" | "normalized-duplicate";
  phone: string | null;
  normalized: string | null;
  emails: string[];
};

export type PhoneDecision = {
  merchantCount: number;
  nullCount: number;
  emptyCount: number;
  invalidCount: number;
  rawDuplicateGroups: number;
  normalizedDuplicateGroups: number;
  uniqueValidE164: number;
  anomalies: PhoneAnomaly[];
  verdict: DecisionVerdict;
  reason: string;
};

export function classifyPhoneUnique(rows: Array<{ email: string; phone: string | null }>): PhoneDecision {
  const nullEmails: string[] = [];
  const emptyEmails: string[] = [];
  const invalid: PhoneAnomaly[] = [];
  const rawMap = new Map<string, string[]>();
  const normMap = new Map<string, string[]>();
  let uniqueValidE164 = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (row.phone == null) {
      nullEmails.push(email);
      continue;
    }
    if (row.phone === "") {
      emptyEmails.push(email);
      const list = rawMap.get("") ?? [];
      list.push(email);
      rawMap.set("", list);
      continue;
    }
    const rawList = rawMap.get(row.phone) ?? [];
    rawList.push(email);
    rawMap.set(row.phone, rawList);
    const normalized = normalizeMobile(row.phone);
    if (!normalized) {
      invalid.push({ kind: "invalid-format", phone: row.phone, normalized: null, emails: [email] });
      continue;
    }
    const normList = normMap.get(normalized) ?? [];
    normList.push(email);
    normMap.set(normalized, normList);
  }

  const anomalies: PhoneAnomaly[] = [];
  if (nullEmails.length) anomalies.push({ kind: "null", phone: null, normalized: null, emails: nullEmails });
  if (emptyEmails.length) {
    anomalies.push({ kind: "empty", phone: "", normalized: null, emails: emptyEmails });
  }
  anomalies.push(...invalid);

  let rawDuplicateGroups = 0;
  for (const [phone, emails] of rawMap) {
    if (emails.length > 1) {
      rawDuplicateGroups += 1;
      anomalies.push({ kind: "raw-duplicate", phone, normalized: phone ? normalizeMobile(phone) : null, emails });
    }
  }
  let normalizedDuplicateGroups = 0;
  for (const [normalized, emails] of normMap) {
    if (emails.length > 1) {
      normalizedDuplicateGroups += 1;
      anomalies.push({ kind: "normalized-duplicate", phone: normalized, normalized, emails });
    }
  }
  uniqueValidE164 = [...normMap.entries()].filter(([, emails]) => emails.length === 1).length;

  let verdict: DecisionVerdict;
  let reason: string;
  if (rawDuplicateGroups > 0) {
    verdict = "BLOCKED";
    reason = "Two or more merchants share the same payload->>'phone' text. UNIQUE(phone) would fail.";
  } else if (emptyEmails.length > 1) {
    verdict = "BLOCKED";
    reason = "More than one merchant has an empty-string phone. UNIQUE treats '' as a value and would fail.";
  } else if (normalizedDuplicateGroups > 0) {
    verdict = "NEEDS REVIEW";
    reason = "Raw phone strings are unique, but at least two normalize to the same E.164. UNIQUE on the raw JSON text would not catch that.";
  } else if (invalid.length > 0 || emptyEmails.length === 1) {
    verdict = "NEEDS REVIEW";
    reason = "No raw duplicates, but some phones are empty or not valid E.164. UNIQUE on raw text would still apply; product uniqueness would not.";
  } else {
    verdict = "SAFE FOR CONSTRAINT";
    reason =
      "Every non-null phone is a unique valid E.164 string. NULL phones are allowed under UNIQUE. Still requires an explicit constraint GO — P15.3 Decision Gate does not add UNIQUE.";
  }

  return {
    merchantCount: rows.length,
    nullCount: nullEmails.length,
    emptyCount: emptyEmails.length,
    invalidCount: invalid.length,
    rawDuplicateGroups,
    normalizedDuplicateGroups,
    uniqueValidE164,
    anomalies,
    verdict,
    reason,
  };
}

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function countMap(rows: Array<{ email?: unknown; n?: unknown }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.email || "").toLowerCase(), Number(row.n ?? 0));
  }
  return map;
}

function emailSet(rows: Array<{ email?: unknown }>) {
  return new Set(rows.map((row) => String(row.email || "").toLowerCase()));
}

export type DecisionItem = {
  id: string;
  title: string;
  verdict: DecisionVerdict;
  detail: string;
};

export type DecisionGateReport = {
  evaluatedAt: string;
  postgresMutated: false;
  rowsDeleted: 0;
  foreignKeysAdded: 0;
  uniqueConstraintsAdded: 0;
  migration002: false;
  p15_4_started: false;
  counts: { merchants: number; workspaces: number; track_events: number; guard_decisions: number };
  workspaces: WorkspaceDecisionRow[];
  guards: GuardDecisionRow[];
  guardSummary: {
    emails: number;
    rows: number;
    withMerchant: number;
    noMerchantEmails: number;
    noMerchantRows: number;
    verdict: DecisionVerdict;
    reason: string;
  };
  phones: PhoneDecision;
  indexCreatedAt: { verdict: DecisionVerdict; reason: string };
  workspaceCas: { verdict: DecisionVerdict; reason: string };
  items: DecisionItem[];
};

export function summarizeGuardDeletes(rows: GuardDecisionRow[]): DecisionGateReport["guardSummary"] {
  const withMerchant = rows.filter((row) => row.hasMerchant).length;
  const blocked = rows.some((row) => row.verdict === "BLOCKED");
  const review = rows.some((row) => row.verdict === "NEEDS REVIEW");
  const rowsN = rows.reduce((sum, row) => sum + row.n, 0);
  const noMerchant = rows.filter((row) => !row.hasMerchant);
  const base = {
    emails: rows.length,
    rows: rowsN,
    withMerchant,
    noMerchantEmails: noMerchant.length,
    noMerchantRows: noMerchant.reduce((sum, row) => sum + row.n, 0),
  };
  if (rows.length === 0) {
    return {
      ...base,
      verdict: "NEEDS REVIEW",
      reason: "No p125-*@test.com guard_decisions found.",
    };
  }
  if (blocked) {
    return {
      ...base,
      verdict: "BLOCKED",
      reason: `${withMerchant} of ${rows.length} p125-* emails now match a merchant (${base.rows - base.noMerchantRows} rows). A blanket delete is blocked. The ${base.noMerchantEmails} emails / ${base.noMerchantRows} rows with no merchant still look like harness leftovers (SAFE TO DELETE only with a targeted GO).`,
    };
  }
  if (review) {
    return {
      ...base,
      verdict: "NEEDS REVIEW",
      reason: "Harness rows exist, but some emails have extra catalog refs or are off-pattern.",
    };
  }
  return {
    ...base,
    verdict: "SAFE TO DELETE",
    reason: `${rowsN} harness guard_decisions across ${rows.length} emails, no merchants. Still requires an explicit delete GO.`,
  };
}

export async function runDecisionGate(client: {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<DecisionGateReport> {
  if (!decisionSqlIsReadOnly()) {
    throw new Error("P15.3 Decision Gate refuse: SQL is not read-only.");
  }
  const targets = [...P12_2_WORKSPACE_ORPHANS];
  const countsRow = (await client.query(DECISION_SQL.counts)).rows[0] ?? {};
  const workspaceRows = (await client.query(DECISION_SQL.workspaceTargets, [targets])).rows;
  const merchantRows = (await client.query(DECISION_SQL.merchantExists, [targets])).rows;
  const eventRows = (await client.query(DECISION_SQL.eventRefs, [targets])).rows;
  const guardRefRows = (await client.query(DECISION_SQL.guardRefs, [targets])).rows;
  const merchants = emailSet(merchantRows);
  const events = countMap(eventRows);
  const guards = countMap(guardRefRows);
  const workspaceByEmail = new Map(workspaceRows.map((row) => [String(row.email || "").toLowerCase(), row]));

  const workspaces: WorkspaceDecisionRow[] = targets.map((email) => {
    const row = workspaceByEmail.get(email);
    const input = {
      email,
      workspaceRows: row ? 1 : 0,
      hasMerchant: merchants.has(email),
      trackEvents: events.get(email) ?? 0,
      guardRows: guards.get(email) ?? 0,
    };
    const classified = classifyWorkspaceDelete(input);
    return {
      email,
      workspaceRows: input.workspaceRows,
      updatedAt: iso(row?.updated_at),
      savedAt: iso(row?.saved_at),
      ownerEmail: row?.owner_email ? String(row.owner_email) : null,
      files: Number(row?.files ?? 0),
      hasMerchant: input.hasMerchant,
      trackEvents: input.trackEvents,
      guardRows: input.guardRows,
      otherRefs: classified.otherRefs,
      verdict: classified.verdict,
      reason: classified.reason,
    };
  });

  const p125 = (await client.query(DECISION_SQL.p125Guards)).rows;
  const p125MerchantSet = emailSet((await client.query(DECISION_SQL.p125Merchants)).rows);
  const p125Emails = p125.map((row) => String(row.email || "").toLowerCase());
  const p125Events = p125Emails.length
    ? countMap((await client.query(DECISION_SQL.eventRefs, [p125Emails])).rows)
    : new Map<string, number>();

  const guardRows: GuardDecisionRow[] = p125.map((row) => {
    const email = String(row.email || "").toLowerCase();
    const classified = classifyGuardDelete({
      email,
      n: Number(row.n ?? 0),
      hasMerchant: p125MerchantSet.has(email),
      trackEvents: p125Events.get(email) ?? 0,
    });
    const decisions = Array.isArray(row.decisions) ? row.decisions.map((item) => String(item)) : [];
    return {
      email,
      n: Number(row.n ?? 0),
      firstAt: iso(row.first_at),
      lastAt: iso(row.last_at),
      decisions,
      hasMerchant: p125MerchantSet.has(email),
      trackEvents: p125Events.get(email) ?? 0,
      harness: classified.harness,
      verdict: classified.verdict,
      reason: classified.reason,
    };
  });

  const phoneRows = (await client.query(DECISION_SQL.allPhones)).rows.map((row) => ({
    email: String(row.email || ""),
    phone: row.phone == null ? null : String(row.phone),
  }));
  const phones = classifyPhoneUnique(phoneRows);
  const guardSummary = summarizeGuardDeletes(guardRows);
  const workspaceVerdicts = [...new Set(workspaces.map((row) => row.verdict))];
  const workspaceItemVerdict: DecisionVerdict = workspaceVerdicts.includes("BLOCKED")
    ? "BLOCKED"
    : workspaceVerdicts.includes("NEEDS REVIEW")
      ? "NEEDS REVIEW"
      : workspaceVerdicts[0] ?? "NEEDS REVIEW";

  const indexCreatedAt = {
    verdict: "BLOCKED" as const,
    reason: "P15.3 EXPLAIN at 167 rows was Seq Scan cost 35.26. An unused created_at DESC index is not proven useful. No 002.",
  };
  const workspaceCas = {
    verdict: "BLOCKED" as const,
    reason: "Compare-and-swap needs expectedSavedAt and HTTP 409 — that changes POST /api/workspace. Plan only.",
  };

  const items: DecisionItem[] = [
    {
      id: "delete-p12.2-workspaces",
      title: "Delete p12.2-alice / p12.2-bob workspaces",
      verdict: workspaceItemVerdict,
      detail: workspaces.map((row) => `${row.email}: ${row.verdict}`).join("; "),
    },
    {
      id: "delete-p125-guards",
      title: "Delete p125-* guard_decisions",
      verdict: guardSummary.verdict,
      detail: guardSummary.reason,
    },
    {
      id: "unique-phone",
      title: "UNIQUE (merchants.payload->>'phone')",
      verdict: phones.verdict,
      detail: phones.reason,
    },
    {
      id: "fk-any",
      title: "Add any FK",
      verdict: "BLOCKED",
      detail: "Orphans remain. Decision Gate does not add FK. Needs a separate delete GO first, or an FK that allows unmatched emails.",
    },
    {
      id: "index-created-at",
      title: "guard_decisions(created_at DESC) via 002",
      verdict: indexCreatedAt.verdict,
      detail: indexCreatedAt.reason,
    },
    {
      id: "workspace-cas",
      title: "Workspace compare-and-swap",
      verdict: workspaceCas.verdict,
      detail: workspaceCas.reason,
    },
  ];

  return {
    evaluatedAt: new Date().toISOString(),
    postgresMutated: false,
    rowsDeleted: 0,
    foreignKeysAdded: 0,
    uniqueConstraintsAdded: 0,
    migration002: false,
    p15_4_started: false,
    counts: {
      merchants: Number(countsRow.merchants ?? 0),
      workspaces: Number(countsRow.workspaces ?? 0),
      track_events: Number(countsRow.track_events ?? 0),
      guard_decisions: Number(countsRow.guard_decisions ?? 0),
    },
    workspaces,
    guards: guardRows,
    guardSummary,
    phones,
    indexCreatedAt,
    workspaceCas,
    items,
  };
}
