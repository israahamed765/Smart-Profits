import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P16 Final Closure", () => {
  it("locks the close document and marker; does not start P17 or mutate schema", () => {
    assert.equal(existsSync(join(ROOT, "docs/p16.md")), true);
    assert.equal(existsSync(join(ROOT, "data/.p16-final-closure")), true);
    assert.equal(existsSync(join(ROOT, "docs/p17.md")), false);
    const marker = JSON.parse(source("data/.p16-final-closure")) as {
      status?: string;
      fullyClosed?: boolean;
      postgresMutated?: boolean;
    };
    assert.equal(marker.status, "GO");
    assert.equal(marker.fullyClosed, true);
    assert.equal(marker.postgresMutated, false);
    assert.match(source("docs/p16.md"), /source of truth/i);
    assert.match(source("docs/p16.md"), /205/);
    assert.match(source("docs/p16.md"), /001_current_schema\.sql/);
    assert.match(source("docs/p16.md"), /nac-demo\.json/);
    assert.match(source("package.json"), /tests\/p16-final-closure\.test\.ts/);
    const migrations = readdirSync(join(ROOT, "server/db/migrations")).filter((name) => name.endsWith(".sql"));
    assert.deepEqual(migrations, ["001_current_schema.sql"]);
    assert.doesNotMatch(source("server/db/migrations/001_current_schema.sql"), /FOREIGN KEY|REFERENCES /);
    assert.equal(existsSync(join(ROOT, "server/db/backfill-cli.ts")), false);
    assert.match(source("server/repositories/demo.repository.ts"), /nac-demo\.json/);
    assert.doesNotMatch(source("tests/p16-final-closure.test.ts"), /from ["']@\/server\/db\/postgres/);
    assert.doesNotMatch(source("tests/setup.ts"), /DATABASE_URL/);
  });
});
