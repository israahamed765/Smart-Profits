import { mappedRoleCount } from "@/lib/financial-engine/core/mapping";

/** Excel row materialization. Server-only — XLSX is passed in by the parser. */
export function objectsFromSheet(
  XLSX: typeof import("xlsx"),
  sheet: import("xlsx").WorkSheet,
): Record<string, unknown>[] {
  const aoa = XLSX.utils.sheet_to_json<(string | number | Date | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  if (!aoa.length) return [];

  let bestIdx = 0;
  let bestScore = 0;
  const scanLimit = Math.min(20, aoa.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const headers = (aoa[i] ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
    if (headers.length < 2) continue;
    const score = mappedRoleCount(headers);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore < 2) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  }

  const headerRow = aoa[bestIdx] ?? [];
  const headers = headerRow.map((cell, index) => {
    const text = String(cell ?? "").trim();
    return text || `عمود ${index + 1}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = bestIdx + 1; r < aoa.length; r += 1) {
    const line = aoa[r] ?? [];
    const obj: Record<string, unknown> = {};
    let empty = true;
    headers.forEach((header, index) => {
      const value = line[index];
      if (value != null && String(value).trim() !== "") empty = false;
      obj[header] = value ?? "";
    });
    if (!empty) rows.push(obj);
  }
  return rows;
}
