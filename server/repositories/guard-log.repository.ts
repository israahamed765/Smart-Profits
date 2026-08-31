import { randomUUID } from "crypto";
import { queryPostgres, requirePostgres } from "@/server/db/postgres";
import type {
  GuardDecision,
  GuardDecisionLog,
  GuardReason,
  GuardVerdict,
  SensitiveAction,
} from "@/lib/smart-guard/types";

export type { GuardDecisionLog };
export type GuardLogMeta = {
  ip?: string;
  userAgent?: string;
};

function toLog(input: {
  email: string;
  phone: string;
  verdict: GuardVerdict;
  meta?: GuardLogMeta;
}): GuardDecisionLog {
  return {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone || "",
    action: input.verdict.action,
    decision: input.verdict.decision,
    reason: input.verdict.reason,
    summary: input.verdict.summary,
    simSwapRecent: input.verdict.inputs.simSwapRecent,
    simSwapHoursAgo: input.verdict.inputs.simSwapHoursAgo,
    locationResult: input.verdict.inputs.locationResult,
    locationMatch: input.verdict.inputs.locationMatch,
    locationMatchRate: input.verdict.inputs.locationMatchRate,
    numberVerified: input.verdict.inputs.numberVerified,
    nacMode: input.verdict.inputs.nacMode,
    frozenAt: input.verdict.decision === "freeze" ? input.verdict.at : null,
    traces: input.verdict.traces,
    ip: input.meta?.ip || "",
    userAgent: input.meta?.userAgent || "",
    createdAt: input.verdict.at,
  };
}

export async function appendGuardDecision(input: {
  email: string;
  phone: string;
  verdict: GuardVerdict;
  meta?: GuardLogMeta;
}): Promise<GuardDecisionLog> {
  const row = toLog(input);
  requirePostgres(
    await queryPostgres(
      `INSERT INTO guard_decisions (
      id, email, phone, action, decision, reason, summary,
      sim_swap_recent, sim_swap_hours_ago, location_result, location_match,
      location_match_rate, number_verified, nac_mode, frozen_at, traces, ip, user_agent, created_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
    )`,
      [
        row.id,
        row.email,
        row.phone,
        row.action,
        row.decision,
        row.reason,
        row.summary,
        row.simSwapRecent,
        row.simSwapHoursAgo,
        row.locationResult,
        row.locationMatch,
        row.locationMatchRate,
        row.numberVerified,
        row.nacMode,
        row.frozenAt,
        JSON.stringify(row.traces ?? []),
        row.ip,
        row.userAgent,
        row.createdAt,
      ],
    ),
    "persist the guard decision to the database",
  );
  return row;
}

function mapPgRow(row: Record<string, unknown>): GuardDecisionLog {
  const rawTraces = row.traces;
  const traces =
    typeof rawTraces === "string"
      ? (JSON.parse(rawTraces) as GuardVerdict["traces"])
      : Array.isArray(rawTraces)
        ? (rawTraces as GuardVerdict["traces"])
        : undefined;
  return {
    id: String(row.id),
    email: String(row.email),
    phone: String(row.phone || ""),
    action: row.action as SensitiveAction,
    decision: row.decision as GuardDecision,
    reason: row.reason as GuardReason,
    summary: String(row.summary || ""),
    simSwapRecent: Boolean(row.sim_swap_recent),
    simSwapHoursAgo: typeof row.sim_swap_hours_ago === "number" ? row.sim_swap_hours_ago : null,
    locationResult: (row.location_result as GuardDecisionLog["locationResult"]) ?? null,
    locationMatch: typeof row.location_match === "boolean" ? row.location_match : null,
    locationMatchRate: typeof row.location_match_rate === "number" ? row.location_match_rate : null,
    numberVerified: typeof row.number_verified === "boolean" ? row.number_verified : null,
    nacMode: String(row.nac_mode || ""),
    frozenAt: row.frozen_at ? new Date(String(row.frozen_at)).toISOString() : null,
    traces,
    ip: String(row.ip || ""),
    userAgent: String(row.user_agent || ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listGuardDecisions(input: { email?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const email = input.email?.trim().toLowerCase();
  const pg = email
    ? await queryPostgres(
        `SELECT * FROM guard_decisions WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
        [email, limit],
      )
    : await queryPostgres(`SELECT * FROM guard_decisions ORDER BY created_at DESC LIMIT $1`, [limit]);

  const result = requirePostgres(pg, "read guard decisions from the database");
  return {
    backend: "postgres" as const,
    configured: true,
    rows: result.rows.map((row) => mapPgRow(row)),
  };
}
