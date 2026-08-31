import { rateLimit } from "@/server/middleware/rate-limit";
import { resolveGuardIdentity } from "@/server/smart-guard/identity";
import { requestMeta } from "@/server/http/request-meta";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { verifyStepUpNetworkCode } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "smart-guard-verify", 10, 60_000);
    const body = await readJson<{
      action?: string;
      email?: string;
      phone?: string;
      code?: string;
    }>(req);

    const { action, email } = await resolveGuardIdentity(req, {
      action: body.action,
      email: body.email,
    });

    const result = await verifyStepUpNetworkCode({
      action,
      email,
      code: String(body.code || ""),
      phone: body.phone,
      meta: requestMeta(req),
    });
    return jsonOk(result);
  });
}
