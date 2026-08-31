import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postAdminLogout } from "@/backend/src/http/admin-logout";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postAdminLogout);
}
