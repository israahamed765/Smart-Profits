import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postAnalyze } from "@/backend/src/http/analyze-post";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postAnalyze);
}
