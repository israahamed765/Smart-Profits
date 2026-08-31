/**
 * P3/P9: Postgres lives in `@/server/db/postgres`.
 * Intentionally not a compatibility re-export (would leak `pg` / DATABASE_URL into any Client import).
 */
export {};
