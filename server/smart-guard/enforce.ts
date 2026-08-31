import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";
import { AppError, isAppError } from "@/server/errors";
import { requestMeta } from "@/server/http/request-meta";
import { failClosedVerdict } from "./fail-closed";
import { runSmartGuard, type RunGuardRequest } from "./run";

export class GuardDeniedError extends AppError {
  verdict: GuardVerdict;

  constructor(verdict: GuardVerdict, status = 403) {
    super(verdict.summary, status);
    this.name = "GuardDeniedError";
    this.verdict = verdict;
  }
}

export function isGuardDeniedError(error: unknown): error is GuardDeniedError {
  if (error instanceof GuardDeniedError) return true;
  if (!isAppError(error) || error.name !== "GuardDeniedError") return false;
  const candidate = error as { verdict?: unknown };
  return Boolean(candidate.verdict && typeof candidate.verdict === "object");
}

function deny(verdict: GuardVerdict): never {
  throw new GuardDeniedError(verdict, verdict.reason === "check_failed" ? 503 : 403);
}

export function enforceAllow(verdict: GuardVerdict): GuardVerdict {
  if (verdict.decision === "allow") return verdict;
  deny(verdict);
}

export function wrapGuardFailure(action: SensitiveAction, error: unknown): never {
  if (isGuardDeniedError(error)) throw error;
  deny(failClosedVerdict(action));
}

/**
 * Server enforcement: the sensitive action does not proceed unless Guard returns allow.
 * Dependency failures (including account lookup) fail closed — never allow.
 */
export async function requireGuardAllow(request: Request, input: Omit<RunGuardRequest, "meta">): Promise<GuardVerdict> {
  const action: SensitiveAction = input.action;
  try {
    return enforceAllow(
      await runSmartGuard({
        ...input,
        meta: requestMeta(request),
      }),
    );
  } catch (error) {
    wrapGuardFailure(action, error);
  }
}
