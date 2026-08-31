import { detectColumns, findHeaderTokens, isUnspecifiedProduct, mappedRoleCount, stripKnownHeaders } from "@/lib/financial-engine/core/mapping";

export interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface Cell {
  x: number;
  endX: number;
  text: string;
}

const DATE_RE = /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const NUMBER_RE = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

function isHeaderish(line: string) {
  return findHeaderTokens(line).length >= 3;
}

function chunksByDateAtStart(compact: string, matches: RegExpMatchArray[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? compact.length) : compact.length;
    const chunk = compact.slice(start, end).trim();
    if (chunk && !isHeaderish(chunk)) lines.push(chunk);
  }
  return lines;
}

function chunksByDateAtEnd(compact: string, matches: RegExpMatchArray[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const dateStart = matches[i].index ?? 0;
    const dateEnd = dateStart + matches[i][0].length;
    const prevEnd =
      i === 0 ? 0 : (matches[i - 1].index ?? 0) + (matches[i - 1][0].length);
    const chunk = compact.slice(prevEnd, dateEnd).trim();
    if (chunk && !isHeaderish(stripKnownHeaders(chunk))) lines.push(chunk);
  }
  return lines;
}

function parseLinesToRows(lines: string[], headers: string[]) {
  const objects: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (isHeaderish(line) && !DATE_RE.test(line)) continue;
    const parsed = parseLooseRow(line, headers);
    if (parsed) objects.push(parsed);
  }
  return objects.length ? objects : null;
}

function candidateSaleLines(text: string): string[][] {
  const compact = text.replace(/\s+/g, " ").trim();
  const matches = [...compact.matchAll(ISO_DATE_RE)];
  if (matches.length >= 2) {
    return [chunksByDateAtStart(compact, matches), chunksByDateAtEnd(compact, matches)];
  }

  return [
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  ];
}

function pickFinancialMatches(matches: RegExpMatchArray[]) {
  if (matches.length <= 3) return matches;
  const first3 = matches.slice(0, 3);
  const last3 = matches.slice(-3);
  const score = (group: RegExpMatchArray[]) => {
    const numbers = group
      .map((match) => parseNumberToken(match[0]))
      .filter((value): value is number => value != null);
    const assigned = assignQtyCostPrice(numbers);
    if (!assigned) return -1;
    let points = 0;
    if (assigned.quantity > 0 && Number.isInteger(assigned.quantity) && assigned.quantity <= 500) points += 2;
    if (assigned.quantity <= assigned.cost && assigned.quantity <= assigned.price) points += 4;
    if (assigned.price >= assigned.cost) points += 2;
    return points;
  };
  return score(first3) > score(last3) ? first3 : last3;
}

function assignQtyCostPrice(numbers: number[]) {
  if (numbers.length < 2) return null;
  if (numbers.length === 2) {
    return {
      quantity: 1,
      cost: Math.min(numbers[0], numbers[1]),
      price: Math.max(numbers[0], numbers[1]),
    };
  }

  const [a, b, c] = numbers.slice(-3);
  const ltr = { quantity: a, cost: Math.min(b, c), price: Math.max(b, c) };
  const rtl = { quantity: c, cost: Math.min(a, b), price: Math.max(a, b) };

  const score = (row: { quantity: number; cost: number; price: number }) => {
    let points = 0;
    if (row.quantity > 0 && Number.isInteger(row.quantity) && row.quantity <= 500) points += 2;
    if (row.quantity <= row.cost && row.quantity <= row.price) points += 3;
    if (row.price >= row.cost) points += 2;
    return points;
  };

  return score(rtl) > score(ltr) ? rtl : ltr;
}

function ensureNotesHeader(headers: string[], text: string) {
  const hasNotes = headers.some((header) => /ملاحظ|notes|بيان|وصف/i.test(header));
  if (hasNotes) return headers;
  if (/تم البيع|نقدا|ملاحظات/i.test(text)) return [...headers, "الملاحظات"];
  return headers;
}

function uniquifyHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const base = header.trim() || "عمود";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function clusterRowItems(items: PositionedItem[], yTol: number): PositionedItem[][] {
  const usable = items.filter((item) => item.str.trim());
  usable.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedItem[][] = [];
  for (const item of usable) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= yTol);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.sort((a, b) => b[0].y - a[0].y).map((row) => row.sort((a, b) => a.x - b.x));
}

