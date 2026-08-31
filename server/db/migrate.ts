import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

const FILE_PATTERN = /^(\d+)_.+\.sql$/;

export type MigrationClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type MigrationPool = {
  connect: () => Promise<MigrationClient & { release: () => void | Promise<void> }>;
};

export type MigrationRunResult = {
  applied: string[];
  skipped: string[];
};

const HISTORY_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

export function listMigrationFiles(dir = DEFAULT_MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .sort((a, b) => {
      const left = Number(FILE_PATTERN.exec(a)?.[1] ?? 0);
      const right = Number(FILE_PATTERN.exec(b)?.[1] ?? 0);
      if (left !== right) return left - right;
      return a.localeCompare(b);
    });
}

async function appliedIds(client: MigrationClient): Promise<Set<string>> {
  const result = await client.query("SELECT id FROM schema_migrations");
  return new Set(result.rows.map((row) => String(row.id)));
}

async function applyOne(pool: MigrationPool, id: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // keep the original error
      }
      throw error;
    }
  } finally {
    await client.release();
  }
}

export async function runMigrations(input: { pool: MigrationPool | Pool; dir?: string }): Promise<MigrationRunResult> {
  const dir = input.dir ?? DEFAULT_MIGRATIONS_DIR;
  const pool = input.pool as MigrationPool;
  const setup = await pool.connect();
  try {
    await setup.query(HISTORY_DDL);
  } finally {
    await setup.release();
  }

  const files = listMigrationFiles(dir);
  const probe = await pool.connect();
  let done: Set<string>;
  try {
    done = await appliedIds(probe);
  } finally {
    await probe.release();
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    await applyOne(pool, file, sql);
    applied.push(file);
    done.add(file);
  }
  return { applied, skipped };
}
