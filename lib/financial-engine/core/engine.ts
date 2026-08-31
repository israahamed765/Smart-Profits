import { runFullAnalysis } from "./analytics";
import { generateDemoTransactions } from "./sample-data";
import type { AppSettings, ParseResult, TaxonomyMap } from "../types";

export function demoParseResult(): ParseResult {
  const transactions = generateDemoTransactions();
  return {
    transactions,
    mapping: {
      mapping: {
        date: "التاريخ",
        product: "اسم المنتج",
        quantity: "الكمية",
        sellingPrice: "سعر البيع",
        costPrice: "سعر التكلفة",
        category: "الفئة",
        expense: "المصروف",
        expenseType: "نوع المصروف",
        notes: "الملاحظات",
      },
      scores: {
        date: 100,
        product: 100,
        quantity: 100,
        sellingPrice: 100,
        costPrice: 100,
        category: 100,
        expense: 100,
        expenseType: 100,
        notes: 100,
      },
      headers: [
        "التاريخ",
        "اسم المنتج",
        "الكمية",
        "سعر البيع",
        "سعر التكلفة",
        "الفئة",
        "المصروف",
        "نوع المصروف",
        "الملاحظات",
      ],
      unmappedHeaders: [],
      warnings: [],
    },
    fileName: "بيانات تجريبية.csv",
    rowCount: transactions.length,
    skippedRows: 0,
    warnings: ["This is demo data. Upload an Excel, CSV, or PDF file to see your store numbers. / هذه بيانات تجريبية للعرض. ارفع ملف Excel أو CSV أو PDF لرؤية أرقام متجرك."],
    sheetName: "بيانات تجريبية",
    sheets: [
      {
        name: "بيانات تجريبية",
        role: "detail",
        rows: transactions.length,
        validRows: transactions.length,
      },
    ],
    cleaning: {
      sourceRows: transactions.length,
      validRows: transactions.length,
      skippedRows: 0,
      columnsDetected: 9,
      columnsMapped: 9,
      valuesFixed: 0,
      duplicatesRemoved: 0,
      reviewNeeded: 0,
    },
  };
}

export function analyzeParsed(parsed: ParseResult, settings: AppSettings, taxonomy?: TaxonomyMap) {
  return runFullAnalysis(parsed, settings, taxonomy);
}
