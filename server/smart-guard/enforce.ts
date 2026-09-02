import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";
import { AppError, isAppError } from "@/server/errors";
import { requestMeta } from "@/server/http/request-meta";
import { isNacProviderError, type NacProviderError } from "@/shared/contracts/nac-provider";
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

function providerFailureSummary(error: NacProviderError): string {
  if (error.kind === "rate_limit") {
    return "Nokia NaC rate limit (429). Smart Guard could not verify this action — provider throttling, not a business rejection.";
  }
  if (error.kind === "timeout") {
    return "Nokia NaC timed out. Smart Guard could not verify this action — network/provider failure, not a business rejection.";
  }
  if (error.kind === "auth") {
    return "Nokia NaC authentication failed (401/403). Check NAC_API_KEY — this is not a SIM/location risk decision.";
  }
  if (error.kind === "not_found") {
    return "Nokia NaC endpoint or resource not found (404). Configuration problem — not a business rejection.";
  }
  if (error.kind === "network") {
    return "Nokia NaC network error. Smart Guard could not reach the provider.";
  }
  return "Nokia NaC upstream error. Smart Guard could not verify this action — provider failure, not a business rejection.";
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
  if (isNacProviderError(error)) {
    const base = failClosedVerdict(action);
    deny({ ...base, summary: providerFailureSummary(error), traces: [error.trace] });
  }
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
