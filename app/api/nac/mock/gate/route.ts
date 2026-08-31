import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postNacMockGate } from "@/backend/src/http/nac-mock-gate";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postNacMockGate);
}
