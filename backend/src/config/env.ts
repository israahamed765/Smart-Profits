import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./paths";

/**
 * Server-only env for the standalone backend process.
 * Never expose these via NEXT_PUBLIC_*.
 *
 * Required to verify merchant cookies: SESSION_SECRET
 * Optional dual-write: DATABASE_URL (same Postgres as Next.js)
 * Listen: BACKEND_PORT (default 4000)
 * Next BFF proxy (optional, Next.js process only): BACKEND_URL
 */
export function loadBackendEnv() {
  const file = join(repoRoot(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function backendPort() {
  const raw = Number(process.env.BACKEND_PORT || 4000);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}

export function backendListenHost() {
  // localhost (not 127.0.0.1): host-only cookies set on the Next.js origin (`localhost`) are sent here.
  return process.env.BACKEND_HOST?.trim() || "localhost";
}
