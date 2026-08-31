import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getAdminSnapshot } from "@/backend/src/http/admin-snapshot";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getAdminSnapshot);
}
