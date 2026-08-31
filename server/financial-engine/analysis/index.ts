import { runFullAnalysis } from "@/lib/financial-engine/core/analytics";
import { parseFinancialFile } from "../parser";
import type { AppSettings, TaxonomyMap } from "@/lib/financial-engine/types";

/**
 * Server analysis entry point used by POST /api/analyze.
 * Parsing stays server-only; KPI formulas come from the client-safe core (one source of truth).
 */
export async function analyzeFinancialFile(file: File, settings: AppSettings, taxonomy?: TaxonomyMap) {
  const parsed = await parseFinancialFile(file);
  const result = runFullAnalysis(parsed, settings, taxonomy);
  return { parsed, result };
}
