import { randomInt } from "node:crypto";
import { normalizeMobile } from "@/shared/phone";
import { isMailConfigured, sendResetCodeEmail } from "@/server/mail/send-password-email";
import { AppError } from "@/server/errors";
import { hashPassword, isHashedPassword, verifyPassword } from "@/server/crypto/password";
import { assertAccountActive } from "@/server/middleware/authorize";
import {
  findAccount,
  findAccountByPhone,
  publicAccount,
  upsertAccount,
  type StoredAccount,
} from "@/server/repositories/user.repository";

export async function listRegisterAvailabilityIssues(
  email: string,
  phone: string,
): Promise<Array<{ code: "phone" | "emailTaken" | "phoneTaken"; message: string }>> {
  const emailNorm = email.trim().toLowerCase();
  const phoneNorm = normalizeMobile(phone);
  const issues: Array<{ code: "phone" | "emailTaken" | "phoneTaken"; message: string }> = [];

  if (!phoneNorm) {
    issues.push({
      code: "phone",
      message: "رقم الجوال غير صالح. استخدمي الصيغة الدولية مثل +97059XXXXXXX.",
    });
  }

  const existing = await findAccount(emailNorm);
  if (existing) {
    issues.push({
      code: "emailTaken",
      message: "هذا البريد مسجّل مسبقاً. سجّلي الدخول.",
    });
  }

  if (phoneNorm) {
    const taken = await findAccountByPhone(phoneNorm);
    if (taken) {
      issues.push({
        code: "phoneTaken",
        message: "رقم الجوال مرتبط بحساب آخر.",
      });
    }
  }

  return issues;
}

export async function assertRegisterAvailable(email: string, phone: string) {
  const issues = await listRegisterAvailabilityIssues(email, phone);
  if (!issues.length) return;
  const status = issues.some((issue) => issue.code === "phone") ? 400 : 409;
  const err = new AppError(issues[0].message, status);
  (err as AppError & { codes?: string[] }).codes = issues.map((issue) => issue.code);
  throw err;
}

export async function registerMerchant(input: {
  fullName: string;
  storeName: string;
  email: string;
  phone: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const phone = normalizeMobile(input.phone);
  if (!phone) throw new AppError("رقم الجوال غير صالح. استخدمي الصيغة الدولية مثل +97059XXXXXXX.", 400);

  const existing = await findAccount(email);
  if (existing) throw new AppError("هذا البريد مسجّل مسبقاً. سجّلي الدخول.", 409);

  const taken = await findAccountByPhone(phone);
  if (taken) throw new AppError("رقم الجوال مرتبط بحساب آخر.", 409);

  const now = new Date().toISOString();
  const saved = await upsertAccount({
    fullName: input.fullName.trim(),
    storeName: input.storeName.trim(),
    email,
    phone,
    password: await hashPassword(input.password),
    createdAt: now,
    lastActive: now,
    plan: "free",
    status: "active",
  });
  return publicAccount(saved);
}

export async function loginMerchant(email: string, password: string) {
  const account = await findAccount(email);
  if (!account || !(await verifyPassword(password, account.password))) {
    throw new AppError("بيانات الدخول غير صحيحة.", 401);
  }
  assertAccountActive(account);

  let saved = account;
  if (!isHashedPassword(account.password)) {
    saved = await upsertAccount({
      email: account.email,
      password: await hashPassword(password),
      lastActive: new Date().toISOString(),
      status: "active",
    });
  } else {
    saved = await upsertAccount({
      email: account.email,
      lastActive: new Date().toISOString(),
      status: "active",
    });
  }
  return publicAccount(saved);
}

export async function currentMerchant(email: string) {
  const account = assertAccountActive(await findAccount(email));
  return publicAccount(account);
}

export async function requestPasswordReset(email: string) {
  const account = await findAccount(email);
  if (!account) throw new AppError("هذا البريد غير مسجّل في المنصة. أنشئ حساباً أولاً.", 404);

  const code = String(randomInt(100000, 999999));
  await upsertAccount({
    email: account.email,
    resetCodeHash: await hashPassword(code),
    resetCodeExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  if (isMailConfigured()) {
    await sendResetCodeEmail(account.email, code, account.fullName);
    return { emailed: true as const, demoCode: undefined as string | undefined };
  }

  return {
    emailed: false as const,
    demoCode: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function resetMerchantPassword(email: string, code: string, password: string) {
  const account = await findAccount(email);
  if (!account?.resetCodeHash || !account.resetCodeExpiresAt) {
    throw new AppError("اطلبي كود إعادة التعيين أولاً.", 400);
  }
  if (new Date(account.resetCodeExpiresAt).getTime() < Date.now()) {
    throw new AppError("انتهت صلاحية الكود. اطلبي كوداً جديداً.", 400);
  }
  const ok = await verifyPassword(code, account.resetCodeHash);
  if (!ok) throw new AppError("كود إعادة التعيين غير صحيح.", 400);

  const saved = await upsertAccount({
    email: account.email,
    password: await hashPassword(password),
    resetCodeHash: "",
    resetCodeExpiresAt: "",
    lastActive: new Date().toISOString(),
    status: "active",
  });
  return publicAccount(saved);
}

export function toAuthUser(account: ReturnType<typeof publicAccount>) {
  return {
    fullName: account.fullName,
    storeName: account.storeName,
    email: account.email,
    phone: account.phone,
  };
}

export type PublicMerchant = ReturnType<typeof publicAccount>;
export type MerchantRecord = StoredAccount;
