import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { AppError } from "@/server/errors";

export const WRITE_FROZEN_MESSAGE = "التخزين مجمّد للتحقق النهائي من البيانات.";
export const WRITE_FROZEN_STATUS = 503;

/** Isolated in tests via SMARTPROFIT_FREEZE_PATH so a leftover operator flag cannot break unit tests. */
export function writeFreezeFlagPath() {
  const fromEnv = (process.env.SMARTPROFIT_FREEZE_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), "data", ".p14.12r-write-freeze");
}

export function isWriteFrozen() {
  return existsSync(writeFreezeFlagPath());
}

export function engageWriteFreeze(reason = "P14.12R") {
  const file = writeFreezeFlagPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ frozenAt: new Date().toISOString(), reason }, null, 2),
    "utf8",
  );
}

export function releaseWriteFreeze() {
  const file = writeFreezeFlagPath();
  if (existsSync(file)) unlinkSync(file);
}

export function isWriteFrozenError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  return candidate.name === "AppError" && candidate.status === WRITE_FROZEN_STATUS && candidate.message === WRITE_FROZEN_MESSAGE;
}

/** Product mutations of merchants / workspaces / track_events / guard_decisions. Operator copiers do not call this. */
export function assertProductWrite() {
  if (isWriteFrozen()) throw new AppError(WRITE_FROZEN_MESSAGE, WRITE_FROZEN_STATUS);
}

export function absentTestFreezePath() {
  return join(tmpdir(), "smartprofit-p14.12r-absent-freeze");
}
