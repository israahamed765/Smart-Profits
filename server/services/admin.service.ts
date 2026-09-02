import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { isHashedPassword } from "@/server/crypto/password";
import { publicAccount, readAccounts, upsertAccount } from "@/server/repositories/user.repository";
import { listWorkspaces } from "@/server/repositories/workspace.repository";
import { readEventsAll } from "@/server/repositories/event.repository";
import { listGuardDecisions } from "@/server/repositories/guard-log.repository";
import type { AdminFacts } from "@/lib/admin/types";
import type { AccountStatus, PlanTier } from "@/lib/admin/config";
import type { GuardDecision } from "@/lib/smart-guard/types";

function adminCredentials() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME?.trim() || "مديرة Smart Profits";
  if (!email || !password) return null;
  return { email, password, name };
}

export function getAdminLoginHint() {
  return adminCredentials()?.email ?? "";
}

export function loginAdmin(email: string, password: string) {
  const admin = adminCredentials();
  if (!admin) throw new AppError("حساب الإدارة غير مُعد على الخادم.", 503);

  const emailOk = email.trim().toLowerCase() === admin.email;
  const left = Buffer.from(password);
  const right = Buffer.from(admin.password);
  const passwordOk = left.length === right.length && timingSafeEqual(left, right);
  if (!emailOk || !passwordOk) throw new AppError("بيانات دخول الإدارة غير صحيحة.", 401);

  return { email: admin.email, name: admin.name };
}

function adminPasswordDisplay(stored: string) {
  if (!stored) return { kind: "missing" as const, display: "—" };
  if (isHashedPassword(stored)) return { kind: "hashed" as const, display: "•••••• (مشفّرة)" };
  return { kind: "plain" as const, display: stored };
}

export async function adminSnapshot(): Promise<AdminFacts> {
  const accounts = await readAccounts();
  const events = await readEventsAll();
  const workspaces = await listWorkspaces();

  const guardResult = await listGuardDecisions({ limit: 1000 });
  const latestGuardByEmail = new Map<string, { decision: GuardDecision; reason: string; summary: string; at: string }>();
  for (const row of guardResult.rows) {
    if (!latestGuardByEmail.has(row.email)) {
      latestGuardByEmail.set(row.email, {
        decision: row.decision,
        reason: row.reason,
        summary: row.summary,
        at: row.createdAt,
      });
    }
  }

  const lastLoginByEmail = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "login" || !event.email) continue;
    const email = event.email.toLowerCase();
    const at = new Date(event.at).toISOString();
    const prev = lastLoginByEmail.get(email);
    if (!prev || at > prev) lastLoginByEmail.set(email, at);
  }

  return {
    users: accounts.map((account) => {
      const email = account.email.toLowerCase();
      const password = adminPasswordDisplay(account.password || "");
      const latestGuard = latestGuardByEmail.get(email);
      return {
        fullName: account.fullName,
        storeName: account.storeName,
        email: account.email,
        phone: account.phone || "",
        passwordDisplay: password.display,
        passwordKind: password.kind,
        createdAt: account.createdAt,
        lastActive: account.lastActive,
        lastLoginAt: lastLoginByEmail.get(email),
        plan: account.plan,
        status: account.status,
        guardFrozen: Boolean(account.guardFrozen),
        guardReason: account.guardReason || "",
        guardFrozenAt: account.guardFrozenAt || "",
        latestGuardDecision: latestGuard?.decision,
        latestGuardReason: latestGuard?.reason || "",
        latestGuardSummary: latestGuard?.summary || "",
        latestGuardAt: latestGuard?.at,
      };
    }),
    events,
    workspaces: workspaces.map(({ email, workspace }) => ({
      email,
      workspace: {
        ...workspace,
        actionLog: [],
        files: workspace.files.map((file) => ({
          ...file,
          parseResult: {
            ...file.parseResult,
            transactions: [],
          },
        })),
      },
    })),
  };
}

export async function patchMerchantAccount(input: {
  email: string;
  plan?: PlanTier;
  status?: AccountStatus;
}) {
  const saved = await upsertAccount({
    email: input.email,
    plan: input.plan,
    status: input.status,
  });
  return publicAccount(saved);
}
