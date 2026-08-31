import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { auditSqlIsReadOnly, EXPECTED_PUBLIC_TABLES, P15_1_CATALOG_REPOS } from "@/server/db/postgres-audit";
import { EXPECTED_P15_4_COUNTS, type CatalogCounts } from "@/server/db/p15.4-verify";

export const P15_5_EXPECTED_MIGRATION = "001_current_schema.sql";
export const P15_5_CATALOG_REPOS = P15_1_CATALOG_REPOS;

export function p15_5MarkerPath() {
  return join(process.cwd(), "data", ".p15.5-final-audit");
}

export const P15_5_SELECT_SQL = {
  tables: `SELECT c.relname AS table_name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY 1`,
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
  indexes: `SELECT tablename, indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname`,
  merchantEmailMismatch: `SELECT COUNT(*)::int AS n
     FROM merchants
     WHERE lower(email) IS DISTINCT FROM lower(coalesce(payload->>'email', ''))`,
  merchantBadPayload: `SELECT COUNT(*)::int AS n
     FROM merchants
     WHERE jsonb_typeof(payload) IS DISTINCT FROM 'object'`,
  workspaceOwnerMismatch: `SELECT COUNT(*)::int AS n
     FROM workspaces
     WHERE lower(email) IS DISTINCT FROM lower(coalesce(payload->>'ownerEmail', ''))`,
  workspaceMissingFiles: `SELECT COUNT(*)::int AS n
     FROM workspaces
     WHERE payload->'files' IS NULL OR jsonb_typeof(payload->'files') IS DISTINCT FROM 'array'`,
  eventBadPayload: `SELECT COUNT(*)::int AS n
     FROM track_events
     WHERE jsonb_typeof(payload) IS DISTINCT FROM 'object'`,
  eventIdShapes: `SELECT
       COUNT(*) FILTER (WHERE id ~ '^[0-9a-f]{64}$')::int AS sha256,
       COUNT(*) FILTER (WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::int AS uuid,
       COUNT(*) FILTER (
         WHERE id !~ '^[0-9a-f]{64}$'
           AND id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )::int AS other
     FROM track_events`,
  emptyPhones: `SELECT COUNT(*)::int AS n
     FROM merchants
     WHERE coalesce(payload->>'phone', '') = ''`,
  emptyPhoneEmails: `SELECT email
     FROM merchants
     WHERE coalesce(payload->>'phone', '') = ''
     ORDER BY 1`,
  duplicatePhones: `SELECT COUNT(*)::int AS n FROM (
       SELECT payload->>'phone' AS phone
       FROM merchants
       WHERE coalesce(payload->>'phone', '') <> ''
       GROUP BY 1
       HAVING COUNT(*) > 1
     ) d`,
} as const;

export function allP15_5SelectSql(): string[] {
  return Object.values(P15_5_SELECT_SQL);
}

export function p15_5SelectSqlIsReadOnly() {
  return allP15_5SelectSql().every(auditSqlIsReadOnly);
}

export function p15_5HasNoMutationSql() {
  const blob = allP15_5SelectSql().join("\n");
  return !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|BEGIN|COMMIT|ROLLBACK)\b/i.test(blob);
}

function asCounts(row: Record<string, unknown> | undefined): CatalogCounts {
  return {
    merchants: Number(row?.merchants ?? 0),
    workspaces: Number(row?.workspaces ?? 0),
    track_events: Number(row?.track_events ?? 0),
    guard_decisions: Number(row?.guard_decisions ?? 0),
  };
}

function n(row: Record<string, unknown> | undefined) {
  return Number(row?.n ?? 0);
}

export type P15_5SourceScan = {
  catalogJsonFallback: boolean;
  demoUsesJsonStore: boolean;
  demoFile: boolean;
  migration002OnDisk: boolean;
  p15UmbrellaDoc: boolean;
  p16Doc: boolean;
  libUtilsPresent: boolean;
};

