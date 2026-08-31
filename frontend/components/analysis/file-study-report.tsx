"use client";

import Link from "next/link";
import { CheckCircle2, FileSearch } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { localizeSheetReason, localizeWarning } from "@/frontend/lib/localize-warning";
import { dateFromSheetName } from "@/lib/sheets";
import { filterTransactions, scopeFromSheetName } from "@/lib/scope";
import type { ColumnRole, SheetScan } from "@/lib/types";

const ROLE_ORDER: ColumnRole[] = [
  "date",
  "product",
  "sku",
  "quantity",
  "sellingPrice",
  "costPrice",
  "revenue",
  "expense",
  "category",
  "expenseType",
  "notes",
];

function sheetSortKey(sheet: SheetScan) {
  const dated = dateFromSheetName(sheet.name);
  if (dated) return dated.getTime();
  if (sheet.role === "summary") return Number.MAX_SAFE_INTEGER - 2;
  if (sheet.role === "skipped") return Number.MAX_SAFE_INTEGER - 1;
  if (sheet.role === "empty") return Number.MAX_SAFE_INTEGER;
  return Number.MAX_SAFE_INTEGER - 10;
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string | number;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="text-[11px] font-medium tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${warn ? "text-warning" : "text-foreground"}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-muted">{hint}</p> : null}
    </div>
  );
}

