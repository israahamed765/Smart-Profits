/**
 * P10: phone helpers live in `@/shared/phone`.
 * Client-safe re-export — no NAC credentials.
 */
export { normalizeMobile, mobileMsisdn, isValidMobile } from "@/shared/phone";
