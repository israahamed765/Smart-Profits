import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFullAnalysis } from "@/lib/analytics";
import { simulateWhatIf } from "@/lib/advisor";
import { parseResultFromTx, saleTx, zeroOpexSettings } from "./helpers";

describe("financial engine", () => {
  it("computes revenue, COGS, net profit and margin from line items", () => {
    const parsed = parseResultFromTx([
      saleTx({ quantity: 10, sellingPrice: 50, costPrice: 20, product: "A" }),
      saleTx({ quantity: 2, sellingPrice: 100, costPrice: 40, product: "B" }),
    ]);
    const result = runFullAnalysis(parsed, zeroOpexSettings);

    assert.equal(result.kpis.totalRevenue, 700);
    assert.equal(result.kpis.totalCogs, 280);
    assert.equal(result.kpis.netProfit, 420);
    assert.equal(result.kpis.profitMargin, 60);
  });

  it("subtracts operating expenses from settings when they are not in the file", () => {
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

  it("keeps amounts unchanged when currency is USD (no silent conversion)", () => {
    const parsed = parseResultFromTx([saleTx({ quantity: 1, sellingPrice: 10, costPrice: 4 })]);
    const result = runFullAnalysis(parsed, { ...zeroOpexSettings, defaultCurrency: "USD" });
    assert.equal(result.kpis.totalRevenue, 10);
    assert.equal(result.kpis.netProfit, 6);
  });

  it("simulateWhatIf flags a price below cost", () => {
    const item = {
      name: "Widget",
      saleCount: 10,
      quantity: 10,
      revenue: 500,
      cogs: 300,
      profit: 200,
      margin: 40,
      isLoss: false,
    };
    const sim = simulateWhatIf(item, 20, 30);
    assert.equal(sim.verdictKey, "sim.v.belowCost");
    assert.ok(sim.newUnitProfit < 0);
  });

  it("produces a forecast series for multi-month data", () => {
    const parsed = parseResultFromTx([
      saleTx({ date: new Date("2026-01-10"), quantity: 5, sellingPrice: 40, costPrice: 10 }),
      saleTx({ date: new Date("2026-02-10"), quantity: 6, sellingPrice: 40, costPrice: 10 }),
      saleTx({ date: new Date("2026-03-10"), quantity: 7, sellingPrice: 40, costPrice: 10 }),
    ]);
    const result = runFullAnalysis(parsed, zeroOpexSettings);
    assert.equal(result.monthlySeries.length, 3);
    assert.ok(result.forecast.series.length > 0);
    assert.ok(result.advisor.health.score >= 0);
  });
});
