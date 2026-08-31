/**
 * Shared numeric helpers. No React, no Tailwind, no server I/O.
 * Formulas must stay identical to P1/P2 (`clamp` / `round2` / `safeDivide`).
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}
