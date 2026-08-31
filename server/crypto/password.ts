import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PREFIX = "scrypt$";

export async function hashPassword(plain: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${PREFIX}${salt}$${derived.toString("hex")}`;
}

export function isHashedPassword(stored: string) {
  return stored.startsWith(PREFIX);
}

export async function verifyPassword(plain: string, stored: string) {
  if (!stored) return false;
  if (!isHashedPassword(stored)) {
    const left = Buffer.from(plain);
    const right = Buffer.from(stored);
    if (left.length !== right.length) {
      timingSafeEqual(left, left);
      return false;
    }
    return timingSafeEqual(left, right);
  }

  const parts = stored.split("$");
  const salt = parts[1];
  const hex = parts[2];
  if (!salt || !hex) return false;
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
