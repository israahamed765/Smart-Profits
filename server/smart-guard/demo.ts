import { readDemoFlags, writeDemoFlags } from "@/server/repositories/demo.repository";

export { readDemoFlags, writeDemoFlags };

const nvSessions = new Map<string, number>();
const stepUpSessions = new Map<string, number>();
const NV_TTL_MS = 30 * 60 * 1000;

export function markNumberVerified(email: string) {
  nvSessions.set(email.trim().toLowerCase(), Date.now() + NV_TTL_MS);
}

export function sessionNumberVerified(email: string) {
  const until = nvSessions.get(email.trim().toLowerCase());
  if (!until) return false;
  if (until < Date.now()) {
    nvSessions.delete(email.trim().toLowerCase());
    return false;
  }
  return true;
}

export function markStepUpVerified(email: string) {
  const key = email.trim().toLowerCase();
  const until = Date.now() + NV_TTL_MS;
  stepUpSessions.set(key, until);
  nvSessions.set(key, until);
}

export function sessionStepUpVerified(email: string) {
  const until = stepUpSessions.get(email.trim().toLowerCase());
  if (!until) return false;
  if (until < Date.now()) {
    stepUpSessions.delete(email.trim().toLowerCase());
    return false;
  }
  return true;
}
