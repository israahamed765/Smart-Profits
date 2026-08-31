import { SENSITIVE_ACTIONS, type SensitiveAction } from "@/lib/smart-guard/types";
import { AppError } from "@/server/errors";
import { optionalMerchant } from "@/server/middleware/authenticate";

export function isPreAuthAction(action: SensitiveAction) {
  return action === "login" || action === "password_reset";
}

export function parseSensitiveAction(value: unknown): SensitiveAction {
  const action = String(value || "");
  if (!SENSITIVE_ACTIONS.includes(action as SensitiveAction)) {
    throw new AppError("إجراء غير صالح.", 400);
  }
  return action as SensitiveAction;
}

export async function resolveGuardIdentity(
  request: Request,
  body: { action?: unknown; email?: unknown },
) {
  const action = parseSensitiveAction(body.action);
  const session = await optionalMerchant(request);

  if (session) {
    return { action, email: session.email, session };
  }

  if (isPreAuthAction(action)) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new AppError("البريد مطلوب لهذا الإجراء.", 400);
    }
    return { action, email, session };
  }

  throw new AppError("يجب تسجيل الدخول أولاً.", 401);
}

export async function resolveStepUpIdentity(request: Request, body: { action?: unknown; email?: unknown }) {
  const session = await optionalMerchant(request);
  if (session) {
    return { email: session.email, session };
  }

  const action = parseSensitiveAction(body.action ?? "login");
  if (!isPreAuthAction(action)) {
    throw new AppError("يجب تسجيل الدخول أولاً.", 401);
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AppError("البريد مطلوب لهذا الإجراء.", 400);
  }
  return { email, session: null };
}
