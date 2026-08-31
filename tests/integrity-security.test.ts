import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFullAnalysis } from "@/lib/analytics";
import { simulateWhatIf } from "@/lib/advisor";
import { canonicalizeTransaction, sanitizeParseResult } from "@/lib/financial-integrity";
import { serializeParseResult, deserializeParseResult } from "@/lib/serialize";
import { workspaceSaveSchema } from "@/server/validators/workspace.validator";
import { parseSensitiveAction, resolveGuardIdentity } from "@/server/smart-guard/identity";
import { GET as workspaceGet } from "@/app/api/workspace/route";
import { AppError } from "@/server/errors";
import { parseResultFromTx, saleTx, zeroOpexSettings, merchantRequest } from "./helpers";

describe("integrity TEST 1 fake parseResult KPIs", () => {
  it("does not trust client kpis / netProfit / advisor on parseResult", () => {
    const honest = parseResultFromTx([saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10 })]);
    const fake = {
      ...honest,
      kpis: { netProfit: 999_999_999, totalRevenue: 999_999_999, profitMargin: 99 },
      result: { netProfit: 999_999_999 },
      advisor: { health: { score: 100 } },
      monthlySeries: [{ revenue: 999_999_999, netProfit: 999_999_999 }],
    };
    const cleaned = sanitizeParseResult(fake);
    assert.equal("kpis" in cleaned, false);
    assert.equal("result" in cleaned, false);
    assert.equal("advisor" in cleaned, false);

    const analysis = runFullAnalysis(fake as typeof honest, zeroOpexSettings);
    assert.equal(analysis.kpis.totalRevenue, 100);
    assert.equal(analysis.kpis.netProfit, 80);
    assert.notEqual(analysis.kpis.netProfit, 999_999_999);
  });
});

describe("integrity TEST 2 forged line revenue", () => {
  it("cannot inflate totals with revenue 9999999 when price is 50 and qty is 2", () => {
    const tx = saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10, revenue: 9_999_999 });
    const analysis = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(analysis.kpis.totalRevenue, 100);
    assert.equal(analysis.kpis.totalCogs, 20);
    assert.equal(analysis.kpis.netProfit, 80);
  });

  it("also ignores a forged originalAmount that classify.ts used to prefer", () => {
    const tx = {
      ...saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10, revenue: 100 }),
      originalAmount: 9_999_999,
    };
    const analysis = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(analysis.kpis.totalRevenue, 100);
  });
});

describe("integrity TEST 3 negative quantity", () => {
  it("keeps the signed amount (returns/adjustments) and stays finite", () => {
    const tx = canonicalizeTransaction(
      saleTx({ quantity: -2, sellingPrice: 50, costPrice: 10, revenue: 9_999_999 }),
    );
    assert.equal(tx.quantity, -2);
    assert.equal(tx.revenue, -100);
    assert.equal(Number.isFinite(tx.revenue), true);
    const analysis = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(Number.isFinite(analysis.kpis.totalRevenue), true);
    assert.equal(Number.isNaN(analysis.kpis.totalRevenue), false);
  });
});

describe("integrity TEST 4 negative price", () => {
  it("keeps the signed price and stays finite", () => {
    const tx = canonicalizeTransaction(
      saleTx({ quantity: 2, sellingPrice: -50, costPrice: 10, revenue: 9_999_999 }),
    );
    assert.equal(tx.sellingPrice, -50);
    assert.equal(tx.revenue, -100);
    const analysis = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(Number.isFinite(analysis.kpis.netProfit), true);
  });
});

describe("integrity TEST 5 extreme magnitudes", () => {
  it("does not produce NaN or Infinity", () => {
    const tx = canonicalizeTransaction({
      quantity: 1e20,
      sellingPrice: 1e20,
      costPrice: 1e20,
      revenue: Number.MAX_VALUE,
    });
    assert.equal(Number.isFinite(tx.quantity), true);
    assert.equal(Number.isFinite(tx.sellingPrice), true);
    assert.equal(Number.isFinite(tx.revenue), true);
    assert.notEqual(tx.revenue, Number.POSITIVE_INFINITY);
    const analysis = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(Number.isFinite(analysis.kpis.totalRevenue), true);
    assert.equal(Number.isFinite(analysis.kpis.netProfit), true);
    assert.equal(Number.isFinite(analysis.kpis.profitMargin), true);
  });
});

describe("integrity TEST 6 NaN Infinity invalid strings", () => {
  it("normalizes NaN, Infinity, and invalid numeric strings to finite values", () => {
    const tx = canonicalizeTransaction({
      quantity: "nope",
      sellingPrice: Number.NaN,
      costPrice: Number.POSITIVE_INFINITY,
      revenue: Number.NEGATIVE_INFINITY,
      expense: "abc",
    });
    assert.equal(Number.isFinite(tx.quantity), true);
    assert.equal(Number.isFinite(tx.sellingPrice), true);
    assert.equal(Number.isFinite(tx.costPrice), true);
    assert.equal(Number.isFinite(tx.revenue), true);
    assert.equal(Number.isFinite(tx.expense), true);
    assert.equal(Number.isNaN(tx.revenue), false);
  });
});

