import type { StoredAccount } from "@/server/repositories/user.repository";
import { AppError } from "@/server/errors";

export function assertAccountActive(account: StoredAccount | null) {
  if (!account) throw new AppError("الحساب غير موجود.", 404);
  if (account.status === "inactive" || account.status === "churned") {
    throw new AppError("هذا الحساب معطّل. راجعي مديرة المنصة.", 403);
  }
  return account;
}

export function assertAdminRole(role: string) {
  if (role !== "admin") throw new AppError("هذه العملية للمسؤول فقط.", 403);
}
