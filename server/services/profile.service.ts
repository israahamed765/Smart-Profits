import { normalizeMobile } from "@/shared/phone";
import { AppError } from "@/server/errors";
import { assertAccountActive } from "@/server/middleware/authorize";
import {
  findAccount,
  findAccountByPhone,
  publicAccount,
  upsertAccount,
} from "@/server/repositories/user.repository";

export async function getProfile(email: string) {
  const account = assertAccountActive(await findAccount(email));
  return {
    ...publicAccount(account),
    homeLat: account.homeLat ?? null,
    homeLng: account.homeLng ?? null,
  };
}

export async function updateProfile(
  email: string,
  patch: {
    fullName?: string;
    storeName?: string;
    phone?: string;
    homeLat?: number | null;
    homeLng?: number | null;
  },
) {
  const existing = assertAccountActive(await findAccount(email));

  let phone = existing.phone || "";
  if (patch.phone !== undefined) {
    const normalized = normalizeMobile(patch.phone);
    if (!normalized) {
      throw new AppError("رقم الجوال غير صالح. استخدمي الصيغة الدولية مثل +97059XXXXXXX.", 400);
    }
    const taken = await findAccountByPhone(normalized, email);
    if (taken) throw new AppError("رقم الجوال مرتبط بحساب آخر.", 409);
    phone = normalized;
  }

  const saved = await upsertAccount({
    email,
    fullName: patch.fullName !== undefined ? patch.fullName.trim() : existing.fullName,
    storeName: patch.storeName !== undefined ? patch.storeName.trim() : existing.storeName,
    phone,
    homeLat: patch.homeLat !== undefined ? patch.homeLat ?? undefined : existing.homeLat,
    homeLng: patch.homeLng !== undefined ? patch.homeLng ?? undefined : existing.homeLng,
    lastActive: new Date().toISOString(),
  });

  return {
    ...publicAccount(saved),
    homeLat: saved.homeLat ?? null,
    homeLng: saved.homeLng ?? null,
  };
}
