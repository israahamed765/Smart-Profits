export type DateRangeKey = "today" | "week" | "month" | "year" | "custom";

export const ADMIN_LOGIN_HINT_EMAIL = "admin@smartprofits.com";

export const RANGE_LABELS: Record<DateRangeKey, string> = {
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  year: "هذا العام",
  custom: "فترة مخصصة",
};

export function rangeBounds(key: DateRangeKey, from?: string, to?: string) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (key === "custom" && from && to) {
    return { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`) };
  }
  if (key === "today") {
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end };
  }
  if (key === "week") {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (key === "year") {
    return { start: new Date(now.getFullYear(), 0, 1), end };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
}

export type TrackEventType =
  | "register"
  | "analyze"
  | "doctor"
  | "whatif"
  | "leak"
  | "upload_error"
  | "login";

export interface TrackEvent {
  type: TrackEventType;
  at: number;
  label?: string;
  email?: string;
}

export type AccountStatus = "active" | "inactive" | "churned";
export type PlanTier = "free" | "pro" | "business";
export type TxStatus = "success" | "failed" | "refunded";
