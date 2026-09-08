import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { DELETE as deleteAdminUsers, POST as postAdminUsers } from "@/backend/src/http/admin-users";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postAdminUsers);
}

export function DELETE(request: Request) {
  return maybeProxyToBackend(request, deleteAdminUsers);
}
