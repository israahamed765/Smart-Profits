import { AppError } from "@/server/errors";
import { readAdminSession, readMerchantSession } from "@/server/crypto/session-core";

export async function requireMerchant(request: Request) {
  const session = await readMerchantSession(request);
  if (!session) throw new AppError("يجب تسجيل الدخول أولاً.", 401);
  return session;
}

export async function optionalMerchant(request: Request) {
  return readMerchantSession(request);
}

export async function requireAdmin(request: Request) {
  const session = await readAdminSession(request);
  if (!session) throw new AppError("غير مصرح. سجّلي دخول الإدارة.", 401);
  return session;
}
