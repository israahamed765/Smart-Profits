import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  findAccountByPhone,
  publicAccount,
  readAccounts,
  upsertAccount,
  type StoredAccount,
} from "@/server/repositories/user.repository";
import { listWorkspaces, loadWorkspace, saveWorkspace } from "@/server/repositories/workspace.repository";
import { appendEvent, readEvents, readEventsPage } from "@/server/repositories/event.repository";
import { appendGuardDecision, listGuardDecisions } from "@/server/repositories/guard-log.repository";
import { readDemoFlags, writeDemoFlags } from "@/server/repositories/demo.repository";
import { writeJsonFile } from "@/server/storage/json-store";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PG_URL = "postgresql://p14.4:p14.4@127.0.0.1:9/p14_4";

type FakeRow = Record<string, unknown>;

const fake = {
  merchants: new Map<string, StoredAccount>(),
  workspaces: new Map<string, PersistedWorkspace>(),
  events: [] as Array<{ id: string; at: number; payload: TrackEvent }>,
  guards: [] as FakeRow[],
};

const log: string[] = [];
let jsonWriteShouldThrow = false;
let pgShouldThrow = false;
let pgQueryCount = 0;

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sampleAccount(patch: Partial<StoredAccount> & { email: string }): StoredAccount {
  return {
    fullName: "تاجر اختبار",
    storeName: "متجر P14.4",
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
    settings: { ...DEFAULT_SETTINGS, storeName: "P14.4 Shop", ownerName: "Owner" },
    activeFileId: "file-1",
    actionLog: [
      {
        id: "a1",
        fileId: "file-1",
        fileName: "sales.xlsx",
        recommendationId: "r1",
        title: "saved",
        body: "ok",
        actionLabel: "apply",
        appliedAt: "2026-02-01T00:00:00.000Z",
        status: "applied",
      },
    ],
    taxonomy: { sku: { key: "sku", term: "sku", side: "revenue", bucket: "revenue", updatedAt: "2026-02-01T00:00:00.000Z" } },
    ownerEmail: email,
    savedAt: "2026-02-01T00:00:00.000Z",
    files: [
      {
        id: "file-1",
        fileName: "sales.xlsx",
        uploadedAt: "2026-02-01T00:00:00.000Z",
        isDemo: false,
        parseResult: {
          fileName: "sales.xlsx",
          sheetName: "Sheet1",
          rowCount: 1,
          skippedRows: 0,
          warnings: [],
          mapping: { confidence: 1, columns: {} },
          cleaning: {
            sourceRows: 1,
            validRows: 1,
            skippedRows: 0,
            columnsDetected: 1,
            columnsMapped: 1,
            valuesFixed: 0,
            duplicatesRemoved: 0,
            reviewNeeded: 0,
          },
          transactions: [
            {
              date: "2026-02-01T00:00:00.000Z",
              product: "قهوة",
              sku: "SKU-1",
              quantity: 2,
              sellingPrice: 10,
              costPrice: 4,
              revenue: 20,
              expense: 0,
              category: "",
              expenseType: "",
              notes: "",
              bucket: "revenue",
            },
          ],
        } as unknown as PersistedWorkspace["files"][number]["parseResult"],
      },
    ],
    ...extra,
  };
}

function sampleVerdict(patch: Partial<GuardVerdict> & Pick<GuardVerdict, "decision" | "reason">): GuardVerdict {
  return {
    action: "login",
    summary: "p14.4 verdict",
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
    traces: [
      {
        api: "camara",
        endpoint: "/sim-swap",
        mode: "simulator",
        request: { phone: "+970599000001" },
        response: { swapped: false },
      },
    ],
    ...patch,
  };
}

function sqlText(text: unknown) {
  if (typeof text === "string") return text;
  if (text && typeof text === "object" && "text" in text) return String((text as { text: string }).text);
  return String(text);
}

