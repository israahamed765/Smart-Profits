import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postLogout } from "@/backend/src/http/auth-logout";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postLogout);
}
