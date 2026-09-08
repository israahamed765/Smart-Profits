import type { AccountStatus, PlanTier, TrackEvent, TxStatus } from "./config";
import type { PersistedWorkspace } from "@/lib/financial-engine/serialization";
import type { GuardDecision, GuardReason } from "@/lib/smart-guard/types";

export interface AdminUserRow {
  id: string;
  name: string;
  store: string;
  email: string;
  phone: string;
  passwordDisplay: string;
  passwordKind: "hashed" | "plain" | "missing";
  registeredAt: string;
  status: AccountStatus;
  plan: PlanTier;
  filesUploaded: number;
  lastActive: string;
  lastLoginAt: string;
  guardFrozen: boolean;
  guardReason: string;
  guardFrozenAt: string;
  latestGuardDecision?: GuardDecision;
  latestGuardReason: GuardReason | "";
  latestGuardSummary: string;
  latestGuardAt: string;
  real: boolean;
}

export interface AdminTransaction {
  invoice: string;
  merchant: string;
  amount: number;
  status: TxStatus;
  date: string;
  plan: string;
}

export interface AdminAlert {
  id: string;
  tone: "info" | "warning" | "danger" | "success";
  text: string;
  time: string;
}

/** Server + client snapshot input. No localStorage in this module. */
export interface AdminFacts {
  users: Array<{
    fullName: string;
    storeName: string;
    email: string;
    phone?: string;
    passwordDisplay?: string;
    passwordKind?: "hashed" | "plain" | "missing";
    createdAt?: string;
    lastActive?: string;
    lastLoginAt?: string;
    plan?: PlanTier;
    status?: AccountStatus;
    guardFrozen?: boolean;
    guardReason?: string;
    guardFrozenAt?: string;
    latestGuardDecision?: GuardDecision;
    latestGuardReason?: GuardReason | "";
    latestGuardSummary?: string;
    latestGuardAt?: string;
  }>;
  events: TrackEvent[];
  workspaces: Array<{ email: string; workspace: PersistedWorkspace }>;
}

export interface AdminSnapshot {
  visitors: number;
  visitorsChange: number;
  activeUsers: number;
  mrr: number;
  netProfit: number;
  revenueSeries: { name: string; revenue: number; expenses: number }[];
  userGrowth: { name: string; users: number }[];
  activity: { id: string; icon: "analyze" | "pay" | "user"; text: string; time: string }[];
  inflow: { subscriptions: number; addons: number; total: number };
  outflow: { ai: number; hosting: number; payments: number; marketing: number; total: number };
  margin: number;
  arpu: number;
  transactions: AdminTransaction[];
  retention: number;
  churn: number;
  ltv: number;
  planSplit: { free: number; pro: number; business: number };
  users: AdminUserRow[];
  uniqueVisitors: number;
  pageViews: number;
  sources: { id?: string; name: string; value: number; color: string }[];
  countries: { id: string; name: string; visitors: number }[];
  conversion: number;
  features: { id?: string; name: string; uses: number }[];
  uploadErrors: number;
  alerts: AdminAlert[];
  userStats: {
    totalRegistered: number;
    registeredInPeriod: number;
    frozenCount: number;
    guardIssuesCount: number;
  };
}
