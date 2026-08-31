import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postAdminUsers } from "@/backend/src/http/admin-users";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postAdminUsers);
}
