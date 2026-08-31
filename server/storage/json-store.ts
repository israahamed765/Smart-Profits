import { promises as fs } from "fs";
import path from "path";

const memory = new Map<string, string>();

function isolatedDataDir() {
  return (process.env.SMARTPROFIT_DATA_DIR || "").trim();
}

export function jsonStoreDataDir() {
  const isolated = isolatedDataDir();
  if (isolated) return isolated;
  return process.env.VERCEL ? path.join("/tmp", "smartprofit-data") : path.join(process.cwd(), "data");
}

function dataDir() {
  return jsonStoreDataDir();
}

function writablePath(rel: string) {
  return path.join(dataDir(), rel);
}

function shippedPath(rel: string) {
  if (isolatedDataDir()) return writablePath(rel);
  return path.join(process.cwd(), "data", rel);
}

function isLiveDataPath(file: string) {
  const live = path.resolve(process.cwd(), "data");
  const dest = path.resolve(file);
  return dest === live || dest.startsWith(live + path.sep);
}

function refuseLiveTestWrite(file: string) {
  if ((process.env.NODE_ENV || "").trim() !== "test") return;
  if (isLiveDataPath(file)) {
    throw new Error("test storage isolation: refusing write to live data/");
  }
}

export async function readJsonFile<T>(rel: string, fallback: T): Promise<T> {
  const cached = memory.get(rel);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // ignore bad cache
    }
  }

  for (const file of [writablePath(rel), shippedPath(rel)]) {
    try {
      const raw = await fs.readFile(file, "utf8");
      memory.set(rel, raw);
      return JSON.parse(raw) as T;
    } catch {
      // try next location
    }
  }

  memory.set(rel, JSON.stringify(fallback));
  return fallback;
}

export async function writeJsonFile<T>(rel: string, value: T): Promise<void> {
  const raw = JSON.stringify(value, null, 2);
  memory.set(rel, raw);
  const file = writablePath(rel);
  refuseLiveTestWrite(file);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, raw, "utf8");
  } catch {
    // Vercel’s app filesystem is read-only; /tmp or memory is enough for this instance.
  }
}

export async function listJsonFiles<T>(dirRel: string): Promise<Array<{ name: string; value: T }>> {
  const prefix = dirRel.endsWith("/") ? dirRel : `${dirRel}/`;
  const rows = new Map<string, T>();

  for (const [key, raw] of memory) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) continue;
    try {
      rows.set(key.slice(prefix.length), JSON.parse(raw) as T);
    } catch {
      // skip
    }
  }

  for (const dir of [writablePath(dirRel), shippedPath(dirRel)]) {
    try {
      const names = await fs.readdir(dir);
      for (const name of names) {
        if (!name.endsWith(".json") || rows.has(name)) continue;
        try {
          const raw = await fs.readFile(path.join(dir, name), "utf8");
          rows.set(name, JSON.parse(raw) as T);
        } catch {
          // skip
        }
      }
    } catch {
      // directory missing
    }
  }

  return Array.from(rows.entries()).map(([name, value]) => ({ name, value }));
}
