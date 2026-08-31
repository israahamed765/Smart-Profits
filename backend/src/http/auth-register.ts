import { rateLimit } from "@/server/middleware/rate-limit";
import { registerSchema } from "@/server/validators/auth.validator";
import { createMerchantToken, appendMerchantSessionCookie } from "@/server/crypto/session-core";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { registerMerchant, toAuthUser } from "../services/auth";
import { requireGuardAllow } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "auth-register", 8, 60_000);
    const input = registerSchema.parse(await readJson(req));
    await requireGuardAllow(req, { action: "login", email: input.email, phone: input.phone });
    const account = await registerMerchant(input);
    const token = await createMerchantToken({ email: account.email, fullName: account.fullName });
    return appendMerchantSessionCookie(jsonOk({ ok: true, user: toAuthUser(account), account }), token);
  });
}
