import type { AdminUserRow } from "@/lib/admin/types";

export const GUARD_REASON_LABEL: Record<string, string> = {
  clean: "نظيف",
  sim_swap: "تبديل شريحة",
  device_swap: "تبديل جهاز",
  location_mismatch: "عدم تطابق الموقع",
  location_soft: "موقع مشكوك",
  location_unknown: "موقع غير معروف",
  account_frozen: "حساب مجمّد",
  need_number_verification: "تحقق الرقم",
  missing_phone: "بدون جوال",
  financial_risk: "مخاطرة مالية",
  check_failed: "فشل الفحص",
};

export function guardSecurityLabel(user: AdminUserRow) {
  if (user.guardFrozen) {
    const reason = GUARD_REASON_LABEL[user.guardReason] || user.guardReason || "Smart Guard";
    return { tone: "danger" as const, text: `مجمّد — ${reason}` };
  }
  if (user.latestGuardDecision === "step_up") {
    const reason = GUARD_REASON_LABEL[user.latestGuardReason] || "تحقق إضافي";
    return { tone: "warning" as const, text: `تحقق إضافي — ${reason}` };
  }
  if (user.latestGuardDecision === "freeze") {
    return { tone: "danger" as const, text: "تجميد (سابق)" };
  }
  if (user.latestGuardDecision === "allow") {
    return { tone: "success" as const, text: "دخول طبيعي" };
  }
  if (user.lastLoginAt) {
    return { tone: "success" as const, text: "مسجّل — بدون فحص Guard" };
  }
  return { tone: "info" as const, text: "لم يسجّل دخول بعد" };
}

export function isUserFrozen(user: Pick<AdminUserRow, "guardFrozen">) {
  return user.guardFrozen;
}

export function hasGuardIssue(
  user: Pick<AdminUserRow, "guardFrozen" | "latestGuardDecision" | "latestGuardReason">,
) {
  if (user.guardFrozen) return false;
  if (user.latestGuardDecision === "step_up") return true;
  if (user.latestGuardDecision === "freeze") return true;
  if (user.latestGuardReason === "check_failed" || user.latestGuardReason === "financial_risk") return true;
  return false;
}

export function filterUsersRegisteredInRange(
  users: AdminUserRow[],
  start: Date,
  end: Date,
) {
  return users.filter((user) => {
    const t = new Date(user.registeredAt).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}
