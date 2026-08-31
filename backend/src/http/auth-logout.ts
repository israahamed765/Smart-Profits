import { backendApiRoute, jsonOk } from "./api-route";
import { clearMerchantSessionCookie } from "@/server/crypto/session-core";

export function POST(request: Request) {
  return backendApiRoute(request, async () => clearMerchantSessionCookie(jsonOk({ ok: true })));
}
