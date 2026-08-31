import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { GET as getProfile, POST as postProfile } from "@/backend/src/http/auth-profile";

export function GET(request: Request) {
  return maybeProxyToBackend(request, getProfile);
}

export function POST(request: Request) {
  return maybeProxyToBackend(request, postProfile);
}
