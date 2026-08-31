import { requireMerchant } from "@/server/middleware/authenticate";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { getGuardDemoFlags, saveGuardDemoFlags } from "../services/guard";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const flags = await getGuardDemoFlags(session.email);
    return jsonOk({ flags });
  });
}

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const body = await readJson<{
      simSwapRecent?: boolean;
      locationOutside?: boolean;
      numberMatch?: boolean;
    }>(req);
    const flags = await saveGuardDemoFlags(session.email, body);
    return jsonOk({ ok: true, flags });
  });
}
