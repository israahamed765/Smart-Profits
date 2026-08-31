import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getMe } from "@/backend/src/http/auth-me";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getMe);
}
