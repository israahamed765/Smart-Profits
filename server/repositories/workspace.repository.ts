import { normalizeEmail } from "@/shared/identity";
import type { PersistedWorkspace } from "@/lib/financial-engine/serialization";
import { queryPostgres, requirePostgres } from "@/server/db/postgres";

async function loadWorkspacePg(email: string) {
  const result = await queryPostgres<{ payload: PersistedWorkspace }>(
    "SELECT payload FROM workspaces WHERE email = $1",
    [normalizeEmail(email)],
  );
  if (!result) return null;
  return result;
}

export async function saveWorkspace(email: string, workspace: PersistedWorkspace) {
  const key = normalizeEmail(email);
  const payload = { ...workspace, ownerEmail: key, savedAt: new Date().toISOString() };
  requirePostgres(
    await queryPostgres(
      `INSERT INTO workspaces (email, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (email) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [key, JSON.stringify(payload)],
    ),
    "persist the workspace to the database",
  );
  return payload;
}

export async function loadWorkspace(email: string): Promise<PersistedWorkspace | null> {
  const result = requirePostgres(await loadWorkspacePg(email), "read the workspace from the database");
  const fromPg = result.rows[0]?.payload ?? null;
  return fromPg?.files ? fromPg : null;
}

export async function listWorkspaces(): Promise<Array<{ email: string; workspace: PersistedWorkspace }>> {
  const result = requirePostgres(
    await queryPostgres<{ email: string; payload: PersistedWorkspace }>("SELECT email, payload FROM workspaces"),
    "read workspaces from the database",
  );
  return result.rows
    .filter((row) => row.payload?.files)
    .map((row) => ({ email: row.email.toLowerCase(), workspace: row.payload }));
}
