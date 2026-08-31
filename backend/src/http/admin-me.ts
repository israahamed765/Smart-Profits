import { requireAdmin } from "@/server/middleware/authenticate";
import { backendApiRoute, jsonOk } from "./api-route";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireAdmin(req);
    return jsonOk({ admin: { email: session.email, name: session.name } });
  });
}
