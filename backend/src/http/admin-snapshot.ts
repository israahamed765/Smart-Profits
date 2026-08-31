import { requireAdmin } from "@/server/middleware/authenticate";
import { backendApiRoute, jsonOk } from "./api-route";
import { adminSnapshot } from "../services/admin";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    await requireAdmin(req);
    return jsonOk(await adminSnapshot());
  });
}
