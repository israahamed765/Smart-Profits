import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonStoreDataDir, writeJsonFile } from "@/server/storage/json-store";
import { engageWriteFreeze, isWriteFrozen, releaseWriteFreeze, writeFreezeFlagPath } from "@/server/write-freeze";
import { readDemoFlags, writeDemoFlags } from "@/server/repositories/demo.repository";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE_DATA = join(ROOT, "data");
const TEST = "tests/p14.15-test-storage-isolation.test.ts";
const LIVE_SEP = sep;

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sha256Text(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function walkFiles(dir: string, out: string[] = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function fingerprintLiveData() {
  return walkFiles(LIVE_DATA).map((file) => {
    const rel = relative(LIVE_DATA, file).split(LIVE_SEP).join("/");
    const raw = readFileSync(file);
    return { rel, bytes: raw.length, sha256: sha256Text(raw.toString("utf8")) };
  });
}

describe("P14.15 test storage isolation", () => {
  it("setup and json-store never target live data/; freeze path is isolated", () => {
    const setup = source("tests/setup.ts");
    assert.match(setup, /SMARTPROFIT_DATA_DIR/);
    assert.match(setup, /mkdtempSync/);
    assert.match(setup, /SMARTPROFIT_FREEZE_PATH/);
    assert.match(setup, /testStoreRoot/);
    assert.doesNotMatch(setup, /DATABASE_URL/);
    assert.doesNotMatch(setup, /\.p14\.12r-write-freeze/);
    assert.match(source("package.json"), /--import \.\/tests\/setup\.ts/);
    assert.match(source("package.json"), /p14\.15-test-storage-isolation\.test\.ts/);

    const store = source("server/storage/json-store.ts");
    assert.match(store, /SMARTPROFIT_DATA_DIR/);
    assert.match(store, /refusing write to live data/);
    assert.match(store, /if \(isolatedDataDir\(\)\) return writablePath\(rel\)/);
    assert.match(store, /catch \{\s*\/\/ Vercel/);

    const freeze = source("server/write-freeze.ts");
    assert.match(freeze, /SMARTPROFIT_FREEZE_PATH/);
    assert.match(freeze, /join\(process\.cwd\(\), "data", "\.p14\.12r-write-freeze"\)/);

    const pg = source("server/db/postgres.ts");
    assert.match(pg, /SMARTPROFIT_DATA_DIR/);
    assert.match(pg, /SMARTPROFIT_TEST_PG/);

    assert.doesNotMatch(source(TEST), /from ["']pg["']/);
    assert.doesNotMatch(source(TEST), /from ["']@\/server\/db\/postgres/);
  });

  it("runtime writes stay in the temp store and do not change live data/", async () => {
    const isolated = (process.env.SMARTPROFIT_DATA_DIR || "").trim();
    assert.notEqual(isolated, "");
    assert.equal(jsonStoreDataDir(), isolated);
    assert.equal(isolated === LIVE_DATA || isolated.startsWith(LIVE_DATA + LIVE_SEP), false);
    assert.equal(writeFreezeFlagPath().startsWith(LIVE_DATA + LIVE_SEP), false);
    assert.equal(writeFreezeFlagPath().startsWith(isolated), true);
    assert.equal(isWriteFrozen(), false);
    const liveFreeze = join(LIVE_DATA, ".p14.12r-write-freeze");
    const liveFreezeExisted = existsSync(liveFreeze);
    const liveFreezeBefore = liveFreezeExisted ? readFileSync(liveFreeze, "utf8") : null;

    const before = fingerprintLiveData();

    engageWriteFreeze("isolation-probe");
    assert.equal(isWriteFrozen(), true);
    assert.equal(existsSync(writeFreezeFlagPath()), true);
    assert.equal(existsSync(liveFreeze), liveFreezeExisted);
    if (liveFreezeExisted && liveFreezeBefore !== null) {
      assert.equal(readFileSync(liveFreeze, "utf8"), liveFreezeBefore);
    }
    releaseWriteFreeze();
    assert.equal(isWriteFrozen(), false);
    assert.equal(existsSync(liveFreeze), liveFreezeExisted);
    if (liveFreezeExisted && liveFreezeBefore !== null) {
      assert.equal(readFileSync(liveFreeze, "utf8"), liveFreezeBefore);
    }

    await writeJsonFile("nac-demo.json", {});
    await writeDemoFlags("isolation-demo@test.local", { simSwapRecent: true });
    const flags = await readDemoFlags("isolation-demo@test.local");
    assert.equal(flags.simSwapRecent, true);
    assert.equal(existsSync(join(isolated, "nac-demo.json")), true);
    assert.doesNotMatch(readFileSync(join(isolated, "nac-demo.json"), "utf8"), /users\.json/);
    assert.equal(existsSync(join(isolated, "users.json")), false);
    assert.equal(existsSync(join(isolated, "events.json")), false);
    assert.equal(existsSync(join(isolated, "guard-decisions.json")), false);
    assert.equal(existsSync(join(LIVE_DATA, "users.json")), false);
    if (existsSync(join(LIVE_DATA, "nac-demo.json"))) {
      assert.doesNotMatch(readFileSync(join(LIVE_DATA, "nac-demo.json"), "utf8"), /isolation-demo@test\.local/);
    }

    const after = fingerprintLiveData();
    assert.deepEqual(after, before);
  });
});
