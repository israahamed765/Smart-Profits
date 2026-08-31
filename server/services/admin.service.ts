import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { publicAccount, readAccounts, upsertAccount } from "@/server/repositories/user.repository";
import { listWorkspaces } from "@/server/repositories/workspace.repository";
import { readEventsAll } from "@/server/repositories/event.repository";
import type { AdminFacts } from "@/lib/admin/types";
import type { AccountStatus, PlanTier } from "@/lib/admin/config";

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

export async function adminSnapshot(): Promise<AdminFacts> {
  const accounts = await readAccounts();
  const events = await readEventsAll();
  const workspaces = await listWorkspaces();

  return {
    users: accounts.map((account) => ({
      fullName: account.fullName,
      storeName: account.storeName,
      email: account.email,
      createdAt: account.createdAt,
      lastActive: account.lastActive,
      plan: account.plan,
      status: account.status,
    })),
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