export function FileStudyReport() {
  const { parseResult, result, isDemo, currency, scope, setScope, clearScope } = useAnalysis();
  const { t, locale } = useAppearance();

  if (!parseResult || !result) {
    return (
      <Card className="p-5 text-center sm:p-8">
        <FileSearch className="mx-auto mb-3 h-10 w-10 text-muted" />
        <p className="text-foreground">{t("study.none")}</p>
        <p className="mt-2 text-sm text-muted">{t("study.noneHint")}</p>
        <Link href="/data">
          <Button className="mt-4">{t("study.goUpload")}</Button>
        </Link>
      </Card>
    );
  }

  const mappedEntries = ROLE_ORDER.map((role) => {
    const header = parseResult.mapping.mapping[role];
    if (!header) return null;
    return {
      role,
      header,
      score: parseResult.mapping.scores[role] ?? 0,
    };
  }).filter(Boolean) as Array<{ role: ColumnRole; header: string; score: number }>;

  const cleaning = parseResult.cleaning;
  const scopedRows = filterTransactions(parseResult.transactions, scope);
  const sample = scopedRows.slice(0, 12);
  const products = new Set(scopedRows.map((tx) => tx.product).filter(Boolean)).size;
  const dated = scopedRows.map((tx) => tx.date).filter((d): d is Date => d instanceof Date);
  const from = dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : null;
  const to = dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null;
  const dateLocale = locale === "ar" ? "ar" : "en-GB";
  const dateRange =
    from && to
      ? `${from.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} — ${to.toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })}`
      : t("study.noDate");
  const scoped = Boolean(scope.sheet || scope.monthKey);
  const notes = result.warnings.slice(0, 8).map((warning) => localizeWarning(warning, locale));
  const sheets = [...(parseResult.sheets ?? [])].sort((a, b) => sheetSortKey(a) - sheetSortKey(b));

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">{t("study.ok")}</h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
                {parseResult.fileName}
                {parseResult.sheets?.length ? ` · ${parseResult.sheets.length}` : ""} · {t("study.okHint")}
              </p>
              {isDemo && (
                <Badge tone="warning" className="mt-2">
                  {t("header.demo")}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">{dateRange}</p>
        </div>
        {cleaning && (
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
            <Stat
              label={t("study.rowsCleaned")}
              value={scoped ? scopedRows.length : cleaning.validRows}
              hint={scoped ? t("study.ofFile").replace("{n}", String(cleaning.validRows)) : undefined}
            />
            <Stat label={t("study.colsFound")} value={cleaning.columnsDetected} />
            <Stat label={t("study.valuesFixed")} value={cleaning.valuesFixed} />
            <Stat label={t("study.dupes")} value={cleaning.duplicatesRemoved} />
            <Stat label={t("study.review")} value={cleaning.reviewNeeded} warn={cleaning.reviewNeeded > 0} />
            <Stat label={t("study.products")} value={products} />
          </div>
        )}
      </Card>

      {notes.length > 0 && (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="mb-2 text-xs font-semibold text-foreground">{t("study.notes")}</p>
          <ul className="space-y-1.5 text-sm leading-6 text-muted">
            {notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </Card>
      )}

      {sheets.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{t("study.sheetsTitle")}</CardTitle>
                <p className="mt-1 text-xs text-muted">{t("study.sheetsHint")}</p>
              </div>
              {scoped && (
                <Button size="sm" variant="outline" onClick={clearScope}>
                  {t("scope.clear")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-border bg-black/[0.03] text-xs text-muted dark:bg-white/[0.03]">
                  <th className="px-5 py-2.5 text-start font-medium">{t("study.sheet")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("study.rows")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("study.valid")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("study.sales")}</th>
                  <th className="px-5 py-2.5 text-end font-medium">{t("study.action")}</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((sheet) => {
                  const active = scope.sheet === sheet.name;
                  const canOpen = sheet.role === "detail" && sheet.validRows > 0;
                  const actionLabel = active
                    ? t("study.now")
                    : sheet.role === "summary"
                      ? t("study.summary")
                      : sheet.role === "empty"
                        ? t("study.empty")
                        : sheet.role === "skipped"
                          ? t("study.skipped")
                          : t("study.viewMonth");
                  return (
                    <tr
                      key={sheet.name}
                      className={`border-b border-border/70 last:border-b-0 ${
                        active ? "bg-primary/8" : canOpen ? "cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03]" : ""
                      }`}
                      onClick={() => {
                        if (!canOpen) return;
                        active ? clearScope() : setScope(scopeFromSheetName(sheet.name, parseResult.transactions));
                      }}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{sheet.name}</p>
                        {sheet.reason ? (
                          <p className="mt-0.5 text-[11px] text-muted">{localizeSheetReason(sheet.reason, locale)}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-foreground">{sheet.rows}</td>
                      <td className="px-3 py-3 tabular-nums text-foreground">{sheet.validRows}</td>
                      <td className="px-3 py-3 tabular-nums text-foreground">
                        {typeof sheet.revenue === "number" ? formatMoney(sheet.revenue, currency) : "—"}
                      </td>
                      <td className="px-5 py-3 text-end">
                        <Badge tone={active ? "success" : sheet.role === "summary" ? "warning" : canOpen ? "info" : "neutral"}>
                          {actionLabel}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("study.columnsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mappedEntries.map((entry) => (
            <div key={entry.role} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-xs text-muted">
                  {t("study.fileCol")}: <span className="font-medium text-foreground">{entry.header}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {t("study.readAs")} {t(`study.role.${entry.role}`)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{t(`study.role.${entry.role}.why`)}</p>
              </div>
              <Badge tone={entry.score >= 80 ? "success" : "info"}>
                {t("study.confidence").replace("{n}", String(Math.round(entry.score)))}
              </Badge>
            </div>
          ))}

          {parseResult.mapping.unmappedHeaders.length > 0 && (
            <div className="rounded-xl border border-border px-4 py-3">
              <p className="text-xs font-medium text-foreground">{t("study.unused")}</p>
              <p className="mt-1 text-sm text-muted">{parseResult.mapping.unmappedHeaders.join(locale === "ar" ? "، " : ", ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("study.sample")}
            {scope.sheet || scope.monthKey || scope.product ? ` — ${t("study.sampleScoped")}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sample.length === 0 ? (
            <p className="text-sm text-muted">{t("study.sampleEmpty")}</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-start font-medium">{t("study.date")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.product")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.qty")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.price")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.cost")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.revenue")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("study.notesCol")}</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((tx, index) => (
                  <tr key={`${tx.product}-${index}`} className="border-b border-border/60 text-foreground">
                    <td className="px-2 py-2">
                      {tx.date ? tx.date.toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-2 py-2">{tx.product || "—"}</td>
                    <td className="px-2 py-2">{tx.quantity || "—"}</td>
                    <td className="px-2 py-2">{formatMoney(tx.sellingPrice, currency)}</td>
                    <td className="px-2 py-2">{formatMoney(tx.costPrice, currency)}</td>
                    <td className="px-2 py-2 font-medium text-primary">{formatMoney(tx.revenue, currency)}</td>
                    <td className="px-2 py-2 text-muted">{tx.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard">
          <Button>{t("study.goDash")}</Button>
        </Link>
        <Link href="/simulator">
          <Button variant="outline">{t("study.goSim")}</Button>
        </Link>
      </div>
    </div>
  );
}
