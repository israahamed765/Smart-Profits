import { analyzeParsed } from "@/lib/financial-engine/core/engine";
import { normalizeOpexSettings } from "@/lib/financial-engine/core/opex";
import { deserializeParseResult } from "@/lib/financial-engine/serialization";
import { AppError } from "@/server/errors";
import { buildMonthlyReportHtml } from "@/server/reports/monthly-report";
import type { ReportExportRequest } from "@/shared/types/report-export";
import { getMerchantWorkspace } from "./workspace.service";

export async function buildSecuredMonthlyReport(email: string, input: ReportExportRequest) {
  const workspace = await getMerchantWorkspace(email);
  if (!workspace?.files?.length) {
    throw new AppError("لا توجد بيانات محفوظة للتصدير. ارفعي ملفاً أولاً.", 400);
  }

  const fileId = input.fileId || workspace.activeFileId;
  const file = workspace.files.find((row) => row.id === fileId);
  if (!file) {
    throw new AppError("الملف المطلوب غير موجود في مساحة العمل.", 404);
  }

  const settings = normalizeOpexSettings(workspace.settings);
  const parseResult = deserializeParseResult(file.parseResult);
  const result = analyzeParsed(parseResult, settings, workspace.taxonomy);
  const currency = input.currency || settings.defaultCurrency || "SAR";
  const scope = input.scope ?? "month";

  const built = buildMonthlyReportHtml({
    monthKey: input.monthKey,
    result,
    settings,
    currency,
    transactions: parseResult.transactions,
    storeName: settings.storeName,
    scope,
  });

  return {
    ok: true as const,
    fileName: built.fileName,
    html: built.html,
    mode: input.mode,
  };
}
