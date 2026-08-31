/**
 * Email identity helpers. No localStorage — those stay in lib/tenant.ts.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function fileSafeEmail(email: string) {
  return normalizeEmail(email).replace(/[^a-z0-9._-]+/gi, "_");
}
