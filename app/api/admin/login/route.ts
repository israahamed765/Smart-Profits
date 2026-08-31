import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postAdminLogin } from "@/backend/src/http/admin-login";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postAdminLogin);
}
