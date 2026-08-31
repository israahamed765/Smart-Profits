import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postGuardStepUpVerify } from "@/backend/src/http/guard-stepup-verify";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postGuardStepUpVerify);
}
