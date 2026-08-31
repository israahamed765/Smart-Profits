import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runFullAnalysis as runViaShim } from "@/lib/analytics";
import { runFullAnalysis as runViaCore } from "@/lib/financial-engine/core/analytics";
import { simulateWhatIf } from "@/lib/advisor";
import { parseCsvText } from "@/server/financial-engine/parser";
import { analyzeFinancialFile } from "@/server/financial-engine/analysis";
import { POST as analyzePost } from "@/app/api/analyze/route";
import { parseResultFromTx, saleTx, zeroOpexSettings, merchantRequest } from "./helpers";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const GOLDEN_CSV = `date,product,quantity,price,cost
2026-01-15,A,10,50,20
2026-01-15,B,2,100,40
`;

describe("P8 financial engine boundary", () => {
  it("shim analytics and core analytics produce identical golden KPIs", () => {
    const parsed = parseResultFromTx([
      saleTx({ quantity: 10, sellingPrice: 50, costPrice: 20, product: "A" }),
      saleTx({ quantity: 2, sellingPrice: 100, costPrice: 40, product: "B" }),
    ]);
    const viaShim = runViaShim(parsed, zeroOpexSettings);
    const viaCore = runViaCore(parsed, zeroOpexSettings);
    assert.equal(viaShim.kpis.totalRevenue, 700);
    assert.equal(viaShim.kpis.totalCogs, 280);
    assert.equal(viaShim.kpis.netProfit, 420);
    assert.equal(viaShim.kpis.profitMargin, 60);
    assert.deepEqual(viaShim.kpis, viaCore.kpis);
    assert.deepEqual(viaShim.monthlySeries, viaCore.monthlySeries);
  });

  it("advisor what-if is unchanged through the shim", () => {
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
    assert.ok(sim.newUnitProfit < 0);
  });

  it("parser CSV ingest + core analysis matches golden KPIs", async () => {
    const parsed = await parseCsvText(GOLDEN_CSV, "sales.csv");
    const result = runViaCore(parsed, zeroOpexSettings);
    assert.equal(result.kpis.totalRevenue, 700);
    assert.equal(result.kpis.totalCogs, 280);
    assert.equal(result.kpis.netProfit, 420);
    assert.equal(result.kpis.profitMargin, 60);
  });

  it("POST /api/analyze still returns { parsed, result } with the same KPIs", async () => {
    const file = new File([GOLDEN_CSV], "sales.csv", { type: "text/csv" });
    const form = new FormData();
    form.append("file", file);
    form.append("settings", JSON.stringify(zeroOpexSettings));
    const request = await merchantRequest("http://localhost:3000/api/analyze", {
      method: "POST",
      email: "p8-merchant@test.com",
      body: form,
    });
    const response = await analyzePost(request);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      parsed?: { rowCount?: number };
      result?: { kpis?: { totalRevenue: number; totalCogs: number; netProfit: number; profitMargin: number } };
    };
    assert.ok(body.parsed);
    assert.ok(body.result);
    assert.equal(body.result.kpis?.totalRevenue, 700);
    assert.equal(body.result.kpis?.totalCogs, 280);
    assert.equal(body.result.kpis?.netProfit, 420);
    assert.equal(body.result.kpis?.profitMargin, 60);
  });

  it("analyzeFinancialFile is the server entry and does not change KPI math", async () => {
    const file = new File([GOLDEN_CSV], "sales.csv", { type: "text/csv" });
    const { parsed, result } = await analyzeFinancialFile(file, zeroOpexSettings);
    assert.ok(parsed.rowCount >= 2);
    assert.equal(result.kpis.totalRevenue, 700);
    assert.equal(result.kpis.netProfit, 420);
  });

  it("lib/parser.ts and lib/engine-upload.ts are stubs, not server re-exports", () => {
    const parser = source("./lib/parser.ts");
    const upload = source("./lib/engine-upload.ts");
    assert.match(parser, /export \{\}/);
    assert.match(upload, /export \{\}/);
    assert.doesNotMatch(parser, /export \* from ["']@\/server\/financial-engine/);
    assert.doesNotMatch(upload, /export \* from ["']@\/server\/financial-engine/);
    assert.doesNotMatch(parser, /parseFinancialFile/);
    assert.doesNotMatch(upload, /analyzeUploadedFile/);
  });

  it("client-safe engine module does not import parser or upload", () => {
    const engine = source("./lib/engine.ts");
    const coreEngine = source("./lib/financial-engine/core/engine.ts");
    for (const text of [engine, coreEngine]) {
      assert.doesNotMatch(text, /parser/);
      assert.doesNotMatch(text, /engine-upload/);
      assert.doesNotMatch(text, /analyzeUploadedFile/);
      assert.doesNotMatch(text, /xlsx/);
      assert.doesNotMatch(text, /unpdf/);
      assert.doesNotMatch(text, /tesseract/);
    }
  });

  it("no Client module imports server/financial-engine or Node ingest packages", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    const clientFiles = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return /["']use client["']/.test(text);
    });
    assert.ok(clientFiles.length > 0);
    const leak =
      /from\s+["']xlsx["']|await\s+import\(\s*["']xlsx["']\s*\)|from\s+["']unpdf["']|await\s+import\(\s*["']unpdf["']\s*\)|from\s+["']tesseract(?:\.js)?["']|@\/server\/financial-engine|@\/lib\/parser["']|@\/lib\/engine-upload["']|@\/lib\/pdf-extract["']|@\/lib\/ocr["']/;
    for (const file of clientFiles) {
      const text = readFileSync(file, "utf8");
      assert.equal(leak.test(text), false, `client leak in ${file}`);
    }
  });

  it("POST /api/analyze still lives at the same path and uses the analysis service", () => {
    const route = source("./app/api/analyze/route.ts");
    const handler = source("./backend/src/http/analyze-post.ts");
    assert.match(route, /analyze-post/);
    assert.match(handler, /analyzeMerchantFile/);
    assert.match(handler, /analyze\.service|services\/analyze/);
    assert.doesNotMatch(handler, /@\/lib\/parser/);
    assert.doesNotMatch(route, /export const GET/);
  });
});
