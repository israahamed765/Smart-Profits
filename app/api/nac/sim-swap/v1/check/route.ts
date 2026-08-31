import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacSimSwapCheck } from "@/backend/src/http/nac-sim-swap-check";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacSimSwapCheck);
}