function mergeIntoCells(items: PositionedItem[]): Cell[] {
  const cells: Cell[] = [];
  for (const item of items) {
    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = cells[cells.length - 1];
    const gap = last ? item.x - last.endX : Infinity;
    const mergeGap = Math.max(4, (item.fontSize || 10) * 0.28);
    if (last && gap < mergeGap && gap > -Math.max(item.width, 4)) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, " ").trim();
      last.endX = Math.max(last.endX, item.x + item.width);
    } else {
      cells.push({ x: item.x, text, endX: item.x + item.width });
    }
  }
  return cells;
}

function resolveHeaders(cells: Cell[]): string[] | null {
  const direct = cells.map((cell) => cell.text);
  if (mappedRoleCount(direct) >= 2) return uniquifyHeaders(direct);
  const tokens = findHeaderTokens(direct.join(" "));
  if (tokens.length >= 2) return uniquifyHeaders(tokens);
  return null;
}

function parseNumberToken(value: string) {
  const n = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseLooseRow(line: string, headers: string[]): Record<string, unknown> | null {
  let cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (findHeaderTokens(cleaned).length >= 2) {
    cleaned = stripKnownHeaders(cleaned);
  }
  if (!cleaned || (isHeaderish(cleaned) && !DATE_RE.test(cleaned))) return null;

  const mapping = detectColumns(headers);
  const row: Record<string, unknown> = {};
  headers.forEach((header) => {
    row[header] = "";
  });

  const dateMatch = cleaned.match(DATE_RE);
  const withoutDate = dateMatch ? cleaned.replace(dateMatch[0], " ") : cleaned;
  const withoutNotes = withoutDate.replace(/تم البيع(?:\s*نقداً?)?/u, " ").replace(/نقداً?/u, " ");
  const numberMatches = [...withoutNotes.matchAll(NUMBER_RE)];
  const usedMatches = pickFinancialMatches(numberMatches);
  const numbers = usedMatches
    .map((match) => parseNumberToken(match[0]))
    .filter((value): value is number => value != null);

  let product = withoutNotes;
  for (let i = usedMatches.length - 1; i >= 0; i -= 1) {
    const token = usedMatches[i][0];
    const idx = product.lastIndexOf(token);
    if (idx >= 0) product = `${product.slice(0, idx)} ${product.slice(idx + token.length)}`;
  }
  product = product.replace(/\s+/g, " ").trim();

  if (mapping.mapping.date && dateMatch) {
    row[mapping.mapping.date] = dateMatch[0];
  }
  if (mapping.mapping.product && product) {
    row[mapping.mapping.product] = product;
  }
  const notesHeader = mapping.mapping.notes;
  if (notesHeader) {
    const notesMatch = cleaned.match(/تم البيع[^\d]*/u) || cleaned.match(/نقداً?/);
    if (notesMatch) row[notesHeader] = notesMatch[0].trim();
  }

  const qtyHeader = mapping.mapping.quantity;
  const costHeader = mapping.mapping.costPrice;
  const priceHeader = mapping.mapping.sellingPrice;
  const revenueHeader = mapping.mapping.revenue;
  const expenseHeader = mapping.mapping.expense;

  if (numbers.length === 0 && !dateMatch && !product) return null;

  const assigned = assignQtyCostPrice(numbers);
  if (assigned && qtyHeader && costHeader && priceHeader && numbers.length >= 2) {
    row[qtyHeader] = assigned.quantity;
    row[costHeader] = assigned.cost;
    row[priceHeader] = assigned.price;
  } else {
    const orderedHeaders = [qtyHeader, costHeader, priceHeader, revenueHeader, expenseHeader].filter(
      (header): header is string => Boolean(header),
    );
    numbers.forEach((value, index) => {
      if (orderedHeaders[index]) row[orderedHeaders[index]] = value;
    });
  }

  const filled = Object.values(row).filter((value) => String(value).trim() !== "").length;
  return filled >= 2 ? row : null;
}

export function rowsFromPlainText(text: string): Record<string, unknown>[] | null {
  if (!text.trim()) return null;

  let headers = findHeaderTokens(text);
  if (headers.length < 2) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines.slice(0, 40)) {
      const spaced = line.split(/\s{2,}|\t/).map((part) => part.trim()).filter(Boolean);
      if (mappedRoleCount(spaced) >= 2) {
        headers = uniquifyHeaders(spaced);
        break;
      }
      const tokens = findHeaderTokens(line);
      if (tokens.length > headers.length) headers = tokens;
    }
  }

  if (headers.length < 2) return null;
  headers = uniquifyHeaders(ensureNotesHeader(headers, text));

  const candidates = candidateSaleLines(text)
    .map((lines) => parseLinesToRows(lines, headers))
    .filter((rows): rows is Record<string, unknown>[] => Boolean(rows?.length));

  if (!candidates.length) return null;
  return candidates.reduce((best, current) => preferRicherTable(best, current) ?? best);
}

