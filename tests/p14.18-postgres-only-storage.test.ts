import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "fs";
import pg from "pg";
import type { TrackEvent } from "@/lib/admin/config";
import { DEFAULT_SETTINGS } from "@/lib/financial-engine/core/sample-data";
import type { PersistedWorkspace } from "@/lib/financial-engine/serialization";
import type { GuardVerdict } from "@/lib/smart-guard/types";
import {
  findAccount,
  publicAccount,
  readAccounts,
  upsertAccount,
  type StoredAccount,
} from "@/server/repositories/user.repository";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@/server/repositories/workspace.repository";
import { appendEvent, readEvents } from "@/server/repositories/event.repository";
import { appendGuardDecision, listGuardDecisions } from "@/server/repositories/guard-log.repository";
import { readDemoFlags, writeDemoFlags } from "@/server/repositories/demo.repository";
import { jsonStoreDataDir } from "@/server/storage/json-store";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE_DATA = join(ROOT, "data");
const ARCHIVE = join(ROOT, ".p14.17-json-archive");
const PG_URL = "postgresql://p14.18:p14.18@127.0.0.1:9/p14_18";
const TEST = "tests/p14.18-postgres-only-storage.test.ts";
const DOC = "docs/p14.18-remove-dual-write.md";
const CATALOG_REPOS = [
  "server/repositories/user.repository.ts",
  "server/repositories/workspace.repository.ts",
  "server/repositories/event.repository.ts",
  "server/repositories/guard-log.repository.ts",
] as const;

type FakeRow = Record<string, unknown>;

const fake = {
  merchants: new Map<string, StoredAccount>(),
  workspaces: new Map<string, PersistedWorkspace>(),
  events: [] as Array<{ id: string; at: number; payload: TrackEvent }>,
  guards: [] as FakeRow[],
};

const log: string[] = [];

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sampleAccount(patch: Partial<StoredAccount> & { email: string }): StoredAccount {
  return {
    fullName: "تاجر اختبار",
    storeName: "متجر P14.18",
    phone: "+970599000001",
    password: "scrypt$salt$hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActive: "2026-01-02T00:00:00.000Z",
    plan: "free",
    status: "active",
    ...patch,
    email: patch.email.trim().toLowerCase(),
  };
}

function sampleWorkspace(email: string, extra?: Partial<PersistedWorkspace>): PersistedWorkspace {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS, storeName: "P14.18 Shop", ownerName: "Owner" },
    activeFileId: "file-1",
    actionLog: [],
    ownerEmail: email,
    savedAt: "2026-02-01T00:00:00.000Z",
    files: [
      {
        id: "file-1",
        fileName: "sales.xlsx",
        uploadedAt: "2026-02-01T00:00:00.000Z",
        isDemo: false,
        parseResult: { transactions: [] } as unknown as PersistedWorkspace["files"][number]["parseResult"],
      },
    ],
    ...extra,
  };
}

function sampleVerdict(patch: Partial<GuardVerdict> & Pick<GuardVerdict, "decision" | "reason">): GuardVerdict {
  return {
    action: "login",
    summary: "p14.18 verdict",
    at: "2026-03-01T12:00:00.000Z",
    inputs: {
      simSwapRecent: false,
      simSwapHoursAgo: null,
      latestSimChange: null,
      deviceSwapRecent: false,
      deviceSwapHoursAgo: null,
      latestDeviceChange: null,
      triggers: { sim_swap_detected: false, device_swap_detected: false },
      locationMatch: true,
      locationResult: "TRUE",
      locationMatchRate: 90,
      numberVerified: true,
      nacMode: "simulator",
    },
    traces: [],
    ...patch,
  };
}

function sqlText(text: unknown) {
  if (typeof text === "string") return text;
  if (text && typeof text === "object" && "text" in text) return String((text as { text: string }).text);
  return String(text);
}

