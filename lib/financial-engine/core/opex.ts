import { round2, safeDivide } from "@/shared/constants/math";
import { isSalesTransaction } from "./classify";
import type { AppSettings, MonthlyPoint, Transaction } from "../types";

export function normalizeOpexSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    rent: Number(settings.rent) || 0,
    salaries: Number(settings.salaries) || 0,
    utilities: Number(settings.utilities) || 0,
    otherOpex: Number(settings.otherOpex) || 0,
    opexIncludedInFile: Boolean(settings.opexIncludedInFile),
    opexSetupCompleted: Boolean(settings.opexSetupCompleted),
  };
}

export function fixedOpexParts(settings: AppSettings) {
  const included = Boolean(settings.opexIncludedInFile);
  const rent = included ? 0 : Number(settings.rent) || 0;
  const salaries = included ? 0 : Number(settings.salaries) || 0;
  const utilities = included ? 0 : Number(settings.utilities) || 0;
  const marketing = included ? 0 : Number(settings.otherOpex) || 0;
  return {
    rent,
    salaries,
    utilities,
    marketing,
    total: rent + salaries + utilities + marketing,
    enteredTotal:
      (Number(settings.rent) || 0) +
      (Number(settings.salaries) || 0) +
      (Number(settings.utilities) || 0) +
      (Number(settings.otherOpex) || 0),
    included,
  };
}

export function monthlyOpexFromSettings(settings: AppSettings) {
  return fixedOpexParts(settings).total;
}

export interface RealVsPhantom {
  revenue: number;
  cogs: number;
  fileVariableOpex: number;
  fixedOpex: number;
  phantomProfit: number;
  realProfit: number;
  gap: number;
  opexIncludedInFile: boolean;
}

export function computeRealVsPhantom(point: MonthlyPoint | null | undefined, settings: AppSettings): RealVsPhantom | null {
  if (!point) return null;
  const parts = fixedOpexParts(settings);
  const fileVariableOpex = Math.max(0, round2(point.opex - parts.total));
  const phantomProfit = round2(point.revenue - point.cogs);
  const realProfit = round2(point.netProfit);
  return {
    revenue: round2(point.revenue),
    cogs: round2(point.cogs),
    fileVariableOpex,
    fixedOpex: round2(parts.total),
    phantomProfit,
    realProfit,
    gap: round2(phantomProfit - realProfit),
    opexIncludedInFile: parts.included,
  };
}

export interface BreakEvenResult {
  fixedOpex: number;
  avgUnitContribution: number;
  unitsNeeded: number | null;
  revenueNeeded: number | null;
  grossMarginPct: number;
  unitsSold: number;
  covered: boolean;
  remainingUnits: number;
  impossible: boolean;
}

export function computeBreakEven(
  point: MonthlyPoint | null | undefined,
  transactions: Transaction[],
  settings: AppSettings,
): BreakEvenResult | null {
  if (!point) return null;
  const fixedOpex = monthlyOpexFromSettings(settings);
  let contribution = 0;
  let unitsSold = 0;

  for (const tx of transactions) {
    if (!isSalesTransaction(tx)) continue;
    const qty = tx.quantity > 0 ? tx.quantity : tx.revenue > 0 ? 1 : 0;
    if (qty <= 0) continue;
    const unitPrice = tx.sellingPrice > 0 ? tx.sellingPrice : tx.revenue / qty;
    const cost = Number.isFinite(tx.costPrice) ? tx.costPrice : 0;
    contribution += (unitPrice - cost) * qty;
    unitsSold += qty;
  }

  const avgUnitContribution = unitsSold > 0 ? contribution / unitsSold : 0;
  const grossMarginPct = safeDivide(point.revenue - point.cogs, point.revenue) * 100;
  const impossible = fixedOpex > 0 && avgUnitContribution <= 0;
  const unitsNeeded =
    fixedOpex <= 0 ? 0 : impossible ? null : Math.ceil(fixedOpex / avgUnitContribution);
  const revenueNeeded =
    fixedOpex <= 0 ? 0 : grossMarginPct <= 0 ? null : round2(fixedOpex / (grossMarginPct / 100));

  return {
    fixedOpex: round2(fixedOpex),
    avgUnitContribution: round2(avgUnitContribution),
    unitsNeeded,
    revenueNeeded,
    grossMarginPct: round2(grossMarginPct),
    unitsSold: round2(unitsSold),
    covered: unitsNeeded != null && unitsSold >= unitsNeeded,
    remainingUnits: unitsNeeded == null ? 0 : Math.max(0, unitsNeeded - unitsSold),
    impossible,
  };
}

export type OpexHealthTone = "good" | "warn" | "bad" | "idle";

export interface OpexHealth {
  ratioPct: number;
  ofGrossPct: number;
  tone: OpexHealthTone;
  title: string;
  message: string;
}

export function computeOpexHealth(point: MonthlyPoint | null | undefined, settings: AppSettings): OpexHealth | null {
  if (!point) return null;
  const fixed = monthlyOpexFromSettings(settings);
  const ratioPct = round2(safeDivide(fixed, point.revenue) * 100);
  const gross = point.revenue - point.cogs;
  const ofGrossPct = round2(safeDivide(fixed, gross) * 100);

  if (fixed <= 0) {
    return {
      ratioPct: 0,
      ofGrossPct: 0,
      tone: "idle",
      title: "لم تُحتسب مصاريف ثابتة بعد",
      message: settings.opexIncludedInFile
        ? "اعتُبرت المصاريف الثابتة مضمّنة داخل الملف. إن لم تكن كذلك فعدّل الإعداد قبل اعتماد صافي الربح."
        : "أدخل الإيجار والرواتب والفواتير حتى لا يظهر الربح وهمياً (إجمالي الربح فقط).",
    };
  }

  if (ratioPct >= 40) {
    return {
      ratioPct,
      ofGrossPct,
      tone: "bad",
      title: "تحذير مصاريف تشغيلية",
      message: `مصاريفك الثابتة (الإيجار والرواتب والخدمات) تلتهم ${ratioPct.toFixed(0)}% من المبيعات، أي نحو ${ofGrossPct.toFixed(0)}% من ربح البضاعة. يُوصى بمراجعة ساعات التشغيل أو خفض تكاليف الخدمات قبل التوسع.`,
    };
  }

  if (ratioPct >= 30) {
    return {
      ratioPct,
      ofGrossPct,
      tone: "warn",
      title: "المصاريف الثابتة مرتفعة",
      message: `التشغيل الثابت يستهلك ${ratioPct.toFixed(0)}% من المبيعات. الحد الآمن عادةً دون 30%. راقب الفواتير والرواتب حتى لا يتحول الربح الإجمالي إلى خسارة صافية.`,
    };
  }

  return {
    ratioPct,
    ofGrossPct,
    tone: "good",
    title: "نسبة التشغيل تحت السيطرة",
    message: `المصاريف الثابتة تعادل ${ratioPct.toFixed(0)}% من المبيعات — ضمن النطاق الصحي (أقل من 30%).`,
  };
}
