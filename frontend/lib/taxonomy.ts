import { normalizeEmail } from "./tenant";
import type { FinancialBucket, TaxonomyEntry, TaxonomyMap } from "@/lib/types";

export const TAXONOMY_PREFIX = "smartprofit-taxonomy:";

export function taxonomyKey(email: string) {
  return `${TAXONOMY_PREFIX}${normalizeEmail(email)}`;
}

export function emptyTaxonomy(): TaxonomyMap {
  return {};
}

export function readTaxonomy(email?: string | null): TaxonomyMap {
  if (!email || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(taxonomyKey(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TaxonomyMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeTaxonomy(email: string, taxonomy: TaxonomyMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(taxonomyKey(email), JSON.stringify(taxonomy));
  } catch {
    // quota
  }
}

export function upsertTaxonomyTerm(
  taxonomy: TaxonomyMap,
  input: { key: string; term: string; side: "revenue" | "opex"; bucket: FinancialBucket },
): TaxonomyMap {
  const entry: TaxonomyEntry = {
    key: input.key,
    term: input.term,
    side: input.side,
    bucket: input.bucket,
    updatedAt: new Date().toISOString(),
  };
  return { ...taxonomy, [input.key]: entry };
}
