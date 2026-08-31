import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyGuardDelete,
  classifyPhoneUnique,
  classifyWorkspaceDelete,
  decisionSqlIsReadOnly,
  summarizeGuardDeletes,
} from "@/server/db/p15.3-decision-gate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "docs/p15.3-decision-gate.md";
const CLI = "server/db/p15.3-decision-gate-cli.ts";
const MIGRATION_DIR = "server/db/migrations";

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P15.3 Decision Gate", () => {
  it("is SELECT-only; no P15.4, delete, FK, UNIQUE, or migration 002", () => {
    assert.equal(existsSync(join(ROOT, DOC)), true);
    assert.match(source("package.json"), /"db:p15.3-decision-gate":/);
    assert.match(source("package.json"), /tests\/p15\.3-decision-gate\.test\.ts/);
    assert.equal(decisionSqlIsReadOnly(), true);
    const cli = source(CLI);
    assert.match(cli, /runDecisionGate/);
    assert.doesNotMatch(cli, /INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE TABLE|CREATE INDEX/);
    assert.doesNotMatch(cli, /db:backfill|db:reconcile|runBackfill|upsertAccount/);
    const migrations = readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "docs/p15.md")), false);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-orphan-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.3-workspace-delete.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p15.4.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.doesNotMatch(source("lib/financial-engine/core/engine.ts"), /queryPostgres/);
    assert.doesNotMatch(source("lib/smart-guard/policy.ts"), /queryPostgres/);
    assert.doesNotMatch(source("middleware.ts"), /queryPostgres|requirePostgres/);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
  });

  it("classifies workspace and p125 deletes without applying them", () => {
    const alice = classifyWorkspaceDelete({
      email: "p12.2-alice@test.com",
      workspaceRows: 1,
      hasMerchant: false,
      trackEvents: 0,
      guardRows: 0,
    });
    assert.equal(alice.verdict, "SAFE TO DELETE");
    const blocked = classifyWorkspaceDelete({
      email: "p12.2-alice@test.com",
      workspaceRows: 1,
      hasMerchant: true,
      trackEvents: 0,
      guardRows: 0,
    });
    assert.equal(blocked.verdict, "BLOCKED");
    const review = classifyWorkspaceDelete({
      email: "p12.2-bob@test.com",
      workspaceRows: 1,
      hasMerchant: false,
      trackEvents: 3,
      guardRows: 0,
    });
    assert.equal(review.verdict, "NEEDS REVIEW");
    const harness = classifyGuardDelete({
      email: "p125-1@test.com",
      n: 2,
      hasMerchant: false,
      trackEvents: 0,
    });
    assert.equal(harness.verdict, "SAFE TO DELETE");
    const live = classifyGuardDelete({
      email: "p125-1@test.com",
      n: 2,
      hasMerchant: true,
      trackEvents: 0,
    });
    assert.equal(live.verdict, "BLOCKED");
    const summary = summarizeGuardDeletes([
      {
        email: "p125-1@test.com",
        n: 52,
        firstAt: null,
        lastAt: null,
        decisions: ["allow"],
        hasMerchant: false,
        trackEvents: 0,
        harness: true,
        verdict: "SAFE TO DELETE",
        reason: "fixture",
      },
    ]);
    assert.equal(summary.verdict, "SAFE TO DELETE");
    assert.equal(summary.rows, 52);
    assert.equal(summary.noMerchantRows, 52);
  });

  it("scans every merchant phone; UNIQUE is blocked by raw duplicates and allowed only when E.164 is unique", () => {
    const dup = classifyPhoneUnique([
      { email: "a@store.test", phone: "+970599000001" },
      { email: "b@store.test", phone: "+970599000001" },
    ]);
    assert.equal(dup.verdict, "BLOCKED");
    assert.equal(dup.rawDuplicateGroups, 1);
    const emptyDup = classifyPhoneUnique([
      { email: "a@store.test", phone: "" },
      { email: "b@store.test", phone: "" },
    ]);
    assert.equal(emptyDup.verdict, "BLOCKED");
    const normDup = classifyPhoneUnique([
      { email: "a@store.test", phone: "+970599000001" },
      { email: "b@store.test", phone: "0599000001" },
    ]);
    assert.equal(normDup.verdict, "NEEDS REVIEW");
    const ok = classifyPhoneUnique([
      { email: "a@store.test", phone: "+970599000001" },
      { email: "b@store.test", phone: "+970599000002" },
      { email: "c@store.test", phone: null },
    ]);
    assert.equal(ok.verdict, "SAFE FOR CONSTRAINT");
    assert.equal(ok.merchantCount, 3);
    assert.equal(ok.nullCount, 1);
    assert.equal(ok.uniqueValidE164, 2);
  });
});
