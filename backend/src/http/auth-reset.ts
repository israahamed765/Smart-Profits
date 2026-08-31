import { rateLimit } from "@/server/middleware/rate-limit";
import { resetPasswordSchema } from "@/server/validators/auth.validator";
import { createMerchantToken, appendMerchantSessionCookie } from "@/server/crypto/session-core";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { resetMerchantPassword, toAuthUser } from "../services/auth";
import { requireGuardAllow } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "auth-reset", 8, 60_000);
    const input = resetPasswordSchema.parse(await readJson(req));
    await requireGuardAllow(req, { action: "password_reset", email: input.email });
    const account = await resetMerchantPassword(input.email, input.code, input.password);
    const token = await createMerchantToken({ email: account.email, fullName: account.fullName });
    return appendMerchantSessionCookie(jsonOk({ ok: true, user: toAuthUser(account) }), token);
  });
}