function distinctProductCount(rows: Record<string, unknown>[] | null) {
  if (!rows?.length) return 0;
  const mapping = detectColumns(Object.keys(rows[0] ?? {}));
  const key = mapping.mapping.product;
  if (!key) return 0;
  return new Set(
    rows
      .map((row) => String(row[key] ?? "").replace(/\s+/g, " ").trim())
      .filter((name) => name && !isUnspecifiedProduct(name)),
  ).size;
}

export function preferRicherTable(
  primary: Record<string, unknown>[] | null,
  fallback: Record<string, unknown>[] | null,
) {
  if (!primary?.length) return fallback;
  if (!fallback?.length) return primary;
  const primaryProducts = distinctProductCount(primary);
  const fallbackProducts = distinctProductCount(fallback);
  if (fallbackProducts > primaryProducts) return fallback;
  if (fallback.length > primary.length + 2 && fallbackProducts >= Math.max(1, primaryProducts)) {
    return fallback;
  }
  return primary;
}

export function tableFromPositionedItems(pages: PositionedItem[][]): Record<string, unknown>[] | null {
  const allRows: Cell[][] = [];

  for (const page of pages) {
    if (page.length === 0) continue;
    const avgHeight =
      page.reduce((sum, item) => sum + (item.height || item.fontSize || 10), 0) / page.length;
    const clustered = clusterRowItems(page, Math.max(3, avgHeight * 0.5));
    for (const row of clustered) {
      const cells = mergeIntoCells(row);
      if (cells.length >= 1) allRows.push(cells);
    }
  }

  if (allRows.length < 2) {
    const joined = allRows.map((row) => row.map((cell) => cell.text).join(" ")).join("\n");
    return rowsFromPlainText(joined);
  }

  let bestIndex = -1;
  let headers: string[] | null = null;
  const scanLimit = Math.min(50, allRows.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const resolved = resolveHeaders(allRows[i]);
    if (resolved && resolved.length >= 2 && (!headers || mappedRoleCount(resolved) > mappedRoleCount(headers))) {
      headers = resolved;
      bestIndex = i;
    }
  }

  if (!headers || bestIndex < 0) {
    return rowsFromPlainText(allRows.map((row) => row.map((cell) => cell.text).join(" ")).join("\n"));
  }

  const joinedText = allRows.map((row) => row.map((cell) => cell.text).join(" ")).join("\n");
  const textRows = rowsFromPlainText(joinedText);
  const headerCells = allRows[bestIndex];
  const resolvedHeaders = uniquifyHeaders(ensureNotesHeader(headers, joinedText));
  const useGeometry = mappedRoleCount(headerCells.map((cell) => cell.text)) >= 2 && headerCells.length >= 2;
  const objects: Record<string, unknown>[] = [];

  for (let i = bestIndex + 1; i < allRows.length; i += 1) {
    const line = allRows[i].map((cell) => cell.text).join(" ");
    if (useGeometry && allRows[i].length >= 2) {
      const values = headerCells.map(() => "");
      for (const cell of allRows[i]) {
        let best = 0;
        let bestDist = Infinity;
        headerCells.forEach((headerCell, index) => {
          const dist = Math.abs(cell.x - headerCell.x);
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        });
        values[best] = values[best] ? `${values[best]} ${cell.text}` : cell.text;
      }
      if (mappedRoleCount(values.filter(Boolean)) >= 2) continue;
      const row: Record<string, unknown> = {};
      resolvedHeaders.forEach((header, index) => {
        row[header] = values[index]?.trim() ?? "";
      });
      if (Object.values(row).filter((value) => String(value).trim()).length >= 2) {
        objects.push(row);
        continue;
      }
    }
    const parsed = parseLooseRow(line, resolvedHeaders);
    if (parsed) objects.push(parsed);
  }

  return preferRicherTable(objects, textRows);
}
