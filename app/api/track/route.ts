import { maybeProxyToBackend } from "@/server/http/proxy-to-backend";
import { POST as postTrack } from "@/backend/src/http/track-post";

export function POST(request: Request) {
  return maybeProxyToBackend(request, postTrack);
}
