import { randomUUID } from "node:crypto";
import type { TrackEvent } from "@/lib/admin/config";
import { queryPostgres, requirePostgres } from "@/server/db/postgres";

export const EVENT_PAGE_MAX = 2000;
export const EVENT_PAGE_DEFAULT = 200;

export type EventPageCursor = { at: number; id: string };

export type EventPage = {
  rows: TrackEvent[];
  nextCursor: EventPageCursor | null;
};

type EventRow = { id: string; at: string | number; payload: TrackEvent };

function toPage(rows: EventRow[], limit: number): EventPage {
  const last = rows[rows.length - 1];
  return {
    rows: rows.map((row) => row.payload).filter(Boolean),
    nextCursor: rows.length === limit && last ? { at: Number(last.at), id: String(last.id) } : null,
  };
}

async function queryEventsPage(input: { limit: number; cursor?: EventPageCursor | null }): Promise<EventPage | null> {
  const result = input.cursor
    ? await queryPostgres<EventRow>(
        `SELECT id, at, payload FROM track_events
         WHERE (at, id) < ($2, $3)
         ORDER BY at DESC, id DESC
         LIMIT $1`,
        [input.limit, input.cursor.at, input.cursor.id],
      )
    : await queryPostgres<EventRow>(
        `SELECT id, at, payload FROM track_events
         ORDER BY at DESC, id DESC
         LIMIT $1`,
        [input.limit],
      );
  if (!result) return null;
  return toPage(result.rows, input.limit);
}

async function readEventsPg() {
  const page = await queryEventsPage({ limit: EVENT_PAGE_MAX });
  if (!page) return null;
  return page.rows;
}

export async function readEventsPage(input: {
  limit?: number;
  cursor?: EventPageCursor | null;
} = {}): Promise<EventPage> {
  const limit = Math.min(Math.max(input.limit ?? EVENT_PAGE_DEFAULT, 1), EVENT_PAGE_MAX);
  return requirePostgres(
    await queryEventsPage({ limit, cursor: input.cursor ?? null }),
    "read events from the database",
  );
}

export async function readEvents(): Promise<TrackEvent[]> {
  return requirePostgres(await readEventsPg(), "read events from the database");
}

export async function readEventsAll(maxRows = 10_000): Promise<TrackEvent[]> {
  const out: TrackEvent[] = [];
  let cursor: EventPageCursor | null = null;
  while (out.length < maxRows) {
    const page = await readEventsPage({
      limit: Math.min(EVENT_PAGE_DEFAULT, maxRows - out.length),
      cursor,
    });
    out.push(...page.rows);
    if (!page.nextCursor || page.rows.length === 0) break;
    cursor = page.nextCursor;
  }
  return out;
}

export async function appendEvent(event: TrackEvent) {
  // Identity A (historical / backfill only) concatenates
  // `${item.at}|${item.type}|${item.label ?? ""}|${item.email ?? ""}`.
  // appendEvent does not use that formula; it mints a new id at insert.
  requirePostgres(
    await queryPostgres(
      `INSERT INTO track_events (id, at, payload) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), event.at, JSON.stringify(event)],
    ),
    "persist the event to the database",
  );
  return event;
}
