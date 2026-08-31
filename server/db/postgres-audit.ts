import { join } from "node:path";

export const EXPECTED_LIVE_COUNTS = {
  merchants: 205,
  workspaces: 5,
  track_events: 139,
  guard_decisions: 163,
} as const;

export const P15_1_CATALOG_REPOS = [
  "server/repositories/user.repository.ts",
  "server/repositories/workspace.repository.ts",
  "server/repositories/event.repository.ts",
  "server/repositories/guard-log.repository.ts",
] as const;

export function catalogSourceIsPostgresOnly(source: string) {
  return (
    !/readJsonFile|writeJsonFile|listJsonFiles/.test(source) &&
    /requirePostgres/.test(source) &&
    !/\.p14\.17-json-archive/.test(source) &&
    !/process\.env\.VERCEL/.test(source)
  );
}

export const EXPECTED_PUBLIC_TABLES = [
  "guard_decisions",
  "merchants",
  "schema_migrations",
  "track_events",
  "workspaces",
] as const;

export function auditMarkerPath() {
  return join(process.cwd(), "data", ".p15.1-postgres-audit");
}

const MUTATION = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|REINDEX|CLUSTER|CALL)\b/i;

export function auditSqlIsReadOnly(sql: string) {
  const trimmed = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
  if (!/^(SELECT|EXPLAIN)\b/i.test(trimmed)) return false;
  return !MUTATION.test(trimmed);
}

