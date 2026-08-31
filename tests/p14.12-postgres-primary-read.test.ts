import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p14.12-postgres-primary-read.md";
const TEST = "tests/p14.12-postgres-primary-read.test.ts";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P14.12 PostgreSQL primary read — preflight NO-GO, no cutover", () => {
  it("ships the NO-GO document; does not claim cutover complete", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.equal(existsSync(join(ROOT, TEST)), true);
    assert.match(source(DOC), /Verdict: NO-GO/);
    assert.match(source(DOC), /No repository read-order change/);
    assert.doesNotMatch(source(DOC), /PostgreSQL-primary cutover complete/i);
    assert.equal(existsSync(join(ROOT, "docs/p14.13-json-retirement.md")), false);
  });

  it("P14.12 did not cut over; P14.18 owns PostgreSQL-only catalog storage", () => {
    const users = source("server/repositories/user.repository.ts");
    assert.match(users, /return requirePostgres\(await readAccountsPg\(\), "read accounts from the database"\);/);
    assert.doesNotMatch(users, /writeJsonFile|readJsonFile/);
    assert.match(
      source("server/repositories/workspace.repository.ts"),
      /requirePostgres\(await loadWorkspacePg\(email\), "read the workspace from the database"\)/,
    );
    const events = source("server/repositories/event.repository.ts");
    assert.match(events, /return requirePostgres\(await readEventsPg\(\), "read events from the database"\);/);
    assert.match(events, /\[randomUUID\(\), event\.at, JSON\.stringify\(event\)\]/);
    assert.match(source("server/repositories/guard-log.repository.ts"), /requirePostgres/);
  });

  it("handlers and BFF still do not import postgres or json-store", () => {
    assert.doesNotMatch(source("backend/src/http/workspace-get.ts"), /queryPostgres|from ["']pg["']/);
    assert.doesNotMatch(source("app/api/workspace/route.ts"), /queryPostgres|from ["']pg["']/);
  });

  it("this test does not connect to PostgreSQL or mutate data/", () => {
    const body = source(TEST);
    assert.doesNotMatch(body, /from ["']pg["']/);
    assert.doesNotMatch(body, /from ["']@\/server\/db\/postgres/);
    assert.doesNotMatch(source("tests/setup.ts"), /DATABASE_URL/);
  });
});
