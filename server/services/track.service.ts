import type { TrackEvent } from "@/lib/admin/config";
import { appendEvent } from "@/server/repositories/event.repository";

export async function recordTrackEvent(event: TrackEvent) {
  return appendEvent(event);
}
