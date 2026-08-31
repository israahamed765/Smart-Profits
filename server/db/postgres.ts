import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export const PG_STATEMENT_TIMEOUT_MS = 8_000;
export const PG_CONNECT_BACKOFF_MS = 5_000;

let pool: Pool | null = null;
let downUntil = 0;

export function databaseUrl() {
  return (process.env.DATABASE_URL || "").trim();
}

export function postgresConfigured() {
  return Boolean(databaseUrl());
}

const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNRESET",
  "EPIPE",
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);

export function isPostgresConnectivityError(error: unknown) {
  return CONNECT_CODES.has(String((error as { code?: string })?.code || ""));
}

export function getPool() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 1500,
      statement_timeout: PG_STATEMENT_TIMEOUT_MS,
    });
  }
  return pool;
}

/**
 * Request-path query helper.
 * Never throws to repositories; driver errors become null.
 * Connectivity failures back off for PG_CONNECT_BACKOFF_MS.
 * Query/statement errors fail that request only — they do not poison the pool.
 * Catalog repositories (P14.18) treat null as a hard failure — no JSON fallback.
 * Schema is applied by `npm run db:migrate`, not from this function.
 */
export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T> | null> {
  if ((process.env.SMARTPROFIT_DATA_DIR || "").trim() && process.env.SMARTPROFIT_TEST_PG !== "1") {
    return null;
  }
  if (Date.now() < downUntil) return null;
  const current = getPool();
  if (!current) return null;
  try {
    const result = await current.query<T>(text, values);
    downUntil = 0;
    return result;
  } catch (error) {
    if (isPostgresConnectivityError(error)) {
      downUntil = Date.now() + PG_CONNECT_BACKOFF_MS;
    }
    console.warn("[smart-guard] PostgreSQL unavailable.", error);
    return null;
  }
}

type TransactionQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
) => Promise<QueryResult<T>>;

/**
 * One client, one transaction. Used by upsertAccount so SELECT FOR UPDATE
 * and the following upsert share a lock. Same failure shape as queryPostgres:
 * driver errors become null; connectivity errors back off; no JSON fallback.
 */
export async function withPostgresTransaction<T>(
  fn: (query: TransactionQuery) => Promise<T>,
): Promise<T | null> {
  if ((process.env.SMARTPROFIT_DATA_DIR || "").trim() && process.env.SMARTPROFIT_TEST_PG !== "1") {
    return null;
  }
  if (Date.now() < downUntil) return null;
  const current = getPool();
  if (!current) return null;
  let client: PoolClient | null = null;
  try {
    client = await current.connect();
    await client.query("BEGIN");
    const query: TransactionQuery = (text, values = []) => client!.query(text, values);
    const result = await fn(query);
    await client.query("COMMIT");
    downUntil = 0;
    return result;
  } catch (error) {
    try {
      await client?.query("ROLLBACK");
    } catch {
      // keep the original error
    }
    if (isPostgresConnectivityError(error)) {
      downUntil = Date.now() + PG_CONNECT_BACKOFF_MS;
    }
    console.warn("[smart-guard] PostgreSQL unavailable.", error);
    return null;
  } finally {
    client?.release();
  }
}

export function requirePostgres<T>(result: T | null, what: string): T {
  if (result == null) {
    throw new Error(`Could not ${what}.`);
  }
  return result;
}
