import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getWorkspace } from "@/backend/src/http/workspace-get";
import { POST as postWorkspace } from "@/backend/src/http/workspace-post";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getWorkspace);
}

export function POST(request: Request) {
  return maybeProxyToBackend(request, postWorkspace);
}
