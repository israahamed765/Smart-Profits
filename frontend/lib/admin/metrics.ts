import { countRealFiles, PLAN_PRICE_USD, readAllLocalWorkspaces, USERS_KEY } from "@/frontend/lib/tenant";
import { filterUsersRegisteredInRange, hasGuardIssue, isUserFrozen } from "@/frontend/lib/admin/guard-status";
import type { DateRangeKey } from "@/lib/admin/config";
import { rangeBounds } from "@/lib/admin/config";
import type { TrackEvent } from "@/lib/admin/config";
import type { AdminFacts, AdminSnapshot, AdminUserRow } from "@/lib/admin/types";
import type { AccountStatus, PlanTier } from "@/lib/admin/config";
import type { PersistedWorkspace } from "@/lib/serialize";

export type { AdminFacts };

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function inRange(iso: string | undefined, start: Date, end: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function bucketLabels(range: DateRangeKey, start: Date, days: number) {
  if (range === "year") {
    return ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].slice(
      0,
      Math.min(12, new Date().getMonth() + 1),
    );
  }
  if (range === "today") {
    return Array.from({ length: 8 }, (_, i) => `${8 + i}:00`);
  }
  const count = Math.min(days, range === "week" ? 7 : 10);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + Math.floor((i * days) / count));
    return d.toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
  });
}

function bucketIndex(at: number, start: Date, end: Date, buckets: number) {
  const span = Math.max(1, end.getTime() - start.getTime());
  const idx = Math.floor(((at - start.getTime()) / span) * buckets);
  return Math.min(buckets - 1, Math.max(0, idx));
}

export function collectClientFacts(): AdminFacts {
  if (typeof window === "undefined") return { users: [], events: [], workspaces: [] };
  let users: AdminFacts["users"] = [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    users = raw ? (JSON.parse(raw) as AdminFacts["users"]) : [];
  } catch {
    users = [];
  }
  let events: TrackEvent[] = [];
  try {
    const raw = localStorage.getItem("smartprofit-platform-events");
    events = raw ? (JSON.parse(raw) as TrackEvent[]) : [];
  } catch {
    events = [];
  }
  return { users, events, workspaces: readAllLocalWorkspaces() };
}

