import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacDeviceSwapDate } from "@/backend/src/http/nac-device-swap-date";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacDeviceSwapDate);
}
