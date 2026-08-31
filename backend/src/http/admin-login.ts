import { rateLimit } from "@/server/middleware/rate-limit";
import { adminLoginSchema } from "@/server/validators/admin.validator";
import { createAdminToken, appendAdminSessionCookie } from "@/server/crypto/session-core";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { loginAdmin } from "../services/admin";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "admin-login", 8, 60_000);
    const input = adminLoginSchema.parse(await readJson(req));
    const admin = loginAdmin(input.email, input.password);
    const token = await createAdminToken(admin);
    return appendAdminSessionCookie(jsonOk({ ok: true, admin }), token);
  });
}