async function fakeQuery(text: unknown, values: unknown[] = []) {
  const sql = sqlText(text).replace(/\s+/g, " ").trim();
  if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
    return { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("INSERT INTO merchants")) {
    log.push("pg:insert:merchants");
    fake.merchants.set(String(values[0]), JSON.parse(String(values[1])) as StoredAccount);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT payload FROM merchants WHERE email")) {
    log.push("pg:select:merchants");
    const payload = fake.merchants.get(String(values[0]).trim().toLowerCase());
    return payload ? { rows: [{ payload }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("SELECT payload FROM merchants WHERE payload")) {
    const phone = String(values[0]);
    const skip = values[1] != null ? String(values[1]).trim().toLowerCase() : undefined;
    const payload = [...fake.merchants.values()].find((item) => item.phone === phone && (!skip || item.email !== skip));
    return payload ? { rows: [{ payload }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("SELECT payload FROM merchants")) {
    log.push("pg:select:merchants");
    return { rows: [...fake.merchants.values()].map((payload) => ({ payload })), rowCount: fake.merchants.size };
  }
  if (sql.startsWith("INSERT INTO workspaces")) {
    log.push("pg:insert:workspaces");
    fake.workspaces.set(String(values[0]), JSON.parse(String(values[1])) as PersistedWorkspace);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT payload FROM workspaces WHERE email")) {
    const payload = fake.workspaces.get(String(values[0]).trim().toLowerCase());
    return payload ? { rows: [{ payload }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("SELECT email, payload FROM workspaces")) {
    const rows = [...fake.workspaces.entries()].map(([email, payload]) => ({ email, payload }));
    return { rows, rowCount: rows.length };
  }
  if (sql.startsWith("INSERT INTO track_events")) {
    log.push("pg:insert:track_events");
    const id = String(values[0]);
    if (!fake.events.some((row) => row.id === id)) {
      fake.events.push({ id, at: Number(values[1]), payload: JSON.parse(String(values[2])) as TrackEvent });
    }
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes("FROM track_events") && sql.startsWith("SELECT") && sql.includes("payload")) {
    const limit = Number(values[0] ?? 2000);
    let rows = [...fake.events].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
    if (sql.includes("(at, id)")) {
      const at = Number(values[1]);
      const id = String(values[2]);
      rows = rows.filter((row) => row.at < at || (row.at === at && row.id < id));
    }
    const page = rows.slice(0, limit);
    return {
      rows: page.map((row) => ({ id: row.id, at: row.at, payload: row.payload })),
      rowCount: page.length,
    };
  }
  if (sql.startsWith("INSERT INTO guard_decisions")) {
    log.push("pg:insert:guard_decisions");
    fake.guards.unshift({
      id: values[0],
      email: values[1],
      phone: values[2],
      action: values[3],
      decision: values[4],
      reason: values[5],
      summary: values[6],
      sim_swap_recent: values[7],
      sim_swap_hours_ago: values[8],
      location_result: values[9],
      location_match: values[10],
      location_match_rate: values[11],
      number_verified: values[12],
      nac_mode: values[13],
      frozen_at: values[14],
      traces: values[15],
      ip: values[16],
      user_agent: values[17],
      created_at: values[18],
    });
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT * FROM guard_decisions WHERE email")) {
    const email = String(values[0]);
    const rows = fake.guards.filter((row) => row.email === email);
    return { rows, rowCount: rows.length };
  }
  if (sql.startsWith("SELECT * FROM guard_decisions")) {
    return { rows: fake.guards, rowCount: fake.guards.length };
  }
  throw new Error(`P14.18 fake SQL not mapped: ${sql}`);
}

function resetFake() {
  fake.merchants.clear();
  fake.workspaces.clear();
  fake.events.length = 0;
  fake.guards.length = 0;
  log.length = 0;
  delete process.env.VERCEL;
  process.env.DATABASE_URL = PG_URL;
}

describe("P14.18 PostgreSQL-only catalog storage", () => {
  before(() => {
    process.env.SMARTPROFIT_TEST_PG = "1";
    mock.method(pg.Pool.prototype, "query", async (text: unknown, values?: unknown) => {
      return fakeQuery(text, Array.isArray(values) ? values : []);
    });
    mock.method(pg.Pool.prototype, "connect", async () => ({
      query: async (text: unknown, values?: unknown) => fakeQuery(text, Array.isArray(values) ? values : []),
      release() {},
    }));
    mock.method(fs, "mkdir", async () => undefined);
    mock.method(fs, "readFile", async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mock.method(fs, "readdir", async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mock.method(fs, "writeFile", async () => {
      log.push("json:write");
    });
  });

  after(() => {
    mock.restoreAll();
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
    delete process.env.SMARTPROFIT_TEST_PG;
  });

  beforeEach(() => {
    resetFake();
  });

  it("locks PG-only catalogs; demo stays JSON; freeze/archive/API/engine untouched", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    for (const rel of CATALOG_REPOS) {
      const body = source(rel);
      assert.doesNotMatch(body, /readJsonFile|writeJsonFile|listJsonFiles/);
      assert.doesNotMatch(body, /from ["']@\/server\/storage\/json-store/);
      assert.doesNotMatch(body, /assertProductWrite|mergeEvents|write-freeze/);
      assert.match(body, /requirePostgres/);
      assert.doesNotMatch(body, /process\.env\.VERCEL/);
      assert.doesNotMatch(body, /\.p14\.17-json-archive/);
    }
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.doesNotMatch(source("server/repositories/demo.repository.ts"), /queryPostgres|postgresConfigured|requirePostgres/);
    assert.match(source("server/repositories/event.repository.ts"), /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
    assert.match(source("server/db/postgres.ts"), /requirePostgres/);
    assert.doesNotMatch(source("server/db/postgres.ts"), /using server file log/);
    assert.doesNotMatch(source("backend/src/http/workspace-get.ts"), /queryPostgres|from ["']pg["']/);
    assert.doesNotMatch(source("app/api/workspace/route.ts"), /queryPostgres|requirePostgres/);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres|json-store/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres|json-store/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|json-store|requirePostgres/);
    assert.equal(existsSync(join(ROOT, "docs/p14.19-cleanup.md")), false);
  });

  it("PostgreSQL-only merchant read/write; JSON is ignored; PG failure throws", async () => {
    fake.merchants.set("pg@store.test", sampleAccount({ email: "pg@store.test", fullName: "PG" }));
    const rows = await readAccounts();
    assert.deepEqual(rows.map((row) => row.email), ["pg@store.test"]);
    assert.equal(log.includes("pg:insert:merchants"), false);

    const saved = await upsertAccount(sampleAccount({ email: "New@Store.test", password: "scrypt$a$b" }));
    assert.equal(saved.email, "new@store.test");
    assert.equal(fake.merchants.get("new@store.test")?.password, "scrypt$a$b");
    assert.equal(log.includes("json:write"), false);
    const found = await findAccount("NEW@store.test");
    assert.equal(found?.createdAt, "2026-01-01T00:00:00.000Z");
    const published = publicAccount(saved);
    assert.equal("password" in published, false);

    delete process.env.DATABASE_URL;
    await assert.rejects(() => readAccounts(), /Could not read accounts from the database/);
    await assert.rejects(
      () => upsertAccount(sampleAccount({ email: "fail@store.test" })),
      /Could not read accounts from the database/,
    );
  });

  it("PostgreSQL-only workspace read/write; no JSON file; PG failure throws", async () => {
    const email = "ws@store.test";
    const saved = await saveWorkspace(email, sampleWorkspace(email, { settings: { ...DEFAULT_SETTINGS, storeName: "PG" } }));
    assert.equal(saved.settings.storeName, "PG");
    assert.equal(log.includes("json:write"), false);
    const loaded = await loadWorkspace(email);
    assert.equal(loaded?.settings.storeName, "PG");
    const listed = await listWorkspaces();
    assert.deepEqual(listed.map((row) => row.email), [email]);

    delete process.env.DATABASE_URL;
    await assert.rejects(() => loadWorkspace(email), /Could not read the workspace from the database/);
    await assert.rejects(() => listWorkspaces(), /Could not read workspaces from the database/);
    await assert.rejects(
      () => saveWorkspace("ws-fail@store.test", sampleWorkspace("ws-fail@store.test")),
      /Could not persist the workspace to the database/,
    );
  });

  it("PostgreSQL-only events; appendEvent mints PG UUID; no mergeEvents; no JSON", async () => {
    const event: TrackEvent = { type: "analyze", at: 99, label: "file.xlsx", email: "ev@store.test" };
    const returned = await appendEvent(event);
    assert.equal("id" in returned, false);
    assert.equal(fake.events.length, 1);
    assert.match(fake.events[0].id, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(fake.events[0].payload, event);
    assert.equal(log.includes("json:write"), false);
    const rows = await readEvents();
    assert.equal(rows[0].email, "ev@store.test");

    delete process.env.DATABASE_URL;
    await assert.rejects(() => readEvents(), /Could not read events from the database/);
    await assert.rejects(() => appendEvent({ type: "login", at: 1, email: "x@store.test" }), /Could not persist the event to the database/);
  });

  it("PostgreSQL-only guard decisions; no JSON fallback; list backend is postgres", async () => {
    const row = await appendGuardDecision({
      email: "Guard@Store.test",
      phone: "+970599000001",
      verdict: sampleVerdict({ decision: "allow", reason: "clean" }),
    });
    assert.equal(row.email, "guard@store.test");
    assert.equal(fake.guards.length, 1);
    assert.equal(log.includes("json:write"), false);
    const listed = await listGuardDecisions({ email: "guard@store.test" });
    assert.equal(listed.backend, "postgres");
    assert.equal(listed.rows[0].id, row.id);

    delete process.env.DATABASE_URL;
    await assert.rejects(
      () => appendGuardDecision({ email: "g-fail@store.test", phone: "+1", verdict: sampleVerdict({ decision: "allow", reason: "clean" }) }),
      /Could not persist the guard decision to the database/,
    );
    await assert.rejects(() => listGuardDecisions({}), /Could not read guard decisions from the database/);
  });

  it("nac-demo.json remains JSON-only and does not touch catalog tables", async () => {
    const before = fake.merchants.size + fake.events.length + fake.guards.length;
    const saved = await writeDemoFlags("Demo@Store.test", { simSwapRecent: true, locationOutside: true });
    assert.equal(saved.simSwapRecent, true);
    const read = await readDemoFlags("demo@store.test");
    assert.equal(read.locationOutside, true);
    assert.equal(fake.merchants.size + fake.events.length + fake.guards.length, before);
    assert.equal(log.some((item) => item.startsWith("pg:insert")), false);
  });

  it("isolated test store is not live data/; live catalogs stay absent; archive and freeze remain", () => {
    const isolated = (process.env.SMARTPROFIT_DATA_DIR || "").trim();
    assert.notEqual(isolated, "");
    assert.equal(jsonStoreDataDir(), isolated);
    assert.equal(isolated === LIVE_DATA, false);
    assert.equal(existsSync(join(LIVE_DATA, "users.json")), false);
    assert.equal(existsSync(join(LIVE_DATA, "events.json")), false);
    assert.equal(existsSync(join(LIVE_DATA, "guard-decisions.json")), false);
    assert.equal(existsSync(join(LIVE_DATA, "workspaces")), false);
    assert.equal(existsSync(join(LIVE_DATA, "nac-demo.json")), true);
    const freezeHeld = existsSync(join(LIVE_DATA, ".p14.12r-write-freeze"));
    const cutoverDone = existsSync(join(LIVE_DATA, ".p14.20-final-cutover"));
    assert.equal(freezeHeld || cutoverDone, true);
    if (cutoverDone) assert.equal(freezeHeld, false);
    const archiveDeleted = existsSync(join(LIVE_DATA, ".p14.23-json-archive-deleted"));
    assert.equal(existsSync(join(ARCHIVE, "users.json")), !archiveDeleted);
    assert.equal(existsSync(join(ARCHIVE, "events.json")), !archiveDeleted);
    assert.equal(existsSync(join(ARCHIVE, "guard-decisions.json")), !archiveDeleted);
    assert.equal(existsSync(join(ARCHIVE, "workspaces")), !archiveDeleted);
    assert.equal(existsSync(join(ARCHIVE, "nac-demo.json")), false);
    assert.doesNotMatch(source(TEST), /from ["']@\/server\/db\/postgres/);
    assert.doesNotMatch(source("tests/setup.ts"), /DATABASE_URL/);
  });
});
