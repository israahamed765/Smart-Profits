import { rowsFromPlainText, tableFromPositionedItems, type PositionedItem } from "./table-extract";
import { FileParseError } from "@/lib/financial-engine/types";

const MAX_OCR_PAGES = 8;

function wordsToItems(
  words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>,
): PositionedItem[] {
  return words
    .filter((word) => word.text?.trim())
    .map((word) => ({
      str: word.text.trim(),
      x: word.bbox.x0,
      y: -word.bbox.y0,
      width: Math.max(1, word.bbox.x1 - word.bbox.x0),
      height: Math.max(1, word.bbox.y1 - word.bbox.y0),
      fontSize: Math.max(8, word.bbox.y1 - word.bbox.y0),
    }));
}

async function recognizeImage(image: File | Blob | string) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("ara+eng");
  try {
    const result = await worker.recognize(image);
    const words =
      result.data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((line) =>
            line.words.map((word) => ({
              text: word.text,
              bbox: word.bbox,
            })),
          ),
        ),
      ) ?? [];
    return {
      text: result.data.text ?? "",
      items: wordsToItems(words),
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractRowsFromImageSource(image: File | Blob | string) {
  const { text, items } = await recognizeImage(image);
  const fromLayout = items.length ? tableFromPositionedItems([items]) : null;
  if (fromLayout?.length) return fromLayout;
  const fromText = rowsFromPlainText(text);
  if (fromText?.length) return fromText;
  throw new FileParseError(
    "تمت قراءة الصورة لكن لم يُعثر على أعمدة مالية واضحة (مثل التاريخ، اسم المنتج، الكمية، سعر البيع).",
  );
}

export async function extractRowsFromPdfImages(buffer: ArrayBuffer) {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(new Uint8Array(buffer));
  const pdf = await getDocumentProxy(bytes.slice());
  const texts: string[] = [];
  const pages: PositionedItem[][] = [];

  try {
    const pageCount = Math.min(pdf.numPages, MAX_OCR_PAGES);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const dataUrl = (await renderPageAsImage(pdf, pageNumber, {
        scale: 2,
        toDataURL: true,
      })) as string;
      const { text, items } = await recognizeImage(dataUrl);
      texts.push(text);
      if (items.length) pages.push(items);
    }
  } finally {
    await pdf.destroy();
  }

  const fromLayout = pages.length ? tableFromPositionedItems(pages) : null;
  if (fromLayout?.length) return fromLayout;
  const fromText = rowsFromPlainText(texts.join("\n"));
  if (fromText?.length) return fromText;
  return null;
}
