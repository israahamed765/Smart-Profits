import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postReportsExport } from "@/backend/src/http/reports-export-post";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postReportsExport);
}
