import { buildAdvisorReport } from "@/lib/advisor";
import {
  computeHealthScore,
  computeKpis,
  computeProductHighlights,
  computeStagnantInventory,
} from "@/lib/analytics";
import { computeBreakEven, computeOpexHealth, computeRealVsPhantom, monthlyOpexFromSettings } from "@/lib/opex";
import { ARABIC_MONTHS, monthKey } from "@/shared/constants/calendar";
import { safeDivide } from "@/shared/constants/math";
import type { AnalysisResult, AppSettings, CurrencyCode, Transaction } from "@/lib/types";
import { formatDateAr, formatMoney } from "./format";

const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  SAR: "ريال سعودي (SAR / ر.س)",
  USD: "دولار أمريكي (USD / $)",
  AED: "درهم إماراتي (AED / د.إ)",
  JOD: "دينار أردني (JOD / د.أ)",
  ILS: "شيكل (ILS / ₪)",
};

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount: number, currency: CurrencyCode) {
  return esc(formatMoney(amount, currency));
}

function txsForMonth(transactions: Transaction[], key: string) {
  const dated = transactions.filter((tx) => tx.date);
  if (!dated.length) return transactions;
  return dated.filter((tx) => monthKey(tx.date!.getFullYear(), tx.date!.getMonth()) === key);
}

function highestUnitPrice(transactions: Transaction[]) {
  let best: { product: string; price: number } | null = null;
  for (const tx of transactions) {
    if (!tx.product || tx.sellingPrice <= 0) continue;
    if (!best || tx.sellingPrice > best.price) {
      best = { product: tx.product, price: tx.sellingPrice };
    }
  }
  return best;
}