describe("integrity TEST 7 extra unknown financial fields", () => {
  it("drops extra fields so they cannot override engine output", () => {
    const cleaned = sanitizeParseResult({
      fileName: "x.csv",
      netProfit: 777,
      totalRevenue: 777,
      kpis: { netProfit: 777 },
      transactions: [
        {
          ...saleTx({ quantity: 1, sellingPrice: 10, costPrice: 4, revenue: 10 }),
          netProfit: 777,
          margin: 99,
          kpis: { netProfit: 777 },
        },
      ],
    });
    assert.equal("kpis" in cleaned, false);
    assert.equal("netProfit" in cleaned, false);
    assert.equal("totalRevenue" in cleaned, false);
    assert.equal("netProfit" in cleaned.transactions[0], false);
    assert.equal(cleaned.transactions[0].revenue, 10);

    const analysis = runFullAnalysis(cleaned, zeroOpexSettings);
    assert.equal(analysis.kpis.netProfit, 6);
    assert.notEqual(analysis.kpis.netProfit, 777);
  });
});

describe("integrity TEST 8 workspace IDOR", () => {
  it("rejects reading another merchant workspace without a session", async () => {
    const request = new Request("http://localhost:3000/api/workspace", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const response = await workspaceGet(request);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { workspace?: unknown };
    assert.equal(body.workspace, undefined);
  });

  it("does not let body.email steal file_upload identity", async () => {
    const request = await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
      method: "POST",
      email: "alice@store.com",
      body: JSON.stringify({ action: "file_upload", email: "bob@store.com" }),
    });
    const resolved = await resolveGuardIdentity(request, { action: "file_upload", email: "bob@store.com" });
    assert.equal(resolved.email, "alice@store.com");
  });
});

describe("integrity TEST 9 legitimate workspace save", () => {
  it("still accepts the existing POST body shape and keeps honest line items", () => {
    const honest = parseResultFromTx([saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10 })]);
    const body = {
      workspace: {
        version: 2,
        activeFileId: "f1",
        files: [
          {
            id: "f1",
            fileName: "sales.csv",
            uploadedAt: new Date().toISOString(),
            isDemo: false,
            parseResult: serializeParseResult(honest),
          },
        ],
      },
    };
    const parsed = workspaceSaveSchema.safeParse(body);
    assert.equal(parsed.success, true);

    const restored = deserializeParseResult(body.workspace.files[0].parseResult);
    assert.equal(restored.transactions[0].revenue, 100);
    assert.equal(restored.transactions[0].sellingPrice, 50);
    assert.equal(restored.transactions[0].quantity, 2);
  });
});

describe("integrity TEST 10 legitimate analysis unchanged", () => {
  it("keeps the known golden totals, what-if, and forecast shape", () => {
    const parsed = parseResultFromTx([
      saleTx({ quantity: 10, sellingPrice: 50, costPrice: 20, product: "A" }),
      saleTx({ quantity: 2, sellingPrice: 100, costPrice: 40, product: "B" }),
    ]);
    const result = runFullAnalysis(parsed, zeroOpexSettings);
    assert.equal(result.kpis.totalRevenue, 700);
    assert.equal(result.kpis.totalCogs, 280);
    assert.equal(result.kpis.netProfit, 420);
    assert.equal(result.kpis.profitMargin, 60);
    assert.equal(result.kpis.totalOpex, 0);
    assert.ok(result.monthlySeries.length >= 1);
    assert.ok(result.forecast.series.length > 0);
    assert.ok(result.advisor.health.score >= 0);

    const sim = simulateWhatIf(
      {
        name: "Widget",
        saleCount: 10,
        quantity: 10,
        revenue: 500,
        cogs: 300,
        profit: 200,
        margin: 40,
        isLoss: false,
      },
      20,
      30,
    );
    assert.equal(sim.verdictKey, "sim.v.belowCost");
  });

  it("keeps opex-from-settings net profit at 600", () => {
    const parsed = parseResultFromTx([saleTx({ quantity: 1, sellingPrice: 1000, costPrice: 200 })]);
    const result = runFullAnalysis(parsed, {
      ...zeroOpexSettings,
      opexIncludedInFile: false,
      rent: 100,
      salaries: 50,
      utilities: 25,
      otherOpex: 25,
    });
    assert.equal(result.kpis.totalRevenue, 1000);
    assert.equal(result.kpis.totalCogs, 200);
    assert.equal(result.kpis.totalOpex, 200);
    assert.equal(result.kpis.netProfit, 600);
  });
});

describe("integrity extras", () => {
  it("keeps revenue-column-only rows when there is no unit price", () => {
    const tx = canonicalizeTransaction({
      quantity: 1,
      sellingPrice: 0,
      costPrice: 0,
      revenue: 250,
      expense: 0,
      product: "Service",
    });
    assert.equal(tx.revenue, 250);
  });

  it("keeps expense rows and does not turn them into sales", () => {
    const tx = canonicalizeTransaction({
      quantity: 1,
      sellingPrice: 0,
      costPrice: 0,
      revenue: 0,
      expense: 8500,
      product: "شحن وتوصيل",
      bucket: "opex",
    });
    assert.equal(tx.revenue, 0);
    assert.equal(tx.expense, 8500);
  });

  it("still rejects unknown sensitive actions", () => {
    assert.throws(() => parseSensitiveAction("wipe-ledger"), AppError);
  });
});
