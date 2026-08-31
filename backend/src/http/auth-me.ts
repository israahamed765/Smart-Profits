import { requireMerchant } from "@/server/middleware/authenticate";
import { backendApiRoute, jsonOk } from "./api-route";
import { currentMerchant, toAuthUser } from "../services/auth";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const account = await currentMerchant(session.email);
    return jsonOk({ user: toAuthUser(account), account });
  });
}
