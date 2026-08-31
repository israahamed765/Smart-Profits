import { runFullAnalysis } from "@/lib/financial-engine/core/analytics";
import { parseFinancialFile } from "../parser";
import type { AppSettings, TaxonomyMap } from "@/lib/financial-engine/types";

/**
 * Server-oriented file ingest. Do not import this module from Client code.
 * Live upload uses POST /api/analyze, which calls parseFinancialFile + runFullAnalysis directly.
 */
export async function analyzeUploadedFile(file: File, settings: AppSettings, taxonomy?: TaxonomyMap) {
  const parsed = await parseFinancialFile(file);
  return { parsed, result: runFullAnalysis(parsed, settings, taxonomy) };
}
