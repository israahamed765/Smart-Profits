import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getAdminMe } from "@/backend/src/http/admin-me";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getAdminMe);
}
