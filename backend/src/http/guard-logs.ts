import { requireMerchant } from "@/server/middleware/authenticate";
import { backendApiRoute, jsonOk } from "./api-route";
import { listMerchantGuardLogs } from "../services/guard";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 40);
    const result = await listMerchantGuardLogs(session.email, limit);
    return jsonOk(result);
  });
}
