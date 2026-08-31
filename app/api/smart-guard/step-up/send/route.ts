import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postGuardStepUpSend } from "@/backend/src/http/guard-stepup-send";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postGuardStepUpSend);
}
