import type { TrackEvent, TrackEventType } from "@/lib/admin/config";
import { EVENTS_KEY } from "@/frontend/lib/tenant";
import { apiFetch } from "@/frontend/lib/api/client";

export function trackPlatform(type: TrackEventType, label?: string, email?: string) {
  if (typeof window === "undefined") return;
  try {
    const event: TrackEvent = { type, at: Date.now(), label, email: email?.toLowerCase() };
    const current = readPlatformEvents();
    current.unshift(event);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(current.slice(0, 400)));
    void apiFetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => undefined);
  } catch {
    // ignore quota
  }
}

export function readPlatformEvents(): TrackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function countEvents(type: TrackEventType, start: Date, end: Date) {
  return readPlatformEvents().filter(
    (event) => event.type === type && event.at >= start.getTime() && event.at <= end.getTime(),
  ).length;
}
