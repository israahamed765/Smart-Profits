import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postRegister } from "@/backend/src/http/auth-register";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postRegister);
}
