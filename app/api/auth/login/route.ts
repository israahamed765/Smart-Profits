import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postLogin } from "@/backend/src/http/auth-login";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postLogin);
}
