import type { AdminUserRow } from "@/lib/admin/types";

export const GUARD_REASON_LABEL: Record<string, { ar: string; en: string }> = {
  clean: { ar: "نظيف", en: "Clean" },
  sim_swap: { ar: "تبديل شريحة", en: "SIM swap" },
  device_swap: { ar: "تبديل جهاز", en: "Device swap" },
  location_mismatch: { ar: "عدم تطابق الموقع", en: "Location mismatch" },
  location_soft: { ar: "موقع مشكوك", en: "Soft location doubt" },
  location_unknown: { ar: "موقع غير معروف", en: "Location unknown" },
  account_frozen: { ar: "حساب مجمّد", en: "Account frozen" },
  need_number_verification: { ar: "تحقق الرقم", en: "Number verification" },
  missing_phone: { ar: "بدون جوال", en: "Missing phone" },
  financial_risk: { ar: "مخاطرة مالية", en: "Financial risk" },
  check_failed: { ar: "فشل الفحص", en: "Check failed" },
};

export function guardSecurityLabel(user: AdminUserRow, locale: "ar" | "en" = "ar") {
  const en = locale === "en";
  const reasonLabel = (reason?: string) =>
    (reason && GUARD_REASON_LABEL[reason]?.[locale]) || reason || "Smart Guard";

  if (user.guardFrozen || user.latestGuardDecision === "freeze") {
    return {
      tone: "danger" as const,
      text: en
        ? `Frozen — ${reasonLabel(user.guardReason || user.latestGuardReason)}`
        : `مجمّد — ${reasonLabel(user.guardReason || user.latestGuardReason)}`,
    };
  }
  if (user.latestGuardDecision === "step_up") {
    return {
      tone: "warning" as const,
      text: en
        ? `Step-up — ${reasonLabel(user.latestGuardReason)}`
        : `تحقق إضافي — ${reasonLabel(user.latestGuardReason)}`,
    };
  }
  if (user.latestGuardDecision === "allow") {
    return { tone: "success" as const, text: en ? "Normal access" : "دخول طبيعي" };
  }
  if (user.lastLoginAt) {
    return {
      tone: "success" as const,
      text: en ? "Signed in — no Guard flag" : "مسجّل — بدون فحص Guard",
    };
  }
  return { tone: "info" as const, text: en ? "No login yet" : "لم يسجّل دخول بعد" };
}

export function isUserFrozen(
  user: Pick<AdminUserRow, "guardFrozen" | "latestGuardDecision">,
) {
  return Boolean(user.guardFrozen) || user.latestGuardDecision === "freeze";
}

export function hasGuardIssue(
  user: Pick<AdminUserRow, "guardFrozen" | "latestGuardDecision" | "latestGuardReason">,
) {
  if (isUserFrozen(user)) return false;
  if (user.latestGuardDecision === "step_up") return true;
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
