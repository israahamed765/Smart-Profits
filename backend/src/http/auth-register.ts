import type { ZodIssue } from "zod";
import { rateLimit } from "@/server/middleware/rate-limit";
import { registerSchema } from "@/server/validators/auth.validator";
import { createMerchantToken, appendMerchantSessionCookie } from "@/server/crypto/session-core";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { registerMerchant, toAuthUser, assertRegisterAvailable } from "../services/auth";
import { requireGuardAllow } from "../services/guard";

function registerFieldCode(issue: ZodIssue): string {
  const field = issue.path[0];
  if (field === "fullName") return "fullName";
  if (field === "storeName") return "storeName";
  if (field === "email") return issue.code === "invalid_string" || issue.code === "invalid_type" ? "emailInvalid" : "email";
  if (field === "phone") return "phone";
  if (field === "password") return "password";
  return "server";
}

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "auth-register", 8, 60_000);
    const body = await readJson(req);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const codes = parsed.error.issues.map(registerFieldCode);
      const message = parsed.error.issues[0]?.message || "بيانات غير صالحة.";
      return Response.json({ error: message, codes }, { status: 400 });
    }

    const input = parsed.data;
    await assertRegisterAvailable(input.email, input.phone);
    await requireGuardAllow(req, { action: "login", email: input.email, phone: input.phone });
    const account = await registerMerchant(input);
    const token = await createMerchantToken({ email: account.email, fullName: account.fullName });
    return appendMerchantSessionCookie(jsonOk({ ok: true, user: toAuthUser(account), account }), token);
  });
}
