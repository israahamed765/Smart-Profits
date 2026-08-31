import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFullAnalysis } from "@/lib/analytics";
import { deserializeParseResult, serializeParseResult } from "@/lib/serialize";
import { workspaceSaveSchema } from "@/server/validators/workspace.validator";
import { parseResultFromTx, saleTx, zeroOpexSettings } from "./helpers";

describe("parseResult forgery", () => {
  it("ignores a spoofed kpis object on ParseResult and recomputes from transactions", () => {
    const honest = parseResultFromTx([saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10 })]);
    const spoofed = {
      ...honest,
      kpis: { netProfit: 999_999_999, totalRevenue: 999_999_999 },
    };
    const result = runFullAnalysis(spoofed as typeof honest, zeroOpexSettings);
    assert.equal(result.kpis.netProfit, 80);
    assert.equal(result.kpis.totalRevenue, 100);
    assert.notEqual(result.kpis.netProfit, 999_999_999);
  });

  it("recomputes transaction.revenue from sellingPrice × quantity when both exist (security fix)", () => {
    const tx = saleTx({ quantity: 2, sellingPrice: 50, costPrice: 10, revenue: 9_999_999 });
    const result = runFullAnalysis(parseResultFromTx([tx]), zeroOpexSettings);
    assert.equal(2 * 50, 100);
    assert.equal(result.kpis.totalRevenue, 100);
    assert.notEqual(result.kpis.totalRevenue, 9_999_999);
  });

  it("workspace validator currently accepts a forged parseResult without checking profit", () => {
    const parsed = workspaceSaveSchema.safeParse({
      workspace: {
        files: [
          {
            id: "forged-1",
            fileName: "fake.csv",
            parseResult: {
              kpis: { netProfit: 999_999_999 },
              transactions: [],
            },
          },
        ],
      },
    });
    assert.equal(parsed.success, true);
  });

  it("rejects an empty workspace", () => {
    const parsed = workspaceSaveSchema.safeParse({ workspace: { files: [] } });
    assert.equal(parsed.success, false);
  });
});

describe("parseResult date serialize/deserialize", () => {
  it("writes Date as ISO and reads the same instant back", () => {
    const at = new Date("2026-01-15T12:00:00.000Z");
    const parsed = parseResultFromTx([saleTx({ quantity: 1, sellingPrice: 10, costPrice: 4, date: at })]);
    const serialized = serializeParseResult(parsed);
    assert.equal(serialized.transactions[0].date, "2026-01-15T12:00:00.000Z");
    const restored = deserializeParseResult(serialized);
    assert.equal(restored.transactions[0].date instanceof Date, true);
    assert.equal(restored.transactions[0].date?.toISOString(), at.toISOString());
  });

  it("keeps null dates as null", () => {
    const parsed = parseResultFromTx([
      { ...saleTx({ quantity: 1, sellingPrice: 10, costPrice: 4 }), date: null },
    ]);
    const serialized = serializeParseResult(parsed);
    assert.equal(serialized.transactions[0].date, null);
    const restored = deserializeParseResult(serialized);
    assert.equal(restored.transactions[0].date, null);
  });

  it("keeps an already-revived Date on deserialize", () => {
    const at = new Date("2026-03-01T00:00:00.000Z");
    const parsed = parseResultFromTx([saleTx({ quantity: 1, sellingPrice: 10, costPrice: 4, date: at })]);
    const serialized = serializeParseResult(parsed);
    const withDate = {
      ...serialized,
      transactions: serialized.transactions.map((tx) => ({ ...tx, date: at })),
    };
    const restored = deserializeParseResult(withDate as unknown as typeof serialized);
    assert.equal(restored.transactions[0].date instanceof Date, true);
    assert.equal(restored.transactions[0].date?.getTime(), at.getTime());
  });
});
