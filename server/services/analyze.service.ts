import { analyzeFinancialFile } from "@/server/financial-engine/analysis";
import type { AppSettings, TaxonomyMap } from "@/shared/types/financial";

/**
 * API → Service entry for POST /api/analyze.
 * Parsing stays server-only; KPI formulas stay in lib/financial-engine/core (one source of truth).
 */
export async function analyzeMerchantFile(file: File, settings: AppSettings, taxonomy?: TaxonomyMap) {
  return analyzeFinancialFile(file, settings, taxonomy);
}
