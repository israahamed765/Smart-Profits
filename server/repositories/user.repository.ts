import type { AccountStatus, PlanTier } from "@/lib/admin/config";
import { queryPostgres, requirePostgres, withPostgresTransaction } from "@/server/db/postgres";
import { normalizeEmail } from "@/shared/identity";

export interface StoredAccount {
  fullName: string;
  storeName: string;
  email: string;
  phone: string;
  password: string;
  createdAt: string;
  lastActive?: string;
  plan?: PlanTier;
  status?: AccountStatus;
  guardFrozen?: boolean;
  guardFrozenAt?: string;
  guardReason?: string;
  homeLat?: number;
  homeLng?: number;
  resetCodeHash?: string;
  resetCodeExpiresAt?: string;
}

async function readAccountsPg() {
  const result = await queryPostgres<{ payload: StoredAccount }>("SELECT payload FROM merchants");
  if (!result) return null;
  return result.rows.map((row) => row.payload).filter(Boolean);
}

function mergeAccount(
  account: Partial<StoredAccount> & { email: string },
  previous: StoredAccount | null,
  email: string,
): StoredAccount {
  return {
    fullName: account.fullName ?? previous?.fullName ?? "",
    storeName: account.storeName ?? previous?.storeName ?? "",
    email,
    phone: account.phone ?? previous?.phone ?? "",
    password: account.password ?? previous?.password ?? "",
    createdAt: previous?.createdAt ?? account.createdAt ?? new Date().toISOString(),
    lastActive: account.lastActive ?? previous?.lastActive ?? new Date().toISOString(),
    plan: account.plan ?? previous?.plan ?? "free",
    status: account.status ?? previous?.status ?? "active",
    guardFrozen: account.guardFrozen ?? previous?.guardFrozen ?? false,
    guardFrozenAt:
      account.guardFrozenAt !== undefined ? account.guardFrozenAt || undefined : previous?.guardFrozenAt,
    guardReason: account.guardReason ?? previous?.guardReason,
    homeLat: account.homeLat ?? previous?.homeLat,
    homeLng: account.homeLng ?? previous?.homeLng,
    resetCodeHash: account.resetCodeHash !== undefined ? account.resetCodeHash : previous?.resetCodeHash,
    resetCodeExpiresAt:
      account.resetCodeExpiresAt !== undefined ? account.resetCodeExpiresAt : previous?.resetCodeExpiresAt,
  };
}

export async function readAccounts(): Promise<StoredAccount[]> {
  return requirePostgres(await readAccountsPg(), "read accounts from the database");
}

export async function upsertAccount(account: Partial<StoredAccount> & { email: string }) {
  const email = normalizeEmail(account.email);
  const saved = await withPostgresTransaction(async (query) => {
    const locked = await query<{ payload: StoredAccount }>(
      "SELECT payload FROM merchants WHERE email = $1 FOR UPDATE",
      [email],
    );
    const next = mergeAccount(account, locked.rows[0]?.payload ?? null, email);
    await query(
      `INSERT INTO merchants (email, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (email) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [next.email, JSON.stringify(next)],
    );
    return next;
  });
  return requirePostgres(saved, "read accounts from the database");
}

export async function findAccount(email: string) {
  const result = requirePostgres(
    await queryPostgres<{ payload: StoredAccount }>("SELECT payload FROM merchants WHERE email = $1", [
      normalizeEmail(email),
    ]),
    "read accounts from the database",
  );
  return result.rows[0]?.payload ?? null;
}

export async function findAccountByPhone(phone: string, exceptEmail?: string) {
  if (!phone) return null;
  const skip = exceptEmail ? normalizeEmail(exceptEmail) : undefined;
  const result = requirePostgres(
    await queryPostgres<{ payload: StoredAccount }>(
      skip
        ? "SELECT payload FROM merchants WHERE payload->>'phone' = $1 AND email <> $2"
        : "SELECT payload FROM merchants WHERE payload->>'phone' = $1",
      skip ? [phone, skip] : [phone],
    ),
    "read accounts from the database",
  );
  return result.rows[0]?.payload ?? null;
}

export function publicAccount(account: StoredAccount) {
  return {
    fullName: account.fullName,
    storeName: account.storeName,
    email: account.email,
    phone: account.phone || "",
    createdAt: account.createdAt,
    lastActive: account.lastActive,
    plan: account.plan ?? "free",
    status: account.status ?? "active",
    guardFrozen: Boolean(account.guardFrozen),
    guardReason: account.guardReason ?? "",
  };
}
