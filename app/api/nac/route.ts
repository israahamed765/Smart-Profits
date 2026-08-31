import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getNacCatalog } from "@/backend/src/http/nac-catalog";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getNacCatalog);
}
