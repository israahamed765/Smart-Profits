import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postForgot } from "@/backend/src/http/auth-forgot";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postForgot);
}
