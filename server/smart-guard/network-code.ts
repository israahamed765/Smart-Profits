import { createHash, randomInt, timingSafeEqual } from "crypto";
import { allowSimulatorDemoCode, nacMode } from "./nac-env";

interface Challenge {
  hash: string;
  phone: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

const challenges = new Map<string, Challenge>();
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 30_000;

function keyOf(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${keyOf(email)}:${code}`).digest("hex");
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone || "—";
  return `+${digits.slice(0, 4)} **** ${digits.slice(-2)}`;
}

export function createNetworkChallenge(email: string, phone: string) {
  nacMode();
  const existing = challenges.get(keyOf(email));
  if (existing && Date.now() - existing.sentAt < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (Date.now() - existing.sentAt)) / 1000);
    return { ok: false as const, error: "cooldown", retryAfterSec: wait, maskedPhone: maskPhone(existing.phone) };
  }

  const code = String(randomInt(100000, 1000000));
  challenges.set(keyOf(email), {
    hash: hashCode(email, code),
    phone,
    expiresAt: Date.now() + TTL_MS,
    attempts: 0,
    sentAt: Date.now(),
  });

  return {
    ok: true as const,
    maskedPhone: maskPhone(phone),
    expiresInSec: TTL_MS / 1000,
    retryAfterSec: RESEND_MS / 1000,
    channel: "network" as const,
    demoCode: allowSimulatorDemoCode() ? code : undefined,
  };
}

export function verifyNetworkChallenge(email: string, code: string) {
  const row = challenges.get(keyOf(email));
  if (!row) return { ok: false as const, error: "missing" };
  if (Date.now() > row.expiresAt) {
    challenges.delete(keyOf(email));
    return { ok: false as const, error: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    challenges.delete(keyOf(email));
    return { ok: false as const, error: "locked" };
  }
  row.attempts += 1;
  const expected = Buffer.from(row.hash);
  const received = Buffer.from(hashCode(email, code.replace(/\s/g, "")));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false as const, error: "mismatch", remaining: MAX_ATTEMPTS - row.attempts };
  }
  challenges.delete(keyOf(email));
  return { ok: true as const };
}
