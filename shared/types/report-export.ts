import type { CurrencyCode } from "./financial";

export type ReportExportScope = "month" | "all";
export type ReportExportMode = "html" | "pdf";

export interface ReportExportRequest {
  monthKey: string;
  mode: ReportExportMode;
  scope?: ReportExportScope;
  currency?: CurrencyCode;
  fileId?: string;
}

export interface ReportExportResponse {
  ok: true;
  fileName: string;
  html: string;
  mode: ReportExportMode;
}