async function fakeQuery(text: unknown, values: unknown[] = []) {
  pgQueryCount += 1;
  if (pgShouldThrow) throw new Error("p14.4 injected postgres failure");
  const sql = sqlText(text).replace(/\s+/g, " ").trim();
  if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
    return { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("CREATE TABLE") || sql.includes("CREATE INDEX")) {
    return { rows: [], rowCount: 0 };
  }

  if (sql.startsWith("INSERT INTO merchants")) {
    log.push("pg:insert:merchants");
    const email = String(values[0]);
    const payload = JSON.parse(String(values[1])) as StoredAccount;
    fake.merchants.set(email, payload);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT payload FROM merchants WHERE email")) {
    log.push("pg:select:merchants");
    const payload = fake.merchants.get(String(values[0]).trim().toLowerCase());
    return payload ? { rows: [{ payload }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("SELECT payload FROM merchants WHERE payload")) {
    log.push("pg:select:merchants");
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
    const email = String(values[0]);
    const payload = JSON.parse(String(values[1])) as PersistedWorkspace;
    fake.workspaces.set(email, payload);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT payload FROM workspaces WHERE email")) {
    log.push("pg:select:workspaces");
    const payload = fake.workspaces.get(String(values[0]).trim().toLowerCase());
    return payload ? { rows: [{ payload }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.startsWith("SELECT email, payload FROM workspaces")) {
    log.push("pg:list:workspaces");
    const rows = [...fake.workspaces.entries()].map(([email, payload]) => ({ email, payload }));
    return { rows, rowCount: rows.length };
  }

  if (sql.startsWith("INSERT INTO track_events")) {
    log.push("pg:insert:track_events");
    const id = String(values[0]);
    const at = Number(values[1]);
    const payload = JSON.parse(String(values[2])) as TrackEvent;
    if (!fake.events.some((row) => row.id === id)) fake.events.push({ id, at, payload });
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes("FROM track_events") && sql.startsWith("SELECT") && sql.includes("payload")) {
    log.push("pg:select:track_events");
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
      traces: JSON.parse(String(values[15])),
      ip: values[16],
      user_agent: values[17],
      created_at: values[18],
    });
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT * FROM guard_decisions WHERE email")) {
    log.push("pg:select:guard_decisions");
    const email = String(values[0]);
    const limit = Number(values[1] ?? 50);
    const rows = fake.guards.filter((row) => row.email === email).slice(0, limit);
    return { rows, rowCount: rows.length };
  }
  if (sql.startsWith("SELECT * FROM guard_decisions")) {
    log.push("pg:select:guard_decisions");
    const limit = Number(values[0] ?? 50);
    return { rows: fake.guards.slice(0, limit), rowCount: Math.min(limit, fake.guards.length) };
  }

  throw new Error(`P14.4 fake SQL not mapped: ${sql}`);
}

async function resetStores() {
  fake.merchants.clear();
  fake.workspaces.clear();
  fake.events.length = 0;
  fake.guards.length = 0;
  log.length = 0;
  jsonWriteShouldThrow = false;
  pgShouldThrow = false;
  pgQueryCount = 0;
  delete process.env.VERCEL;
  process.env.DATABASE_URL = PG_URL;
  await writeJsonFile("nac-demo.json", {});
  log.length = 0;
}

describe("P14.4 repository dual-write characterization", () => {
  before(() => {
    process.env.SMARTPROFIT_TEST_PG = "1";
    mock.method(pg.Pool.prototype, "query", async (text: unknown, values?: unknown) => {
      const bound = Array.isArray(values) ? values : [];
      return fakeQuery(text, bound);
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
      if (jsonWriteShouldThrow) throw new Error("p14.4 injected json write failure");
    });
  });

  after(() => {
    mock.restoreAll();
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
    delete process.env.SMARTPROFIT_TEST_PG;
  });

  beforeEach(async () => {
    await resetStores();
  });

  describe("source contracts (P14.18 PostgreSQL-only catalogs)", () => {
    it("locks PostgreSQL-only writes; demo stays JSON; no catalog JSON fallback", () => {
      for (const rel of [
        "server/repositories/user.repository.ts",
        "server/repositories/workspace.repository.ts",
        "server/repositories/event.repository.ts",
        "server/repositories/guard-log.repository.ts",
      ]) {
        const body = source(rel);
        assert.doesNotMatch(body, /readJsonFile|writeJsonFile|listJsonFiles/);
        assert.match(body, /requirePostgres/);
        assert.doesNotMatch(body, /process\.env\.VERCEL/);
      }
      const guard = source("server/repositories/guard-log.repository.ts");
      assert.match(guard, /requirePostgres\(\s*await queryPostgres\(/);
      assert.doesNotMatch(guard, /writeFileLogs|readFileLogs/);
      assert.doesNotMatch(source("server/repositories/demo.repository.ts"), /queryPostgres|postgresConfigured|pg/);
    });

    it("locks no on-read backfill; PG failure does not return JSON", () => {
      const users = source("server/repositories/user.repository.ts");
      assert.match(users, /return requirePostgres\(await readAccountsPg\(\), "read accounts from the database"\);/);
      assert.doesNotMatch(users, /for \(const account of json\) await writeAccountPg\(account\)/);
      const workspace = source("server/repositories/workspace.repository.ts");
      assert.match(workspace, /requirePostgres\(await loadWorkspacePg\(email\), "read the workspace from the database"\)/);
      assert.doesNotMatch(workspace, /await saveWorkspace\(email, parsed\)/);
      const events = source("server/repositories/event.repository.ts");
      assert.doesNotMatch(events, /for \(const event of json\)/);
      assert.match(events, /return requirePostgres\(await readEventsPg\(\), "read events from the database"\);/);
      assert.doesNotMatch(events, /mergeEvents/);
      assert.doesNotMatch(source("server/repositories/guard-log.repository.ts"), /saveWorkspace|writeAccountPg/);
    });

    it("locks queryPostgres swallow + requirePostgres throw + event UUID at insert", () => {
      const pg = source("server/db/postgres.ts");
      assert.match(pg, /PG_CONNECT_BACKOFF_MS/);
      assert.match(pg, /statement_timeout: PG_STATEMENT_TIMEOUT_MS/);
      assert.match(pg, /isPostgresConnectivityError/);
      assert.doesNotMatch(pg, /30_000/);
      assert.match(pg, /return null;/);
      assert.match(pg, /export function requirePostgres/);
      assert.match(source("server/storage/json-store.ts"), /catch \{\s*\/\/ Vercel/);
      assert.match(source("server/repositories/event.repository.ts"), /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
      assert.match(source("server/repositories/event.repository.ts"), /ON CONFLICT \(id\) DO NOTHING/);
      assert.doesNotMatch(source("server/repositories/event.repository.ts"), /writeJsonFile/);
    });

    it("locks listWorkspaces using PostgreSQL only", () => {
      assert.match(source("server/repositories/workspace.repository.ts"), /requirePostgres\(/);
      assert.match(
        source("server/repositories/workspace.repository.ts"),
        /SELECT email, payload FROM workspaces/,
      );
    });
  });

  describe("users / merchants", () => {
    it("throws when PostgreSQL is not configured instead of writing users.json", async () => {
      delete process.env.DATABASE_URL;
      await assert.rejects(
        () => upsertAccount(sampleAccount({ email: "Json.Only@Store.test", password: "scrypt$a$b" })),
        /Could not read accounts from the database/,
      );
      assert.equal(fake.merchants.size, 0);
    });

    it("PG-only read when JSON is empty and merchants exist", async () => {
      fake.merchants.set("pg.only@store.test", sampleAccount({ email: "pg.only@store.test", fullName: "PG" }));
      const rows = await readAccounts();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].fullName, "PG");
    });

    it("PG + JSON: populated PostgreSQL hides extra JSON accounts", async () => {
      await writeJsonFile("users.json", [sampleAccount({ email: "json-hidden@store.test" })]);
      fake.merchants.set("pg-visible@store.test", sampleAccount({ email: "pg-visible@store.test" }));
      const rows = await readAccounts();
      assert.deepEqual(rows.map((row) => row.email), ["pg-visible@store.test"]);
    });

    it("PG empty is primary; JSON merchants stay shadow and are not backfilled", async () => {
      await writeJsonFile("users.json", [sampleAccount({ email: "backfill@store.test", resetCodeHash: "scrypt$r$c" })]);
      const rows = await readAccounts();
      assert.deepEqual(rows, []);
      assert.equal(fake.merchants.size, 0);
      assert.equal(log.includes("pg:insert:merchants"), false);
    });

    it("PG unavailable throws; JSON merchants are not read or backfilled", async () => {
      delete process.env.DATABASE_URL;
      await writeJsonFile("users.json", [sampleAccount({ email: "offline@store.test" })]);
      await assert.rejects(() => readAccounts(), /Could not read accounts from the database/);
      assert.equal(fake.merchants.size, 0);
    });

    it("catalog upsert does not write JSON even if the JSON adapter would fail", async () => {
      jsonWriteShouldThrow = true;
      const saved = await upsertAccount(sampleAccount({ email: "json-fail@store.test" }));
      jsonWriteShouldThrow = false;
      assert.equal(saved.email, "json-fail@store.test");
      assert.equal(log.includes("json:write"), false);
      const found = await findAccount("json-fail@store.test");
      assert.equal(found?.email, "json-fail@store.test");
    });

    it("duplicate email is last-write-wins in JSON array and PG map", async () => {
      await upsertAccount(sampleAccount({ email: "dup@store.test", password: "first", plan: "free" }));
      await upsertAccount({ email: "DUP@store.test", password: "second", plan: "pro" });
      const rows = await readAccounts();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].password, "second");
      assert.equal(rows[0].plan, "pro");
      assert.equal(rows[0].createdAt, "2026-01-01T00:00:00.000Z");
    });

    it("phone uniqueness is first-match lookup only; repository does not reject duplicates", async () => {
      await upsertAccount(sampleAccount({ email: "a@store.test", phone: "+970599111111" }));
      await upsertAccount(sampleAccount({ email: "b@store.test", phone: "+970599111111" }));
      const rows = await readAccounts();
      assert.equal(rows.length, 2);
      const found = await findAccountByPhone("+970599111111");
      assert.equal(found?.email, "a@store.test");
      assert.equal(await findAccountByPhone(""), null);
      const skipped = await findAccountByPhone("+970599111111", "a@store.test");
      assert.equal(skipped?.email, "b@store.test");
    });

    it("round-trips StoredAccount integrity fields and publicAccount strips secrets", async () => {
      const saved = await upsertAccount(
        sampleAccount({
          email: "integrity@store.test",
          password: "scrypt$keep$me",
          resetCodeHash: "scrypt$reset$x",
          resetCodeExpiresAt: "2026-04-01T00:00:00.000Z",
          guardFrozen: true,
          guardFrozenAt: "2026-03-01T00:00:00.000Z",
          guardReason: "sim_swap",
          homeLat: 31.5,
          homeLng: 34.4,
        }),
      );
      const found = await findAccount("integrity@store.test");
      assert.equal(found?.password, "scrypt$keep$me");
      assert.equal(found?.resetCodeHash, "scrypt$reset$x");
      assert.equal(found?.guardFrozen, true);
      assert.equal(found?.homeLat, 31.5);
      const published = publicAccount(saved);
      assert.equal("password" in published, false);
      assert.equal("resetCodeHash" in published, false);
    });

    it("write order for a configured upsert is PostgreSQL only", async () => {
      await upsertAccount(sampleAccount({ email: "order@store.test" }));
      const writes = log.filter((item) => item === "pg:insert:merchants" || item === "json:write");
      assert.deepEqual(writes.filter((item) => item.startsWith("pg:")), ["pg:insert:merchants"]);
      assert.equal(writes.includes("json:write"), false);
    });
  });

  describe("workspaces", () => {
    it("throws when PostgreSQL is not configured instead of writing a workspace JSON file", async () => {
      delete process.env.DATABASE_URL;
      const email = "ws-json@store.test";
      await assert.rejects(
        () => saveWorkspace(email, sampleWorkspace(email)),
        /Could not persist the workspace to the database/,
      );
      assert.equal(fake.workspaces.size, 0);
    });

    it("PG-only load when JSON is empty", async () => {
      const email = "ws-pg@store.test";
      fake.workspaces.set(email, sampleWorkspace(email, { settings: { ...DEFAULT_SETTINGS, storeName: "FromPG" } }));
      const loaded = await loadWorkspace(email);
      assert.equal(loaded?.settings.storeName, "FromPG");
    });

    it("PG + JSON: populated PostgreSQL wins on load", async () => {
      const email = "ws-both@store.test";
      await writeJsonFile(`workspaces/ws-both_store.test.json`, sampleWorkspace(email, { settings: { ...DEFAULT_SETTINGS, storeName: "JSON" } }));
      fake.workspaces.set(email, sampleWorkspace(email, { settings: { ...DEFAULT_SETTINGS, storeName: "PG" } }));
      const loaded = await loadWorkspace(email);
      assert.equal(loaded?.settings.storeName, "PG");
    });

    it("PG empty is primary; JSON workspace stays shadow and is not backfilled", async () => {
      const email = "ws-backfill@store.test";
      await writeJsonFile(`workspaces/ws-backfill_store.test.json`, sampleWorkspace(email));
      const loaded = await loadWorkspace(email);
      assert.equal(loaded, null);
      assert.equal(fake.workspaces.has(email), false);
    });

    it("PG unavailable throws; JSON workspace is not read or backfilled", async () => {
      delete process.env.DATABASE_URL;
      const email = "ws-offline@store.test";
      await writeJsonFile(`workspaces/ws-offline_store.test.json`, sampleWorkspace(email));
      await assert.rejects(() => loadWorkspace(email), /Could not read the workspace from the database/);
      assert.equal(fake.workspaces.size, 0);
    });

    it("same email overwrites one workspace row", async () => {
      const email = "ws-dup@store.test";
      await saveWorkspace(email, sampleWorkspace(email, { activeFileId: "file-1" }));
      await saveWorkspace(email, sampleWorkspace(email, { activeFileId: "file-1", actionLog: [] }));
      assert.equal(fake.workspaces.size, 1);
      assert.deepEqual(fake.workspaces.get(email)?.actionLog, []);
    });

    it("round-trips workspace files, taxonomy, timestamps, and transactions", async () => {
      const email = "ws-round@store.test";
      const saved = await saveWorkspace(email, sampleWorkspace(email));
      const loaded = await loadWorkspace(email);
      assert.equal(loaded?.version, 2);
      assert.equal(loaded?.taxonomy?.sku.term, "sku");
      assert.equal(loaded?.files[0].parseResult.fileName, "sales.xlsx");
      assert.equal(saved.ownerEmail, email);
    });

    it("listWorkspaces uses PostgreSQL rows and hides JSON when PG returns any row", async () => {
      const pgEmail = "ws-list-pg@store.test";
      const jsonEmail = "ws-list-json@store.test";
      fake.workspaces.set(pgEmail, sampleWorkspace(pgEmail));
      await writeJsonFile(`workspaces/ws-list-json_store.test.json`, sampleWorkspace(jsonEmail));
      const rows = await listWorkspaces();
      assert.deepEqual(rows.map((row) => row.email), [pgEmail]);
    });

    it("listWorkspaces with PG rows that lack files does not fall through to JSON", async () => {
      fake.workspaces.set(
        "empty@store.test",
        { version: 2, settings: DEFAULT_SETTINGS, activeFileId: "x", actionLog: [] } as unknown as PersistedWorkspace,
      );
      await writeJsonFile(`workspaces/hidden_store.test.json`, sampleWorkspace("hidden@store.test"));
      const rows = await listWorkspaces();
      assert.deepEqual(rows, []);
    });

    it("write order for a configured save is PostgreSQL only", async () => {
      await saveWorkspace("ws-order@store.test", sampleWorkspace("ws-order@store.test"));
      const writes = log.filter((item) => item === "pg:insert:workspaces" || item === "json:write");
      assert.deepEqual(writes.filter((item) => item.startsWith("pg:")), ["pg:insert:workspaces"]);
      assert.equal(writes.includes("json:write"), false);
    });
  });

  describe("events", () => {
    it("throws when PostgreSQL is not configured instead of appending events.json", async () => {
      delete process.env.DATABASE_URL;
      const event: TrackEvent = { type: "login", at: 1_700_000_000_000, email: "ev@store.test", label: "ok" };
      await assert.rejects(() => appendEvent(event), /Could not persist the event to the database/);
      assert.equal(fake.events.length, 0);
    });

    it("PG read hides extra JSON events when PostgreSQL has rows", async () => {
      await writeJsonFile("events.json", [{ type: "analyze", at: 1, email: "json@store.test" }]);
      fake.events.push({ id: "pg-1", at: 2, payload: { type: "login", at: 2, email: "pg@store.test" } });
      const rows = await readEvents();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].email, "pg@store.test");
    });

    it("appendEvent inserts a generated UUID; payload has no id; no JSON write", async () => {
      const event: TrackEvent = { type: "analyze", at: 99, label: "file.xlsx", email: "ev2@store.test" };
      const returned = await appendEvent(event);
      assert.equal("id" in returned, false);
      assert.equal(fake.events.length, 1);
      assert.match(fake.events[0].id, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(fake.events[0].payload, event);
      const writes = log.filter((item) => item === "pg:insert:track_events" || item === "json:write");
      assert.deepEqual(writes.filter((item) => item.startsWith("pg:")), ["pg:insert:track_events"]);
      assert.equal(writes.includes("json:write"), false);
    });

    it("the same event without id receives a different UUID on each append", async () => {
      const event: TrackEvent = { type: "login", at: 100, email: "dup-ev@store.test" };
      await appendEvent(event);
      await appendEvent(event);
      assert.equal(fake.events.length, 2);
      assert.notEqual(fake.events[0].id, fake.events[1].id);
    });

    it("readEventsPage walks older rows with an (at, id) cursor", async () => {
      fake.events.push(
        { id: "id-c", at: 30, payload: { type: "login", at: 30, email: "page@store.test" } },
        { id: "id-b", at: 20, payload: { type: "login", at: 20, email: "page@store.test" } },
        { id: "id-a", at: 10, payload: { type: "login", at: 10, email: "page@store.test" } },
      );
      const first = await readEventsPage({ limit: 2 });
      assert.equal(first.rows.map((row) => row.at).join(","), "30,20");
      assert.equal(first.nextCursor?.at, 20);
      const second = await readEventsPage({ limit: 2, cursor: first.nextCursor });
      assert.equal(second.rows.length, 1);
      assert.equal(second.rows[0]?.at, 10);
      assert.equal(second.nextCursor, null);
    });

    it("PG empty is primary; JSON events stay shadow and are not copied", async () => {
      await writeJsonFile("events.json", [{ type: "doctor", at: 3, email: "cap@store.test" }]);
      const rows = await readEvents();
      assert.deepEqual(rows, []);
      assert.equal(fake.events.length, 0);
      assert.equal(log.includes("pg:insert:track_events"), false);
    });

    it("JSON event cap is no longer applied; appendEvent requires PostgreSQL", async () => {
      delete process.env.DATABASE_URL;
      await writeJsonFile("events.json", Array.from({ length: 2000 }, (_, i) => ({ type: "login" as const, at: i + 1 })));
      await assert.rejects(
        () => appendEvent({ type: "register", at: 9000, email: "cap@store.test" }),
        /Could not persist the event to the database/,
      );
      assert.equal(fake.events.length, 0);
    });

    it("mergeEvents is gone; appendEvent still writes PostgreSQL and not JSON", async () => {
      assert.doesNotMatch(source("server/repositories/event.repository.ts"), /mergeEvents/);
      await appendEvent({ type: "leak", at: 5, email: "m@store.test" });
      assert.equal(fake.events.length, 1);
      assert.equal(fake.events[0].payload.email, "m@store.test");
      const rows = await readEvents();
      assert.equal(rows[0].type, "leak");
      assert.equal(log.includes("json:write"), false);
    });
  });

  describe("guard decisions", () => {
    it("PG-first write skips JSON when insert succeeds", async () => {
      const row = await appendGuardDecision({
        email: "Guard@Store.test",
        phone: "+970599000001",
        verdict: sampleVerdict({ decision: "allow", reason: "clean" }),
        meta: { ip: "1.1.1.1", userAgent: "P14.4" },
      });
      assert.match(row.id, /^[0-9a-f-]{36}$/i);
      assert.equal(row.email, "guard@store.test");
      assert.equal(row.frozenAt, null);
      assert.equal(fake.guards.length, 1);
      const jsonWritesAfterInsert = log.slice(log.indexOf("pg:insert:guard_decisions") + 1).filter((item) => item === "json:write");
      assert.deepEqual(jsonWritesAfterInsert, []);
    });

    it("throws when PostgreSQL is unavailable instead of writing guard JSON", async () => {
      delete process.env.DATABASE_URL;
      await assert.rejects(
        () =>
          appendGuardDecision({
            email: "g-json@store.test",
            phone: "+970599000002",
            verdict: sampleVerdict({ decision: "step_up", reason: "need_number_verification" }),
          }),
        /Could not persist the guard decision to the database/,
      );
      assert.equal(fake.guards.length, 0);
    });

    it("traces JSONB round-trip from PG rows including string traces", async () => {
      await appendGuardDecision({
        email: "g-trace@store.test",
        phone: "+1",
        verdict: sampleVerdict({ decision: "allow", reason: "clean" }),
      });
      const listed = await listGuardDecisions({ email: "g-trace@store.test" });
      assert.equal(listed.backend, "postgres");
      assert.equal(listed.rows[0].traces?.[0].api, "camara");
      fake.guards[0].traces = JSON.stringify([{ api: "as-string", endpoint: "/", mode: "simulator", request: {}, response: {} }]);
      const again = await listGuardDecisions({ email: "g-trace@store.test" });
      assert.equal(again.rows[0].traces?.[0].api, "as-string");
    });

    it("freeze-related persistence stores frozenAt from verdict.at", async () => {
      const row = await appendGuardDecision({
        email: "g-freeze@store.test",
        phone: "+970599000003",
        verdict: sampleVerdict({ decision: "freeze", reason: "sim_swap" }),
      });
      assert.equal(row.frozenAt, "2026-03-01T12:00:00.000Z");
      assert.equal(row.decision, "freeze");
      const listed = await listGuardDecisions({ email: "g-freeze@store.test" });
      assert.equal(listed.rows[0].frozenAt, "2026-03-01T12:00:00.000Z");
    });

    it("empty PostgreSQL result does not fall through to JSON", async () => {
      const listed = await listGuardDecisions({ email: "g-hidden@store.test" });
      assert.equal(listed.backend, "postgres");
      assert.deepEqual(listed.rows, []);
    });
  });

  describe("demo flags", () => {
    it("is JSON-only and does not insert into PostgreSQL", async () => {
      const before = pgQueryCount;
      const saved = await writeDemoFlags("Demo@Store.test", { simSwapRecent: true, locationOutside: true });
      assert.equal(saved.simSwapRecent, true);
      assert.equal(saved.numberMatch, true);
      const read = await readDemoFlags("demo@store.test");
      assert.equal(read.locationOutside, true);
      assert.equal(fake.merchants.size, 0);
      assert.equal(fake.guards.length, 0);
      assert.equal(log.some((item) => item.startsWith("pg:insert")), false);
      assert.equal(pgQueryCount, before);
    });
  });

  describe("Vercel + PostgreSQL driver failure (no JSON fallback)", () => {
    it("users/workspace/events/guard all throw when queryPostgres returns null", async () => {
      process.env.VERCEL = "1";
      pgShouldThrow = true;
      await assert.rejects(
        () => upsertAccount(sampleAccount({ email: "vercel-user@store.test" })),
        /Could not read accounts from the database/,
      );
      await assert.rejects(
        () => saveWorkspace("vercel-ws@store.test", sampleWorkspace("vercel-ws@store.test")),
        /Could not persist the workspace to the database/,
      );
      await assert.rejects(
        () => appendEvent({ type: "login", at: 1, email: "vercel-ev@store.test" }),
        /Could not persist the event to the database/,
      );
      await assert.rejects(
        () =>
          appendGuardDecision({
            email: "vercel-g@store.test",
            phone: "+3",
            verdict: sampleVerdict({ decision: "allow", reason: "clean" }),
          }),
        /Could not persist the guard decision to the database/,
      );
    });

    it("a query error does not poison later catalog writes", async () => {
      pgShouldThrow = true;
      await assert.rejects(
        () => findAccount("poison@store.test"),
        /Could not read accounts from the database/,
      );
      pgShouldThrow = false;
      const saved = await upsertAccount(sampleAccount({ email: "after-fail@store.test" }));
      assert.equal(saved.email, "after-fail@store.test");
    });
  });
});
