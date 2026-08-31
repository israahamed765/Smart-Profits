import { backendApiRoute, jsonOk } from "./api-route";
import { clearAdminSessionCookie } from "@/server/crypto/session-core";

export function POST(request: Request) {
  return backendApiRoute(request, async () => clearAdminSessionCookie(jsonOk({ ok: true })));
}
