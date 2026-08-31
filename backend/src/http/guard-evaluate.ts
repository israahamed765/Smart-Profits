import { rateLimit } from "@/server/middleware/rate-limit";
import { resolveGuardIdentity } from "@/server/smart-guard/identity";
import { failClosedVerdict } from "@/server/smart-guard/fail-closed";
import { requestMeta } from "@/server/http/request-meta";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { guardApi } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "smart-guard-evaluate", 20, 60_000);
    const body = await readJson<{
      action?: string;
      email?: string;
      phone?: string;
      fileBytes?: number;
      fileName?: string;
    }>(req);

    const { action, email } = await resolveGuardIdentity(req, body);

    try {
      const verdict = await guardApi.evaluateSensitiveAction({
        action,
        email,
        phone: body.phone,
        fileBytes: body.fileBytes,
        fileName: body.fileName,
        meta: requestMeta(req),
      });
      return jsonOk({ verdict });
    } catch (error) {
      console.warn("[smart-guard] evaluate failed; blocking action.", error);
      return Response.json({ verdict: failClosedVerdict(action) }, { status: 503 });
    }
  });
}
