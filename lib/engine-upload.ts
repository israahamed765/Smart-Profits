/**
 * P8: upload ingest moved to `@/server/financial-engine/upload`.
 * Intentionally not a compatibility re-export (would leak parser into any Client import of this path).
 * Do not re-export this from lib/engine.ts, lib/utils.ts, or any Client barrel.
 */
export {};
