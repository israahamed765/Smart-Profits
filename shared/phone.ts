/**
 * Merchant mobile number for Nokia Network-as-Code / CAMARA.
 * Stored as E.164 (e.g. +970599123456). MSISDN is the same digits without +.
 * Isomorphic — no DOM, no Node I/O.
 */
export function normalizeMobile(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let value = trimmed.replace(/[\s\-().]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  if (value.startsWith("+")) {
    const digits = value.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (/^05\d{8}$/.test(digits)) return `+970${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+970${digits}`;
  if (/^(970|972|966|971|962|20)\d{8,10}$/.test(digits)) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function mobileMsisdn(e164: string) {
  return e164.replace(/^\+/, "");
}

export function isValidMobile(raw: string) {
  return Boolean(normalizeMobile(raw));
}
