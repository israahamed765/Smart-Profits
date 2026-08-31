import { join } from "node:path";

/** P14.23 completion marker. P15.1 / P15.2 CLIs still gate on this file. */
export function archiveDeleteMarkerPath() {
  return join(process.cwd(), "data", ".p14.23-json-archive-deleted");
}

export function parseArchiveDeletedMarker(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      archiveDeleted?: unknown;
      postgresMutated?: unknown;
      nacDemoUntouched?: unknown;
    };
    if (parsed.archiveDeleted !== true) return null;
    if (parsed.postgresMutated !== false) return null;
    if (parsed.nacDemoUntouched !== true) return null;
    return {
      archiveDeleted: true as const,
      postgresMutated: false as const,
      nacDemoUntouched: true as const,
    };
  } catch {
    return null;
  }
}
