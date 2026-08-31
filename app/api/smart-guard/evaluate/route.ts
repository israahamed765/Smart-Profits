import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postGuardEvaluate } from "@/backend/src/http/guard-evaluate";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postGuardEvaluate);
}
