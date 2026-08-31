import type { ActionLogEntry, AppSettings, ParseResult, TaxonomyMap, Transaction } from "../types";
import { sanitizeParseResult } from "../core/financial-integrity";

interface SerializedParseResult extends Omit<ParseResult, "transactions"> {
  transactions: Array<Omit<Transaction, "date"> & { date: string | null }>;
}

export interface PersistedFile {
  id: string;
  fileName: string;
  uploadedAt: string;
  isDemo: boolean;
  parseResult: SerializedParseResult;
}

export interface PersistedWorkspace {
  version: 2;
  settings: AppSettings;
  activeFileId: string;
  files: PersistedFile[];
  actionLog: ActionLogEntry[];
  taxonomy?: TaxonomyMap;
  ownerEmail?: string;
  savedAt?: string;
}

export interface PersistedAnalysis {
  settings: AppSettings;
  parseResult: SerializedParseResult;
}

export function serializeParseResult(parsed: ParseResult): SerializedParseResult {
  return {
    ...parsed,
    transactions: parsed.transactions.map((tx) => ({
      ...tx,
      date: tx.date ? tx.date.toISOString() : null,
    })),
  };
}

/** Revive a persisted ISO string, or keep a Date that skipped serialization. */
function reviveTransactionDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if ((value as object) instanceof Date) return value as Date;
  return new Date(value as string);
}

export function deserializeParseResult(parsed: SerializedParseResult): ParseResult {
  const raw = parsed && typeof parsed === "object" ? parsed : ({} as SerializedParseResult);
  return sanitizeParseResult({
    ...raw,
    transactions: Array.isArray(raw.transactions)
      ? raw.transactions.map((tx) => ({
          ...tx,
          date: reviveTransactionDate(tx.date),
        }))
      : [],
  });
}
