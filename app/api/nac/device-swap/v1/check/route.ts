import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacDeviceSwapCheck } from "@/backend/src/http/nac-device-swap-check";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacDeviceSwapCheck);
}
