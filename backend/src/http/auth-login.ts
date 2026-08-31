import { rateLimit } from "@/server/middleware/rate-limit";
import { loginSchema } from "@/server/validators/auth.validator";
import { createMerchantToken, appendMerchantSessionCookie } from "@/server/crypto/session-core";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { loginMerchant, toAuthUser } from "../services/auth";
import { requireGuardAllow } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "auth-login", 10, 60_000);
    const input = loginSchema.parse(await readJson(req));
    const account = await loginMerchant(input.email, input.password);
    await requireGuardAllow(req, { action: "login", email: account.email, phone: account.phone });
    const token = await createMerchantToken({ email: account.email, fullName: account.fullName });
    return appendMerchantSessionCookie(jsonOk({ ok: true, user: toAuthUser(account), account }), token);
  });
}
