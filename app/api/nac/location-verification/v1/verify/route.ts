import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacLocationVerify } from "@/backend/src/http/nac-location-verify";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacLocationVerify);
}
