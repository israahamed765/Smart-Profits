import { apiFetch } from "@/frontend/lib/api/client";
import {
  GuardBlockedError,
  publishGuardVerdict,
  verdictFromPayload,
} from "@/frontend/lib/smart-guard/client";
import type { CurrencyCode } from "@/lib/types";
import type { ReportExportResponse, ReportExportScope } from "@/shared/types/report-export";
import type { GuardVerdict } from "@/lib/smart-guard/types";

export function downloadHtmlFile(fileName: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".html") ? fileName : `${fileName}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintableReport(html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1024,height=720");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    try {
      popup.print();
    } catch {
      // user can print manually
    }
  }, 450);
  return true;
}

export async function exportMonthlyReport(
  args: {
    monthKey: string;
    mode: "html" | "pdf";
    scope?: ReportExportScope;
    currency?: CurrencyCode;
    fileId?: string;
  },
  onGuardVerdict?: (verdict: GuardVerdict) => void,
) {
  const response = await apiFetch("/api/reports/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = (await response.json()) as ReportExportResponse & { error?: string; verdict?: GuardVerdict };

  if (!response.ok) {
    const verdict = verdictFromPayload(data) ?? data.verdict ?? null;
    if (verdict) {
      publishGuardVerdict(verdict);
      onGuardVerdict?.(verdict);
      throw new GuardBlockedError(verdict);
    }
    throw new Error(data.error || "تعذر تصدير التقرير.");
  }

  if (args.mode === "html") {
    downloadHtmlFile(data.fileName, data.html);
    return;
  }
  const opened = openPrintableReport(data.html);
  if (!opened) downloadHtmlFile(data.fileName, data.html);
}