function reportShell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    :root { --navy:#0f172a; --card:#f8fafc; --line:#e2e8f0; --green:#059669; --red:#dc2626; --muted:#64748b; --blue:#2563eb; }
    * { box-sizing: border-box; }
    body { margin:0; background:#e2e8f0; color:#0f172a; font-family: "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif; }
    .page { max-width: 920px; margin: 24px auto; background:#fff; padding: 36px 40px; box-shadow: 0 12px 40px rgba(15,23,42,.12); }
    .toolbar { display:flex; gap:8px; justify-content:flex-end; margin-bottom: 18px; }
    .toolbar button { border:0; background:var(--navy); color:#fff; padding:10px 16px; border-radius:10px; cursor:pointer; font: inherit; }
    .header { display:flex; justify-content:space-between; gap:16px; border-bottom:3px solid var(--navy); padding-bottom:16px; margin-bottom:22px; }
    .brand { font-size:22px; font-weight:800; }
    .brand span { display:block; font-size:12px; color:var(--muted); font-weight:500; margin-top:4px; }
    .meta { font-size:13px; color:#334155; line-height:1.9; text-align:left; }
    h2 { font-size:16px; margin:28px 0 12px; color:var(--navy); border-right:4px solid var(--blue); padding-right:10px; }
    .kpis { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
    .kpi { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
    .kpi b { display:block; font-size:18px; margin-top:6px; }
    .kpi span { color:var(--muted); font-size:12px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { border:1px solid var(--line); padding:8px 10px; text-align:right; }
    th { background:var(--navy); color:#fff; font-weight:600; }
    tr:nth-child(even) { background:#f8fafc; }
    .pos { color:var(--green); font-weight:700; }
    .neg { color:var(--red); font-weight:700; }
    .box { border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:8px; }
    .box h3 { margin:0 0 6px; font-size:14px; }
    .note { font-size:11px; color:var(--muted); margin-top:24px; }
    @media print {
      body { background:#fff; }
      .page { margin:0; box-shadow:none; max-width:none; padding:12mm; }
      .toolbar { display:none; }
    }
    @page { size: A4; margin: 12mm; }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <button onclick="window.print()">طباعة أو حفظ PDF</button>
    </div>
    ${body}
    <p class="note">تقرير صادر من منصة Smart Profits — مستشار التاجر الذكي. الأرقام محسوبة من الملف المرفوع بعد تنظيف الأعمدة ودمج أوراق العمل، مع إضافة المصاريف الثابتة من إعدادات المتجر. هذا التقرير أداة قرار تجاري وليس بديلاً عن دفاتر محاسب قانونية.</p>
  </div>
</body>
</html>`;
}

export function buildMonthlyReportHtml(input: {
  monthKey: string;
  result: AnalysisResult;
  settings: AppSettings;
  currency: CurrencyCode;
  transactions: Transaction[];
  storeName: string;
  scope?: "month" | "all";
}) {
  const { result, settings, currency, transactions } = input;
  const point = result.monthlySeries.find((row) => row.key === input.monthKey);
  if (!point) throw new Error("لا يوجد شهر مطابق في الملف.");
  const allScope = input.scope === "all";

  const title = allScope ? `التقرير الشامل — ${result.fileName}` : `تقرير ${ARABIC_MONTHS[point.month]} ${point.year}`;
  const monthTxs = allScope ? transactions : txsForMonth(transactions, point.key);
  const seriesUpTo = allScope ? result.monthlySeries : result.monthlySeries.filter((row) => row.key <= point.key);
  const totals = result.monthlySeries.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      cogs: acc.cogs + row.cogs,
      opex: acc.opex + row.opex,
      netProfit: acc.netProfit + row.netProfit,
    }),
    { revenue: 0, cogs: 0, opex: 0, netProfit: 0 },
  );
  const focus = allScope
    ? {
        revenue: totals.revenue,
        cogs: totals.cogs,
        opex: totals.opex,
        netProfit: totals.netProfit,
      }
    : point;
  const kpis = computeKpis(seriesUpTo, result.forecast.nextMonthProfit);
  const highlights = computeProductHighlights(monthTxs.length ? monthTxs : transactions);
  const stagnant = computeStagnantInventory(monthTxs.length ? monthTxs : transactions);
  const advisor = buildAdvisorReport({
    transactions: monthTxs.length ? monthTxs : transactions,
    kpis,
    monthly: seriesUpTo,
    forecast: result.forecast,
    highlights,
    stagnant,
    settings,
    reviewNeeded: 0,
  });

  const fixed = monthlyOpexFromSettings(settings);
  const monthsCount = allScope ? Math.max(1, result.monthlySeries.length) : 1;
  const fixedTotal = fixed * monthsCount;
  const variableOpex = Math.max(0, focus.opex - fixedTotal);
  const margin = safeDivide(focus.netProfit, focus.revenue) * 100;
  const health = computeHealthScore({
    profitMargin: margin,
    revenueChangePct: kpis.revenueChangePct,
    expenseChangePct: kpis.expenseChangePct,
    predictedProfit: result.forecast.nextMonthProfit,
    currentProfit: focus.netProfit,
  });
  const topPrice = highestUnitPrice(monthTxs.length ? monthTxs : transactions);
  const winners = [...highlights.catalog].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const losers = [...highlights.catalog].filter((item) => item.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 5);
  const exportedAt = `${formatDateAr(new Date())} — ${new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
  const phantom = computeRealVsPhantom(
    {
      ...point,
      revenue: focus.revenue,
      cogs: focus.cogs,
      opex: focus.opex,
      netProfit: focus.netProfit,
      expenses: focus.cogs + focus.opex,
    },
    settings,
  );
  const breakEven = computeBreakEven(point, txsForMonth(transactions, point.key), settings);
  const opexHealth = computeOpexHealth(point, settings);

  const kpiCards = [
    ["إجمالي المبيعات (Revenue)", money(focus.revenue, currency)],
    ["تكلفة البضاعة المباعة (COGS)", money(focus.cogs, currency)],
    ["مصاريف تشغيل متغيرة (Variable OpEx)", money(variableOpex, currency)],
    [allScope ? `مصاريف ثابتة × ${monthsCount} أشهر` : "مصاريف ثابتة (إيجار + رواتب + فواتير + تسويق)", money(fixedTotal, currency)],
    ["صافي الربح (Net Profit)", money(focus.netProfit, currency)],
    ["هامش الربح %", `${margin.toFixed(1)}%`],
    ["مؤشر صحة المتجر", `${health.healthScore}/100 — ${health.healthLabel}`],
    ["أعلى سعر بيع للوحدة", topPrice ? `${esc(topPrice.product)} — ${money(topPrice.price, currency)}` : "—"],
    ["الأكثر ربحاً", highlights.mostProfitable ? `${esc(highlights.mostProfitable.name)} — ${money(highlights.mostProfitable.profit, currency)}` : "—"],
  ];

  const body = `
    <div class="header">
      <div>
        <div class="brand">Smart Profits<span>تقرير مالي تفصيلي — مستشار التاجر الذكي</span></div>
      </div>
      <div class="meta">
        <div><b>المتجر:</b> ${esc(input.storeName || settings.storeName || "—")}</div>
        <div><b>الملف المصدر:</b> ${esc(result.fileName)}</div>
        <div><b>فترة التقرير:</b> ${esc(title)}</div>
        <div><b>تاريخ التصدير:</b> ${esc(exportedAt)}</div>
        <div><b>العملة:</b> ${esc(CURRENCY_LABEL[currency])}</div>
      </div>
    </div>

    <h2>1) الملخص التنفيذي</h2>
    <div class="kpis">
      ${kpiCards.map(([label, value]) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`).join("")}
    </div>
    <p style="font-size:13px;color:#334155;line-height:1.8">تفكيك المصروف الثابت: إيجار ${money(settings.rent, currency)} · رواتب ${money(settings.salaries, currency)} · فواتير وخدمات ${money(settings.utilities || 0, currency)} · تسويق واشتراكات ${money(settings.otherOpex, currency)}${settings.opexIncludedInFile ? " — (اعتُبرت مضمّنة داخل الملف ولم تُضف خارجياً)" : ""}. صافي الربح = المبيعات − (COGS + المتغير + الثابت).</p>

    ${
      phantom
        ? `<div class="kpis" style="margin-top:12px">
            <div class="kpi"><span>الربح الظاهري (مبيعات − COGS)</span><b>${money(phantom.phantomProfit, currency)}</b></div>
            <div class="kpi"><span>الربح الحقيقي بعد الثوابت</span><b class="${phantom.realProfit >= 0 ? "pos" : "neg"}">${money(phantom.realProfit, currency)}</b></div>
            <div class="kpi"><span>ما يأكله التشغيل من ربح البضاعة</span><b>${money(phantom.gap, currency)}</b></div>
          </div>`
        : ""
    }
    ${
      opexHealth
        ? `<div class="box">${esc(opexHealth.title)} — ${esc(opexHealth.message)}</div>`
        : ""
    }
    ${
      breakEven?.unitsNeeded != null
        ? `<div class="box"><h3>نقطة التعادل</h3><div>يلزم بيع ${breakEven.unitsNeeded} قطعة لتغطية المصاريف الثابتة (${money(breakEven.fixedOpex, currency)}) قبل أي ربح صافٍ. بعت ${breakEven.unitsSold} قطعة.</div></div>`
        : ""
    }

    <h2>2) التحليل المقارن: من المبيعات إلى صافي الربح</h2>
    <table>
      <thead>
        <tr>
          <th>الشهر</th><th>المبيعات</th><th>COGS</th><th>تشغيل متغير</th><th>ثابت</th><th>صافي الربح</th><th>الهامش</th>
        </tr>
      </thead>
      <tbody>
        ${result.monthlySeries
          .map((row) => {
            const rowVar = Math.max(0, row.opex - fixed);
            const rowMargin = safeDivide(row.netProfit, row.revenue) * 100;
            const mark = !allScope && row.key === point.key ? "font-weight:800;background:#ecfdf5" : "";
            return `<tr style="${mark}">
              <td>${esc(row.label)}</td>
              <td>${money(row.revenue, currency)}</td>
              <td>${money(row.cogs, currency)}</td>
              <td>${money(rowVar, currency)}</td>
              <td>${money(fixed, currency)}</td>
              <td class="${row.netProfit >= 0 ? "pos" : "neg"}">${money(row.netProfit, currency)}</td>
              <td>${rowMargin.toFixed(1)}%</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>

    <h2>3) ماذا ربّحني وماذا خسرني</h2>
    <table>
      <thead><tr><th>المنتج</th><th>الدور</th><th>المبيعات</th><th>الربح / الخسارة</th><th>الهامش</th></tr></thead>
      <tbody>
        ${winners
          .map(
            (item, index) => `<tr>
            <td>${esc(item.name)}</td>
            <td>${index === 0 ? "الأكثر ربحاً" : "رابح"}</td>
            <td>${money(item.revenue, currency)}</td>
            <td class="pos">${money(item.profit, currency)}</td>
            <td>${item.margin.toFixed(1)}%</td>
          </tr>`,
          )
          .join("")}
        ${
          losers.length
            ? losers
                .map(
                  (item) => `<tr>
            <td>${esc(item.name)}</td>
            <td>خسارة</td>
            <td>${money(item.revenue, currency)}</td>
            <td class="neg">${money(item.profit, currency)}</td>
            <td>${item.margin.toFixed(1)}%</td>
          </tr>`,
                )
                .join("")
            : `<tr><td colspan="5">لا توجد منتجات خاسرة في هذا الشهر.</td></tr>`
        }
      </tbody>
    </table>

    <h2>4) تشخيص التسريب ومخاطر المخزون</h2>
    ${
      advisor.leaks.length
        ? advisor.leaks
            .slice(0, 6)
            .map(
              (leak) => `<div class="box"><h3>${esc(leak.product)} — مبيعات ${money(leak.revenue, currency)} / ربح ${money(leak.profit, currency)}</h3><div>${esc(leak.issue)}</div><div style="color:#059669;margin-top:4px">${esc(leak.suggestion)}</div></div>`,
            )
            .join("")
        : `<div class="box">لا يظهر تسريب ربح واضح في أرقام هذا الشهر.</div>`
    }
    ${
      advisor.inventory.length
        ? `<table style="margin-top:12px"><thead><tr><th>المنتج</th><th>القرار</th><th>السبب</th></tr></thead><tbody>${advisor.inventory
            .slice(0, 8)
            .map((item) => {
              const decision =
                item.decision === "order_now" ? "اطلب الآن" : item.decision === "dont_buy" ? "لا تشترِ" : "راقب";
              return `<tr><td>${esc(item.product)}</td><td>${decision}</td><td>${esc(item.reason)}</td></tr>`;
            })
            .join("")}</tbody></table>`
        : ""
    }

    <h2>5) ثلاثة إجراءات قابلة للتنفيذ اليوم</h2>
    ${advisor.todayActions
      .slice(0, 3)
      .map(
        (action, index) => `<div class="box"><h3>${index + 1}. ${esc(action.title)}</h3><div>${esc(action.reason)}</div></div>`,
      )
      .join("")}
    ${advisor.health.findings
      .map((finding) => `<div class="box"><h3>${esc(finding.title)}</h3><div>${esc(finding.detail)}</div></div>`)
      .join("")}
  `;

  return { title, fileName: `${title} — ${result.fileName.replace(/\.[^.]+$/, "")}.html`, html: reportShell(title, body) };
}
