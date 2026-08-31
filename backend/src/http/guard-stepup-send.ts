import { rateLimit } from "@/server/middleware/rate-limit";
import { resolveStepUpIdentity } from "@/server/smart-guard/identity";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { sendStepUpNetworkCode } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "smart-guard-send", 5, 60_000);
    const body = await readJson<{ action?: string; email?: string; phone?: string }>(req);
    const { email } = await resolveStepUpIdentity(req, body);
    return jsonOk(await sendStepUpNetworkCode(email, body.phone));
  });
}
