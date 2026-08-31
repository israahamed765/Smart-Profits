import type { AppSettings, ParseResult, Transaction } from "@/lib/types";
import { createMerchantToken } from "@/server/crypto/session";

export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_HOST = "localhost:3000";

export const zeroOpexSettings: AppSettings = {
  storeName: "Test Store",
  ownerName: "Tester",
  defaultCurrency: "SAR",
  rent: 0,
  salaries: 0,
  utilities: 0,
  otherOpex: 0,
  opexIncludedInFile: true,
  opexSetupCompleted: true,
};

export function saleTx(partial: Partial<Transaction> & Pick<Transaction, "quantity" | "sellingPrice" | "costPrice">): Transaction {
  const quantity = partial.quantity;
  const sellingPrice = partial.sellingPrice;
  const costPrice = partial.costPrice;
  return {
    date: partial.date ?? new Date("2026-01-15T12:00:00Z"),
    product: partial.product ?? "Widget",
    sku: partial.sku ?? "W1",
    quantity,
    sellingPrice,
    costPrice,
    revenue: partial.revenue ?? sellingPrice * quantity,
    expense: partial.expense ?? 0,
    category: partial.category ?? "عام",
    expenseType: partial.expenseType ?? "",
    notes: partial.notes ?? "",
    bucket: partial.bucket ?? "revenue",
  };
}

export function parseResultFromTx(transactions: Transaction[], fileName = "sales.csv"): ParseResult {
  return {
    transactions,
    mapping: {
      mapping: { date: "date", product: "product", quantity: "qty", sellingPrice: "price", costPrice: "cost" },
      scores: {},
      headers: ["date", "product", "qty", "price", "cost"],
      unmappedHeaders: [],
      warnings: [],
    },
    fileName,
    rowCount: transactions.length,
    skippedRows: 0,
    warnings: [],
    cleaning: {
      sourceRows: transactions.length,
      validRows: transactions.length,
      skippedRows: 0,
      columnsDetected: 5,
      columnsMapped: 5,
      valuesFixed: 0,
      duplicatesRemoved: 0,
      reviewNeeded: 0,
    },
  };
}

export async function merchantRequest(
  url: string,
  init: RequestInit & { email?: string; name?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("host", TEST_HOST);
  if (init.method && init.method !== "GET" && !headers.has("origin")) {
    headers.set("origin", TEST_ORIGIN);
  }
  if (init.email) {
    const token = await createMerchantToken({ email: init.email, fullName: init.name || "Merchant" });
    headers.set("cookie", `sp_session=${token}`);
  }
  if (init.body && !headers.has("content-type") && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  return new Request(url, { ...init, headers });
}
