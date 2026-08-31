import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getGuardLogs } from "@/backend/src/http/guard-logs";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getGuardLogs);
}
