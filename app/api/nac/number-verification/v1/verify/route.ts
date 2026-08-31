import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacNumberVerify } from "@/backend/src/http/nac-number-verify";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacNumberVerify);
}
