import { FileParseError } from "@/lib/financial-engine/types";
import { preferRicherTable, rowsFromPlainText, tableFromPositionedItems, type PositionedItem } from "./table-extract";

const MAX_PAGES = 40;

function clonePdfBytes(buffer: ArrayBuffer) {
  const source = new Uint8Array(buffer);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function textItemsFromContent(content: { items: unknown[] }): PositionedItem[] {
  const items: PositionedItem[] = [];
  for (const item of content.items) {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) continue;
    const raw = item as {
      str: string;
      width: number;
      height: number;
      transform: number[];
    };
    const str = raw.str ?? "";
    if (!str.trim()) continue;
    const transform = raw.transform ?? [];
    items.push({
      str,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: raw.width ?? 0,
      height: raw.height ?? 0,
      fontSize: Math.hypot(transform[0] ?? 0, transform[1] ?? 0) || raw.height || 10,
    });
  }
  return items;
}

function pagePlainText(content: { items: unknown[] }) {
  return content.items
    .map((item) => {
      if (!item || typeof item !== "object" || !("str" in item)) return "";
      const raw = item as { str: string; hasEOL?: boolean };
      return `${raw.str ?? ""}${raw.hasEOL ? "\n" : " "}`;
    })
    .join("")
    .trim();
}

export async function extractRowsFromPdf(buffer: ArrayBuffer) {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  let pageCount = 0;
  let pages: PositionedItem[][] = [];
  let texts: string[] = [];

  try {
    pdf = await getDocumentProxy(clonePdfBytes(buffer).slice());
    pageCount = pdf.numPages;
    const readable = Math.min(pdf.numPages, MAX_PAGES);

    for (let pageNumber = 1; pageNumber <= readable; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsFromContent(content));
      texts.push(pagePlainText(content));
      page.cleanup();
    }
  } catch (error) {
    if (error instanceof FileParseError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/detached|structuredClone|DataCloneError/i.test(message)) {
      throw new FileParseError("تعذر قراءة ملف PDF في المتصفح. أعد رفع الملف مرة أخرى، أو استخدم Excel/CSV.");
    }
  } finally {
    await pdf?.destroy();
  }

  const tableRows = pages.length ? tableFromPositionedItems(pages) : null;
  const textRows = rowsFromPlainText(texts.join("\n"));
  const chosen = preferRicherTable(tableRows, textRows);
  if (chosen?.length) {
    const usedText = chosen === textRows && chosen !== tableRows;
    return { rows: chosen, pageCount, method: usedText ? ("text" as const) : ("table" as const) };
  }

  const { extractRowsFromPdfImages } = await import("./ocr");
  const ocrRows = await extractRowsFromPdfImages(buffer);
  if (ocrRows?.length) {
    return { rows: ocrRows, pageCount, method: "ocr" as const };
  }

  throw new FileParseError(
    "تعذر استخراج جدول من الملف. ارفع صورة أو PDF يظهر فيها أعمدة مثل التاريخ واسم المنتج والكمية وسعر البيع.",
  );
}