export function mergeFacts(base: AdminFacts, extra: AdminFacts): AdminFacts {
  const users = new Map<string, AdminFacts["users"][number]>();
  for (const user of [...base.users, ...extra.users]) {
    const email = user.email.trim().toLowerCase();
    const prev = users.get(email);
    users.set(email, prev ? { ...prev, ...user, email } : { ...user, email });
  }
  const workspaces = new Map<string, PersistedWorkspace>();
  for (const row of [...base.workspaces, ...extra.workspaces]) {
    workspaces.set(row.email.trim().toLowerCase(), row.workspace);
  }
  const seen = new Set<string>();
  const events: TrackEvent[] = [];
  for (const event of [...base.events, ...extra.events]) {
    const key = `${event.at}|${event.type}|${event.label ?? ""}|${event.email ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }
  events.sort((a, b) => b.at - a.at);
  return {
    users: Array.from(users.values()),
    events,
    workspaces: Array.from(workspaces.entries()).map(([email, workspace]) => ({ email, workspace })),
  };
}

export function saveUserOverride(id: string, patch: Partial<AdminUserRow>) {
  if (typeof window === "undefined") return;
  const email = id.replace(/^real-/, "");
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const users = raw ? (JSON.parse(raw) as AdminFacts["users"]) : [];
    const index = users.findIndex((item) => item.email.toLowerCase() === email.toLowerCase());
    if (index >= 0) {
      users[index] = {
        ...users[index],
        plan: patch.plan ?? users[index].plan,
        status: patch.status ?? users[index].status,
      };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  } catch {
    // ignore
  }
}

export function computeUserStats(users: AdminUserRow[], start: Date, end: Date) {
  const registeredInPeriod = filterUsersRegisteredInRange(users, start, end);
  const frozenCount = users.filter(isUserFrozen).length;
  const guardIssuesCount = users.filter(hasGuardIssue).length;
  return {
    totalRegistered: users.length,
    registeredInPeriod: registeredInPeriod.length,
    frozenCount,
    guardIssuesCount,
  };
}

export function resolveUserStats(
  snapshot: Pick<AdminSnapshot, "users" | "userStats">,
  range?: DateRangeKey,
  from?: string,
  to?: string,
): AdminSnapshot["userStats"] {
  if (snapshot.userStats) return snapshot.userStats;
  const { start, end } = rangeBounds(range ?? "month", from, to);
  return computeUserStats(snapshot.users ?? [], start, end);
}

export function normalizeAdminSnapshot(
  snapshot: AdminSnapshot,
  range: DateRangeKey,
  from?: string,
  to?: string,
): AdminSnapshot {
  if (snapshot.userStats) return snapshot;
  const { start, end } = rangeBounds(range, from, to);
  return { ...snapshot, userStats: computeUserStats(snapshot.users, start, end) };
}

export function buildAdminSnapshotFromFacts(
  facts: AdminFacts,
  range: DateRangeKey,
  from?: string,
  to?: string,
): AdminSnapshot {
  const { start, end } = rangeBounds(range, from, to);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - (end.getTime() - start.getTime()));
  const days = daysBetween(start, end);
  const filesByEmail = new Map(facts.workspaces.map((row) => [row.email, countRealFiles(row.workspace)]));

  const users: AdminUserRow[] = facts.users
    .filter((user) => user.email)
    .map((user) => {
      const lastActive = user.lastActive || user.createdAt || new Date().toISOString();
      const ageDays = (Date.now() - new Date(lastActive).getTime()) / 86400000;
      const status: AccountStatus = user.status ?? (ageDays <= 30 ? "active" : "inactive");
      return {
        id: `real-${user.email.toLowerCase()}`,
        name: user.fullName || "تاجر",
        store: user.storeName || "—",
        email: user.email.toLowerCase(),
        phone: user.phone || "—",
        passwordDisplay: user.passwordDisplay || "—",
        passwordKind: user.passwordKind ?? "missing",
        registeredAt: user.createdAt || lastActive,
        status,
        plan: user.plan ?? "free",
        filesUploaded: filesByEmail.get(user.email.toLowerCase()) ?? 0,
        lastActive,
        lastLoginAt: user.lastLoginAt || "",
        guardFrozen: Boolean(user.guardFrozen),
        guardReason: user.guardReason || "",
        guardFrozenAt: user.guardFrozenAt || "",
        latestGuardDecision: user.latestGuardDecision,
        latestGuardReason: user.latestGuardReason || "",
        latestGuardSummary: user.latestGuardSummary || "",
        latestGuardAt: user.latestGuardAt || "",
        real: true,
      };
    })
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());

  const rangeEvents = facts.events.filter((event) => event.at >= start.getTime() && event.at <= end.getTime());
  const prevEvents = facts.events.filter((event) => event.at >= prevStart.getTime() && event.at <= prevEnd.getTime());

  const uniqueNow = new Set(rangeEvents.map((event) => event.email || event.label).filter(Boolean)).size;
  const uniquePrev = new Set(prevEvents.map((event) => event.email || event.label).filter(Boolean)).size;
  const visitors = uniqueNow || users.filter((user) => inRange(user.lastActive, start, end)).length;
  const visitorsChange =
    uniquePrev === 0 ? (visitors > 0 ? 100 : 0) : Math.round(((visitors - uniquePrev) / uniquePrev) * 1000) / 10;

  const activeUsers = users.filter((user) => user.status === "active" && inRange(user.lastActive, start, end)).length
    || users.filter((user) => user.status === "active").length;
  const mrr = users
    .filter((user) => user.status === "active")
    .reduce((sum, user) => sum + PLAN_PRICE_USD[user.plan], 0);
  const inflowTotal = mrr;
  const outflowTotal = 0;
  const netProfit = inflowTotal - outflowTotal;

  const labels = bucketLabels(range, start, days);
  const revenueSeries = labels.map((name, index) => {
    const paidInBucket = users.filter((user) => {
      const t = new Date(user.registeredAt).getTime();
      return bucketIndex(t, start, end, labels.length) === index && user.plan !== "free";
    });
    return {
      name,
      revenue: paidInBucket.reduce((sum, user) => sum + PLAN_PRICE_USD[user.plan], 0),
      expenses: 0,
    };
  });

  const userGrowth = labels.map((name, index) => ({
    name,
    users: users.filter((user) => {
      const t = new Date(user.registeredAt).getTime();
      return t <= start.getTime() + ((index + 1) / labels.length) * (end.getTime() - start.getTime());
    }).length,
  }));

  const storeByEmail = new Map(users.map((user) => [user.email, user.store]));
  const activity = rangeEvents.slice(0, 12).map((event, index) => ({
    id: `t-${event.at}-${index}`,
    icon: event.type === "analyze" || event.type === "doctor" || event.type === "whatif" ? ("analyze" as const) : event.type === "register" ? ("user" as const) : ("pay" as const),
    text:
      event.type === "analyze"
        ? `${storeByEmail.get(event.email || "") || event.email || "تاجر"} حلّل ملفاً${event.label ? ` (${event.label})` : ""}`
        : event.type === "register"
          ? `حساب جديد: ${event.label || event.email || "تاجر"}`
          : event.type === "login"
            ? `دخول: ${storeByEmail.get(event.email || "") || event.email || "تاجر"}`
            : event.type === "doctor"
              ? `${storeByEmail.get(event.email || "") || "تاجر"} فتح التشخيص`
              : event.type === "whatif"
                ? `${storeByEmail.get(event.email || "") || "تاجر"} شغّل المحاكاة`
                : event.type === "upload_error"
                  ? `فشل رفع ملف${event.label ? ` (${event.label})` : ""}`
                  : "نشاط على المنصة",
    time: new Date(event.at).toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }),
  }));

  const free = users.filter((user) => user.plan === "free").length;
  const pro = users.filter((user) => user.plan === "pro").length;
  const business = users.filter((user) => user.plan === "business").length;
  const totalUsers = Math.max(1, users.length);
  const activeCount = users.filter((user) => user.status === "active").length;
  const churned = users.filter((user) => user.status === "churned").length;

  const transactions = users
    .filter((user) => user.plan !== "free")
    .map((user, index) => ({
      invoice: `SUB-${user.email.slice(0, 6).toUpperCase()}-${index + 1}`,
      merchant: user.store,
      amount: PLAN_PRICE_USD[user.plan],
      status: "success" as const,
      date: user.registeredAt,
      plan: user.plan === "business" ? "Business" : "Pro",
    }));

  const analyze = rangeEvents.filter((e) => e.type === "analyze").length;
  const doctor = rangeEvents.filter((e) => e.type === "doctor").length;
  const whatif = rangeEvents.filter((e) => e.type === "whatif").length;
  const leak = rangeEvents.filter((e) => e.type === "leak").length;
  const uploadErrors = rangeEvents.filter((e) => e.type === "upload_error").length;
  const logins = rangeEvents.filter((e) => e.type === "login").length;
  const registers = rangeEvents.filter((e) => e.type === "register").length;

  const uniqueVisitors = visitors;
  const pageViews = rangeEvents.length;
  const conversion = Math.round((registers / Math.max(1, uniqueVisitors)) * 1000) / 10;

  const totalFeature = Math.max(1, analyze + doctor + whatif + logins);
  const sources = [
    { name: "تحليل ملفات", value: Math.round((analyze / totalFeature) * 100), color: "#4FD1C5" },
    { name: "تسجيل دخول", value: Math.round((logins / totalFeature) * 100), color: "#E8C56B" },
    { name: "التشخيص", value: Math.round((doctor / totalFeature) * 100), color: "#67E8F9" },
    { name: "محاكاة", value: Math.round((whatif / totalFeature) * 100), color: "#F59E0B" },
  ].filter((row) => row.value > 0);

  const filesTotal = users.reduce((sum, user) => sum + user.filesUploaded, 0);
  const userStats = computeUserStats(users, start, end);

  const alerts = [
    ...(registers > 0 ? [{ id: "a1", tone: "success" as const, text: `${registers} حساب جديد في الفترة المحددة`, time: "هذه الفترة" }] : []),
    ...(userStats.registeredInPeriod > 0 && registers === 0
      ? [{ id: "a1b", tone: "success" as const, text: `${userStats.registeredInPeriod} تسجيل في الفترة المحددة`, time: "هذه الفترة" }]
      : []),
    ...(userStats.frozenCount > 0 ? [{ id: "a5", tone: "danger" as const, text: `${userStats.frozenCount} حساب مجمّد حالياً (Smart Guard)`, time: "الآن" }] : []),
    ...(userStats.guardIssuesCount > 0 ? [{ id: "a6", tone: "warning" as const, text: `${userStats.guardIssuesCount} حساب يحتاج متابعة (تحقق إضافي / مشاكل)`, time: "الآن" }] : []),
    ...(uploadErrors > 0 ? [{ id: "a2", tone: "danger" as const, text: `${uploadErrors} ملف فشل رفعه`, time: "هذه الفترة" }] : []),
    ...(users.length === 0 ? [{ id: "a3", tone: "warning" as const, text: "لا يوجد تجار مسجّلون بعد", time: "الآن" }] : []),
    ...(filesTotal > 0 ? [{ id: "a4", tone: "info" as const, text: `${filesTotal} ملف مبيعات محفوظ لدى التجار`, time: "حتى الآن" }] : []),
  ];

  return {
    visitors,
    visitorsChange,
    activeUsers,
    mrr,
    netProfit,
    revenueSeries,
    userGrowth,
    activity,
    inflow: { subscriptions: mrr, addons: 0, total: inflowTotal },
    outflow: { ai: 0, hosting: 0, payments: 0, marketing: 0, total: outflowTotal },
    margin: inflowTotal === 0 ? 0 : Math.round((netProfit / inflowTotal) * 1000) / 10,
    arpu: Math.round((mrr / Math.max(1, activeCount)) * 10) / 10,
    transactions,
    retention: Math.round((activeCount / totalUsers) * 1000) / 10,
    churn: Math.round((churned / totalUsers) * 1000) / 10,
    ltv: Math.round((mrr / Math.max(1, activeCount)) * 11),
    planSplit: { free, pro, business },
    users,
    uniqueVisitors,
    pageViews,
    sources: sources.length ? sources : [{ name: "لا يوجد نشاط بعد", value: 100, color: "#64748B" }],
    countries: users.slice(0, 8).map((user) => ({
      name: user.store,
      visitors: user.filesUploaded + (inRange(user.lastActive, start, end) ? 1 : 0),
    })),
    conversion,
    features: [
      { name: "Profit Leak Detector", uses: leak },
      { name: "What-If Simulator", uses: whatif },
      { name: "Business Doctor", uses: doctor },
      { name: "تنظيف Excel", uses: analyze },
    ],
    uploadErrors,
    alerts,
    userStats,
  };
}

export function buildAdminSnapshot(range: DateRangeKey, from?: string, to?: string): AdminSnapshot {
  return buildAdminSnapshotFromFacts(collectClientFacts(), range, from, to);
}