export const AUDIT_SQL = {
  tables: `SELECT c.relname AS table_name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY 1`,
  columns: `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  constraints: `SELECT table_name, constraint_name, constraint_type
     FROM information_schema.table_constraints
     WHERE table_schema = 'public'
     ORDER BY table_name, constraint_name`,
  indexes: `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname`,
  sequences: `SELECT sequence_name
     FROM information_schema.sequences
     WHERE sequence_schema = 'public'
     ORDER BY 1`,
  foreignKeys: `SELECT constraint_name
     FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'`,
  migrations: `SELECT id, applied_at FROM schema_migrations ORDER BY id`,
  counts: `SELECT
       (SELECT COUNT(*)::int FROM merchants) AS merchants,
       (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
       (SELECT COUNT(*)::int FROM track_events) AS track_events,
       (SELECT COUNT(*)::int FROM guard_decisions) AS guard_decisions`,
  merchantEmailMismatch: `SELECT COUNT(*)::int AS n
     FROM merchants
     WHERE lower(email) IS DISTINCT FROM lower(coalesce(payload->>'email', ''))`,
  merchantDuplicatePhones: `SELECT COUNT(*)::int AS n FROM (
       SELECT payload->>'phone' AS phone
       FROM merchants
       WHERE coalesce(payload->>'phone', '') <> ''
       GROUP BY 1
       HAVING COUNT(*) > 1
     ) d`,
  merchantBadPayload: `SELECT COUNT(*)::int AS n
     FROM merchants
     WHERE jsonb_typeof(payload) IS DISTINCT FROM 'object'`,
  workspaceOrphans: `SELECT COUNT(*)::int AS n
     FROM workspaces w
     WHERE NOT EXISTS (
       SELECT 1 FROM merchants m WHERE lower(m.email) = lower(w.email)
     )`,
  workspaceOwnerMismatch: `SELECT COUNT(*)::int AS n
     FROM workspaces
     WHERE lower(email) IS DISTINCT FROM lower(coalesce(payload->>'ownerEmail', ''))`,
  workspaceMissingFiles: `SELECT COUNT(*)::int AS n
     FROM workspaces
     WHERE payload->'files' IS NULL OR jsonb_typeof(payload->'files') IS DISTINCT FROM 'array'`,
  eventIdShapes: `SELECT
       COUNT(*) FILTER (WHERE id ~ '^[0-9a-f]{64}$')::int AS sha256,
       COUNT(*) FILTER (WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::int AS uuid,
       COUNT(*) FILTER (
         WHERE id !~ '^[0-9a-f]{64}$'
           AND id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )::int AS other
     FROM track_events`,
  eventOrphans: `SELECT COUNT(*)::int AS n
     FROM track_events e
     WHERE coalesce(e.payload->>'email', '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(e.payload->>'email')
       )`,
  eventBadPayload: `SELECT COUNT(*)::int AS n
     FROM track_events
     WHERE jsonb_typeof(payload) IS DISTINCT FROM 'object'`,
  eventDuplicateAt: `SELECT COUNT(*)::int AS n FROM (
       SELECT at FROM track_events GROUP BY at HAVING COUNT(*) > 1
     ) d`,
  guardOrphans: `SELECT COUNT(*)::int AS n
     FROM guard_decisions g
     WHERE coalesce(g.email, '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM merchants m WHERE lower(m.email) = lower(g.email)
       )`,
  eventEmptyEmail: `SELECT COUNT(*) FILTER (WHERE coalesce(payload->>'email', '') = '')::int AS n
     FROM track_events`,
  explainMerchantsAll: `EXPLAIN (FORMAT JSON) SELECT payload FROM merchants`,
  explainMerchantByEmail: `EXPLAIN (FORMAT JSON) SELECT payload FROM merchants WHERE email = 'p15.1-audit@store.test'`,
  explainWorkspaceByEmail: `EXPLAIN (FORMAT JSON) SELECT payload FROM workspaces WHERE email = 'p15.1-audit@store.test'`,
  explainEventsPage: `EXPLAIN (FORMAT JSON) SELECT payload FROM track_events ORDER BY at DESC LIMIT 2000`,
  explainGuardsByEmail: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions WHERE email = 'p15.1-audit@store.test' ORDER BY created_at DESC LIMIT 50`,
  explainGuardsAll: `EXPLAIN (FORMAT JSON) SELECT * FROM guard_decisions ORDER BY created_at DESC LIMIT 50`,
} as const;

export type AuditSqlName = keyof typeof AUDIT_SQL;

export function allAuditSql(): string[] {
  return Object.values(AUDIT_SQL);
}

export type AuditClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type Finding = {
  id: string;
  area: "schema" | "integrity" | "index" | "performance" | "concurrency" | "pool";
  severity: "info" | "low" | "medium" | "high";
  title: string;
  detail: string;
  p152: boolean;
};

export type PostgresAuditReport = {
  tables: string[];
  columns: Array<{ table_name: string; column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }>;
  constraints: Array<{ table_name: string; constraint_name: string; constraint_type: string }>;
  indexes: Array<{ tablename: string; indexname: string; indexdef: string }>;
  sequences: string[];
  foreignKeyCount: number;
  migrations: Array<{ id: string; applied_at: string }>;
  counts: { merchants: number; workspaces: number; track_events: number; guard_decisions: number };
  integrity: {
    merchantEmailMismatch: number;
    merchantDuplicatePhones: number;
    merchantBadPayload: number;
    workspaceOrphans: number;
    workspaceOwnerMismatch: number;
    workspaceMissingFiles: number;
    eventIds: { sha256: number; uuid: number; other: number };
    eventOrphans: number;
    eventBadPayload: number;
    eventDuplicateAt: number;
    eventEmptyEmail: number;
    guardOrphans: number;
  };
  plans: Record<string, string>;
  findings: Finding[];
};

function n(row: Record<string, unknown> | undefined, key: string) {
  return Number(row?.[key] ?? 0);
}

function planNode(rows: Array<Record<string, unknown>>) {
  const raw = rows[0]?.["QUERY PLAN"];
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  if (/\bSeq Scan\b/i.test(text)) return "Seq Scan";
  if (/Index Only Scan/i.test(text)) return "Index Only Scan";
  if (/Index Scan/i.test(text)) return "Index Scan";
  if (/Bitmap Index Scan/i.test(text)) return "Bitmap Index Scan";
  if (/\bLimit\b/i.test(text)) return "Limit";
  return "unknown";
}

export function countsMatchExpected(counts: PostgresAuditReport["counts"]) {
  return (
    counts.merchants === EXPECTED_LIVE_COUNTS.merchants &&
    counts.workspaces === EXPECTED_LIVE_COUNTS.workspaces &&
    counts.track_events === EXPECTED_LIVE_COUNTS.track_events &&
    counts.guard_decisions === EXPECTED_LIVE_COUNTS.guard_decisions
  );
}

export function sourceConcurrencyFindings(input: {
  userRepo: string;
  workspaceRepo: string;
  eventRepo: string;
  guardRepo: string;
  postgres: string;
}): Finding[] {
  const findings: Finding[] = [];
  if (/const accounts = await readAccounts\(\)/.test(input.userRepo) && /writeAccountPg/.test(input.userRepo) && !/WHERE email = \$1/.test(input.userRepo)) {
    findings.push({
      id: "rmw-merchants",
      area: "concurrency",
      severity: "high",
      title: "Merchant upsert is read-modify-write of the full table",
      detail: "upsertAccount loads every merchant, merges in process, then upserts one row. Concurrent profile/guard writes can clobber fields. findAccount and findAccountByPhone also scan the full result set in memory.",
      p152: true,
    });
  }
  if (!/WHERE email = \$1/.test(input.userRepo)) {
    findings.push({
      id: "merchant-no-pk-lookup",
      area: "performance",
      severity: "high",
      title: "Merchant reads ignore the email primary key",
      detail: "Production SELECT is `SELECT payload FROM merchants` with no WHERE. The PK index is unused on the hot path.",
      p152: true,
    });
  }
  if (/ON CONFLICT \(email\) DO UPDATE/.test(input.workspaceRepo)) {
    findings.push({
      id: "workspace-last-write-wins",
      area: "concurrency",
      severity: "medium",
      title: "Workspace save is last-write-wins without a row lock",
      detail: "saveWorkspace upserts the whole JSONB payload. Two overlapping saves for the same email can drop the earlier file list. Acceptable for single-tab merchants; not safe for concurrent devices.",
      p152: true,
    });
  }
  if (/LIMIT \$1/.test(input.eventRepo) && /ORDER BY at DESC/.test(input.eventRepo) && !/\(at, id\)/.test(input.eventRepo)) {
    findings.push({
      id: "events-cap",
      area: "performance",
      severity: "medium",
      title: "track_events listing is a hard 2000-row cap, not pagination",
      detail: "readEvents always ORDER BY at DESC LIMIT 2000. Rows beyond the cap are invisible. There is no cursor/offset. Mixed SHA-256 and UUID ids are unchanged and must stay mixed.",
      p152: true,
    });
  }
  if (/ON CONFLICT \(id\) DO NOTHING/.test(input.eventRepo)) {
    findings.push({
      id: "event-uuid-insert",
      area: "concurrency",
      severity: "info",
      title: "appendEvent uses a new UUID and ignores conflicts",
      detail: "Insert identity is randomUUID(); historical SHA-256 keys are not rewritten. Collision risk is negligible. Do not unify ids in P15.2.",
      p152: false,
    });
  }
  if (!/ON CONFLICT/.test(input.guardRepo) && input.guardRepo.includes(["INSERT", "INTO", "guard_decisions"].join(" "))) {
    findings.push({
      id: "guard-insert-no-conflict",
      area: "concurrency",
      severity: "low",
      title: "Guard insert has no ON CONFLICT",
      detail: "appendGuardDecision inserts a fresh UUID without conflict handling. A PK clash would make queryPostgres return null and the repository throw. Unlikely with UUIDs.",
      p152: true,
    });
  }
  if (/downUntil = Date\.now\(\) \+ 30_000/.test(input.postgres) && !/statement_timeout/.test(input.postgres)) {
    findings.push({
      id: "pool-poison",
      area: "pool",
      severity: "medium",
      title: "A single driver error poisons catalog reads for 30 seconds",
      detail: "queryPostgres swallows errors, sets downUntil, and returns null. Catalog repos then throw. Pool is max 5, idle 10s, connect timeout 1.5s. There is no statement_timeout.",
      p152: true,
    });
  }
  return findings;
}

export function schemaFindings(input: {
  tables: string[];
  foreignKeyCount: number;
  sequences: string[];
  indexes: Array<{ tablename: string; indexname: string }>;
  migrations: Array<{ id: string }>;
}): Finding[] {
  const findings: Finding[] = [];
  const missing = EXPECTED_PUBLIC_TABLES.filter((name) => !input.tables.includes(name));
  if (missing.length) {
    findings.push({
      id: "missing-tables",
      area: "schema",
      severity: "high",
      title: "Expected public tables are missing",
      detail: missing.join(", "),
      p152: true,
    });
  }
  if (input.foreignKeyCount === 0) {
    findings.push({
      id: "no-foreign-keys",
      area: "schema",
      severity: "info",
      title: "No foreign keys (documented P14 design)",
      detail: "merchants.email, workspaces.email, track_events.payload.email, and guard_decisions.email are related only in application code. Do not add FKs in P15.1. P15.2 may propose them after orphan review.",
      p152: true,
    });
  }
  if (input.sequences.length === 0) {
    findings.push({
      id: "no-sequences",
      area: "schema",
      severity: "info",
      title: "No sequences",
      detail: "Primary keys are TEXT (email or id). No SERIAL/identity columns.",
      p152: false,
    });
  }
  if (!input.migrations.some((row) => row.id === "001_current_schema.sql")) {
    findings.push({
      id: "migration-001-missing",
      area: "schema",
      severity: "high",
      title: "001_current_schema.sql is not in schema_migrations",
      detail: "Live database is not on the checked-in migration.",
      p152: true,
    });
  }
  const indexNames = input.indexes.map((row) => row.indexname);
  for (const needed of ["track_events_at_idx", "guard_decisions_email_created_idx", "guard_decisions_decision_created_idx"]) {
    if (!indexNames.includes(needed)) {
      findings.push({
        id: `missing-index-${needed}`,
        area: "index",
        severity: "high",
        title: `Missing expected index ${needed}`,
        detail: "001_current_schema.sql declares this index.",
        p152: true,
      });
    }
  }
  return findings;
}

export function integrityFindings(integrity: PostgresAuditReport["integrity"], countsMatch: boolean): Finding[] {
  const findings: Finding[] = [];
  if (!countsMatch) {
    findings.push({
      id: "count-drift",
      area: "integrity",
      severity: "medium",
      title: "Live counts differ from the P14.23 baseline",
      detail: `Expected ${EXPECTED_LIVE_COUNTS.merchants}/${EXPECTED_LIVE_COUNTS.workspaces}/${EXPECTED_LIVE_COUNTS.track_events}/${EXPECTED_LIVE_COUNTS.guard_decisions}. Drift may be real product use after cutover; do not auto-reconcile in P15.1.`,
      p152: true,
    });
  }
  const rows: Array<[keyof PostgresAuditReport["integrity"] | "eventOther", string, number]> = [
    ["merchantEmailMismatch", "Merchant PK email differs from payload.email", integrity.merchantEmailMismatch],
    ["merchantDuplicatePhones", "Duplicate non-empty merchant phones", integrity.merchantDuplicatePhones],
    ["merchantBadPayload", "Merchant payload is not a JSON object", integrity.merchantBadPayload],
    ["workspaceOrphans", "Workspaces whose email is not a merchant", integrity.workspaceOrphans],
    ["workspaceOwnerMismatch", "Workspace PK email differs from payload.ownerEmail", integrity.workspaceOwnerMismatch],
    ["workspaceMissingFiles", "Workspaces without a files array", integrity.workspaceMissingFiles],
    ["eventOrphans", "track_events whose payload.email is not a merchant", integrity.eventOrphans],
    ["eventBadPayload", "track_events payload is not a JSON object", integrity.eventBadPayload],
    ["eventDuplicateAt", "Duplicate track_events.at timestamps", integrity.eventDuplicateAt],
    ["guardOrphans", "guard_decisions whose email is not a merchant", integrity.guardOrphans],
  ];
  for (const [id, title, value] of rows) {
    if (value > 0) {
      findings.push({
        id: String(id),
        area: "integrity",
        severity: value > 10 ? "medium" : "low",
        title,
        detail: `${value} row group(s). Documented only; P15.1 does not repair.`,
        p152: true,
      });
    }
  }
  if (integrity.eventIds.other > 0) {
    findings.push({
      id: "event-id-other",
      area: "integrity",
      severity: "medium",
      title: "track_events.id values that are neither SHA-256 nor UUID",
      detail: `${integrity.eventIds.other} row(s). Do not rewrite ids in P15.1.`,
      p152: true,
    });
  }
  if (integrity.eventEmptyEmail > 0) {
    findings.push({
      id: "event-empty-email",
      area: "integrity",
      severity: "info",
      title: "Many track_events omit payload.email",
      detail: `${integrity.eventEmptyEmail} row(s) have empty payload.email. TrackEvent.email is optional. The orphan check only applies when email is set. Do not add a payload.email NOT NULL in P15.2.`,
      p152: false,
    });
  }
  findings.push({
    id: "event-id-split",
    area: "integrity",
    severity: "info",
    title: "track_events.id is intentionally mixed SHA-256 + UUID",
    detail: `sha256=${integrity.eventIds.sha256}, uuid=${integrity.eventIds.uuid}. Historical backfill vs new appendEvent. Do not unify.`,
    p152: false,
  });
  return findings;
}

export function planFindings(plans: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  if (plans.explainMerchantsAll === "Seq Scan") {
    findings.push({
      id: "seq-scan-merchants",
      area: "index",
      severity: "high",
      title: "Full merchant listing is a sequential scan",
      detail: "Matches the repository SQL. At 205 rows this is cheap; it will not stay cheap.",
      p152: true,
    });
  }
  if (plans.explainMerchantByEmail === "Seq Scan") {
    findings.push({
      id: "seq-scan-merchant-pk",
      area: "index",
      severity: "medium",
      title: "Planner did not use merchants_pkey for an email lookup",
      detail: "Unexpected at current scale. Recheck statistics in P15.2.",
      p152: true,
    });
  }
  if (plans.explainEventsPage === "Seq Scan") {
    findings.push({
      id: "seq-scan-events-despite-at-idx",
      area: "index",
      severity: "info",
      title: "track_events ORDER BY at uses Seq Scan at current cardinality",
      detail: "track_events_at_idx exists. The planner prefers Seq Scan + Sort at ~181 rows. Do not add another at index until EXPLAIN ANALYZE at larger scale shows a real sort cost.",
      p152: true,
    });
  }
  if (plans.explainGuardsAll === "Seq Scan") {
    findings.push({
      id: "seq-scan-guards-all",
      area: "index",
      severity: "medium",
      title: "Unfiltered guard listing sorts created_at without a dedicated index",
      detail: "listGuardDecisions without email does Seq Scan + Sort. Existing indexes are (email, created_at DESC) and (decision, created_at DESC). A created_at-only index is a P15.2 candidate after orphan review.",
      p152: true,
    });
  }
  return findings;
}

export async function runProductionAudit(client: AuditClient): Promise<PostgresAuditReport> {
  for (const sql of allAuditSql()) {
    if (!auditSqlIsReadOnly(sql)) {
      throw new Error(`P15.1 refuse: refusing to run non-read-only SQL: ${sql.slice(0, 80)}`);
    }
  }
  const q = async (name: AuditSqlName) => (await client.query(AUDIT_SQL[name])).rows;

  const tableRows = await q("tables");
  const columnRows = await q("columns");
  const constraintRows = await q("constraints");
  const indexRows = await q("indexes");
  const sequenceRows = await q("sequences");
  const fkRows = await q("foreignKeys");
  const migrationRows = await q("migrations");
  const countRows = await q("counts");
  const mismatch = await q("merchantEmailMismatch");
  const dupPhones = await q("merchantDuplicatePhones");
  const badMerchants = await q("merchantBadPayload");
  const wsOrphans = await q("workspaceOrphans");
  const wsOwner = await q("workspaceOwnerMismatch");
  const wsFiles = await q("workspaceMissingFiles");
  const eventShapes = await q("eventIdShapes");
  const eventOrphans = await q("eventOrphans");
  const eventBad = await q("eventBadPayload");
  const eventDupAt = await q("eventDuplicateAt");
  const guardOrphans = await q("guardOrphans");
  const eventEmpty = await q("eventEmptyEmail");
  const plans = {
    explainMerchantsAll: planNode(await q("explainMerchantsAll")),
    explainMerchantByEmail: planNode(await q("explainMerchantByEmail")),
    explainWorkspaceByEmail: planNode(await q("explainWorkspaceByEmail")),
    explainEventsPage: planNode(await q("explainEventsPage")),
    explainGuardsByEmail: planNode(await q("explainGuardsByEmail")),
    explainGuardsAll: planNode(await q("explainGuardsAll")),
  };

  const tables = tableRows.map((row) => String(row.table_name));
  const counts = {
    merchants: n(countRows[0], "merchants"),
    workspaces: n(countRows[0], "workspaces"),
    track_events: n(countRows[0], "track_events"),
    guard_decisions: n(countRows[0], "guard_decisions"),
  };
  const integrity = {
    merchantEmailMismatch: n(mismatch[0], "n"),
    merchantDuplicatePhones: n(dupPhones[0], "n"),
    merchantBadPayload: n(badMerchants[0], "n"),
    workspaceOrphans: n(wsOrphans[0], "n"),
    workspaceOwnerMismatch: n(wsOwner[0], "n"),
    workspaceMissingFiles: n(wsFiles[0], "n"),
    eventIds: {
      sha256: n(eventShapes[0], "sha256"),
      uuid: n(eventShapes[0], "uuid"),
      other: n(eventShapes[0], "other"),
    },
    eventOrphans: n(eventOrphans[0], "n"),
    eventBadPayload: n(eventBad[0], "n"),
    eventDuplicateAt: n(eventDupAt[0], "n"),
    eventEmptyEmail: n(eventEmpty[0], "n"),
    guardOrphans: n(guardOrphans[0], "n"),
  };
  const indexes = indexRows.map((row) => ({
    tablename: String(row.tablename),
    indexname: String(row.indexname),
    indexdef: String(row.indexdef),
  }));
  const migrations = migrationRows.map((row) => ({
    id: String(row.id),
    applied_at: String(row.applied_at),
  }));
  const findings = [
    ...schemaFindings({
      tables,
      foreignKeyCount: fkRows.length,
      sequences: sequenceRows.map((row) => String(row.sequence_name)),
      indexes,
      migrations,
    }),
    ...integrityFindings(integrity, countsMatchExpected(counts)),
    ...planFindings(plans),
  ];

  return {
    tables,
    columns: columnRows.map((row) => ({
      table_name: String(row.table_name),
      column_name: String(row.column_name),
      data_type: String(row.data_type),
      udt_name: String(row.udt_name),
      is_nullable: String(row.is_nullable),
      column_default: row.column_default == null ? null : String(row.column_default),
    })),
    constraints: constraintRows.map((row) => ({
      table_name: String(row.table_name),
      constraint_name: String(row.constraint_name),
      constraint_type: String(row.constraint_type),
    })),
    indexes,
    sequences: sequenceRows.map((row) => String(row.sequence_name)),
    foreignKeyCount: fkRows.length,
    migrations,
    counts,
    integrity,
    plans,
    findings,
  };
}

export type CanFinishAuditInput = {
  pgReachable: boolean;
  migration001: boolean;
  tablesPresent: boolean;
  sqlReadOnly: boolean;
  reposUnchanged: boolean;
  schemaUnchanged: boolean;
};

export function canFinishAudit(input: CanFinishAuditInput) {
  return (
    input.pgReachable &&
    input.migration001 &&
    input.tablesPresent &&
    input.sqlReadOnly &&
    input.reposUnchanged &&
    input.schemaUnchanged
  );
}

export function postgresAuditGo(input: CanFinishAuditInput & { reportRecorded: boolean; noMutations: boolean }) {
  return canFinishAudit(input) && input.reportRecorded && input.noMutations;
}

export function formatPostgresAudit(input: {
  go: boolean;
  counts: PostgresAuditReport["counts"];
  countsMatch: boolean;
  foreignKeyCount: number;
  findings: Finding[];
}) {
  const yn = (ok: boolean) => (ok ? "PASS" : "FAIL");
  const high = input.findings.filter((row) => row.severity === "high").length;
  const medium = input.findings.filter((row) => row.severity === "medium").length;
  return [
    `P15.1 production PostgreSQL audit: ${input.go ? "GO" : "NO-GO"}`,
    `Counts match P14.23:      ${yn(input.countsMatch)}`,
    `Merchants:                ${input.counts.merchants}`,
    `Workspaces:               ${input.counts.workspaces}`,
    `Track events:             ${input.counts.track_events}`,
    `Guard decisions:          ${input.counts.guard_decisions}`,
    `Foreign keys:             ${input.foreignKeyCount}`,
    `High findings:            ${high}`,
    `Medium findings:          ${medium}`,
    `Total findings:           ${input.findings.length}`,
  ].join("\n");
}
