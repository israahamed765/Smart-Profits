import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacSimSwapDate } from "@/backend/src/http/nac-sim-swap-date";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacSimSwapDate);
}