export function inspectP15_5Sources(root = process.cwd()): P15_5SourceScan {
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  let catalogJsonFallback = false;
  for (const rel of P15_5_CATALOG_REPOS) {
    const body = read(rel);
    if (
      /from ["']@\/server\/storage\/json-store/.test(body) ||
      /readJsonFile|writeJsonFile|listJsonFiles/.test(body) ||
      !/requirePostgres/.test(body)
    ) {
      catalogJsonFallback = true;
    }
  }
  const demo = read("server/repositories/demo.repository.ts");
  const migrations = readdirSync(join(root, "server", "db", "migrations")).filter((name) => name.endsWith(".sql"));
  return {
    catalogJsonFallback,
    demoUsesJsonStore: /from ["']@\/server\/storage\/json-store/.test(demo) && /nac-demo\.json/.test(demo),
    demoFile: /nac-demo\.json/.test(demo),
    migration002OnDisk: migrations.some((name) => name.startsWith("002")),
    p15UmbrellaDoc: existsSync(join(root, "docs", "p15.md")),
    p16Doc: existsSync(join(root, "docs", "p16.md")),
    libUtilsPresent: existsSync(join(root, "lib", "utils.ts")),
  };
}

export type P15_5Evidence = {
  tables: string[];
  counts: CatalogCounts;
  workspaceOrphans: number;
  guardOrphans: number;
  eventOrphans: number;
  workspaceEmails: string[];
  foreignKeyCount: number;
  extraUnique: Array<{ table: string; name: string }>;
  appliedMigrations: string[];
  indexNames: string[];
  merchantEmailMismatch: number;
  merchantBadPayload: number;
  workspaceOwnerMismatch: number;
  workspaceMissingFiles: number;
  eventBadPayload: number;
  eventIds: { sha256: number; uuid: number; other: number };
  emptyPhoneCount: number;
  emptyPhoneEmails: string[];
  duplicatePhones: number;
  sources: P15_5SourceScan;
};

export type P15_5Report = {
  evaluatedAt: string;
  go: "GO" | "NO-GO";
  readyForCleanupThenP16: boolean;
  reasons: string[];
  deferred: string[];
  postgresMutated: false;
  rowsDeleted: 0;
  foreignKeysAdded: 0;
  uniqueConstraintsAdded: 0;
  migration002: false;
  p16_started: false;
  evidence: P15_5Evidence;
};

export function classifyP15_5(input: P15_5Evidence): { go: "GO" | "NO-GO"; reasons: string[]; deferred: string[] } {
  const reasons: string[] = [];
  const deferred: string[] = [];
  const expected = EXPECTED_P15_4_COUNTS;

  if (input.counts.merchants !== expected.merchants) {
    reasons.push(`merchants is ${input.counts.merchants}, expected ${expected.merchants}.`);
  }
  if (input.counts.workspaces !== expected.workspaces) {
    reasons.push(`workspaces is ${input.counts.workspaces}, expected ${expected.workspaces}.`);
  }
  if (input.counts.track_events < expected.track_events) {
    reasons.push(`track_events dropped to ${input.counts.track_events}, expected at least ${expected.track_events}.`);
  }
  if (input.counts.guard_decisions < expected.guard_decisions) {
    reasons.push(`guard_decisions dropped to ${input.counts.guard_decisions}, expected at least ${expected.guard_decisions}.`);
  }
  if (input.counts.track_events > expected.track_events || input.counts.guard_decisions > expected.guard_decisions) {
    deferred.push(
      `Activity after P15.4: events ${input.counts.track_events} (was ${expected.track_events}), guards ${input.counts.guard_decisions} (was ${expected.guard_decisions}).`,
    );
  }
  if (input.workspaceOrphans !== 0) reasons.push(`Workspace orphans: ${input.workspaceOrphans}.`);
  if (input.guardOrphans !== 0) reasons.push(`Guard orphans: ${input.guardOrphans}.`);
  if (input.eventOrphans !== 0) reasons.push(`Event orphans: ${input.eventOrphans}.`);
  if (input.foreignKeyCount !== 0) reasons.push(`Foreign keys present: ${input.foreignKeyCount}.`);
  if (input.extraUnique.length) {
    reasons.push(`Unexpected UNIQUE constraints: ${input.extraUnique.map((row) => `${row.table}.${row.name}`).join(", ")}.`);
  }
  if (input.appliedMigrations.join(",") !== P15_5_EXPECTED_MIGRATION) {
    reasons.push(`schema_migrations is [${input.appliedMigrations.join(", ")}], expected only ${P15_5_EXPECTED_MIGRATION}.`);
  }
  if (input.tables.join(",") !== EXPECTED_PUBLIC_TABLES.join(",")) {
    reasons.push(`Public tables are [${input.tables.join(", ")}], expected [${EXPECTED_PUBLIC_TABLES.join(", ")}].`);
  }
  if (input.merchantEmailMismatch !== 0) reasons.push(`Merchant email/payload mismatches: ${input.merchantEmailMismatch}.`);
  if (input.merchantBadPayload !== 0) reasons.push(`Non-object merchant payloads: ${input.merchantBadPayload}.`);
  if (input.workspaceOwnerMismatch !== 0) reasons.push(`Workspace ownerEmail mismatches: ${input.workspaceOwnerMismatch}.`);
  if (input.workspaceMissingFiles !== 0) reasons.push(`Workspaces missing files array: ${input.workspaceMissingFiles}.`);
  if (input.eventBadPayload !== 0) reasons.push(`Non-object event payloads: ${input.eventBadPayload}.`);
  if (input.eventIds.other !== 0) reasons.push(`Unexpected track_events id shapes: ${input.eventIds.other}.`);
  if (input.sources.catalogJsonFallback) reasons.push("A catalog repository still has a JSON fallback.");
  if (!input.sources.demoUsesJsonStore || !input.sources.demoFile) {
    reasons.push("demo.repository is not JSON-only nac-demo.json.");
  }
  if (input.sources.migration002OnDisk) reasons.push("Migration 002 exists on disk.");
  if (input.sources.p15UmbrellaDoc) reasons.push("docs/p15.md exists; P15 slices must stay numbered.");
  if (!input.sources.libUtilsPresent) reasons.push("lib/utils.ts is missing.");
  if (input.sources.p16Doc) {
    deferred.push("P16 final closure document is present.");
  } else {
    deferred.push("P16 / final close is not started.");
  }

  if (input.emptyPhoneCount >= 2) {
    deferred.push(`UNIQUE(phone) stays BLOCKED: ${input.emptyPhoneCount} empty phones.`);
  } else if (input.emptyPhoneCount === 1) {
    deferred.push("One empty phone remains. UNIQUE(phone) is still optional.");
  }
  if (input.duplicatePhones > 0) {
    deferred.push(`Non-empty duplicate phones: ${input.duplicatePhones}. UNIQUE(phone) would fail.`);
  }
  deferred.push("FK not present and not required for closure.");
  deferred.push("P14/P15 operator tools stay until after this audit (cleanup is a later GO).");

  return { go: reasons.length ? "NO-GO" : "GO", reasons, deferred };
}

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function runP15_5Audit(client: QueryClient, sources = inspectP15_5Sources()): Promise<P15_5Report> {
  const tables = (await client.query(P15_5_SELECT_SQL.tables)).rows.map((row) => String(row.table_name || ""));
  const counts = asCounts((await client.query(P15_5_SELECT_SQL.counts)).rows[0]);
  const workspaceOrphans = n((await client.query(P15_5_SELECT_SQL.workspaceOrphans)).rows[0]);
  const guardOrphans = n((await client.query(P15_5_SELECT_SQL.guardOrphans)).rows[0]);
  const eventOrphans = n((await client.query(P15_5_SELECT_SQL.eventOrphans)).rows[0]);
  const workspaceEmails = (await client.query(P15_5_SELECT_SQL.workspaceEmails)).rows.map((row) =>
    String(row.email || "").toLowerCase(),
  );
  const foreignKeyCount = (await client.query(P15_5_SELECT_SQL.foreignKeys)).rows.length;
  const extraUnique = (await client.query(P15_5_SELECT_SQL.extraUnique)).rows.map((row) => ({
    table: String(row.table_name || ""),
    name: String(row.constraint_name || ""),
  }));
  const appliedMigrations = (await client.query(P15_5_SELECT_SQL.migrations)).rows.map((row) => String(row.id || ""));
  const indexNames = (await client.query(P15_5_SELECT_SQL.indexes)).rows.map((row) => String(row.indexname || ""));
  const merchantEmailMismatch = n((await client.query(P15_5_SELECT_SQL.merchantEmailMismatch)).rows[0]);
  const merchantBadPayload = n((await client.query(P15_5_SELECT_SQL.merchantBadPayload)).rows[0]);
  const workspaceOwnerMismatch = n((await client.query(P15_5_SELECT_SQL.workspaceOwnerMismatch)).rows[0]);
  const workspaceMissingFiles = n((await client.query(P15_5_SELECT_SQL.workspaceMissingFiles)).rows[0]);
  const eventBadPayload = n((await client.query(P15_5_SELECT_SQL.eventBadPayload)).rows[0]);
  const idRow = (await client.query(P15_5_SELECT_SQL.eventIdShapes)).rows[0];
  const emptyPhoneCount = n((await client.query(P15_5_SELECT_SQL.emptyPhones)).rows[0]);
  const emptyPhoneEmails = (await client.query(P15_5_SELECT_SQL.emptyPhoneEmails)).rows.map((row) =>
    String(row.email || ""),
  );
  const duplicatePhones = n((await client.query(P15_5_SELECT_SQL.duplicatePhones)).rows[0]);

  const evidence: P15_5Evidence = {
    tables,
    counts,
    workspaceOrphans,
    guardOrphans,
    eventOrphans,
    workspaceEmails,
    foreignKeyCount,
    extraUnique,
    appliedMigrations,
    indexNames,
    merchantEmailMismatch,
    merchantBadPayload,
    workspaceOwnerMismatch,
    workspaceMissingFiles,
    eventBadPayload,
    eventIds: {
      sha256: Number(idRow?.sha256 ?? 0),
      uuid: Number(idRow?.uuid ?? 0),
      other: Number(idRow?.other ?? 0),
    },
    emptyPhoneCount,
    emptyPhoneEmails,
    duplicatePhones,
    sources,
  };
  const classified = classifyP15_5(evidence);
  return {
    evaluatedAt: new Date().toISOString(),
    go: classified.go,
    readyForCleanupThenP16: classified.go === "GO",
    reasons:
      classified.go === "GO"
        ? ["PostgreSQL is the catalog source of truth. Orphans are zero. Schema and repositories match the P15.4 close state."]
        : classified.reasons,
    deferred: classified.deferred,
    postgresMutated: false,
    rowsDeleted: 0,
    foreignKeysAdded: 0,
    uniqueConstraintsAdded: 0,
    migration002: false,
    p16_started: false,
    evidence,
  };
}
