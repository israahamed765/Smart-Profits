import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getGuardDemo, POST as postGuardDemo } from "@/backend/src/http/guard-demo";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getGuardDemo);
}

export function POST(request: Request) {
  return maybeProxyToBackend(request, postGuardDemo);
}
