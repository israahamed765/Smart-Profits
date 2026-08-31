import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postReset } from "@/backend/src/http/auth-reset";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postReset);
}
