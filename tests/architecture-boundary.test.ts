import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "data") continue;
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function isClientModule(file: string) {
  return /["']use client["']/.test(readFileSync(file, "utf8"));
}

function resolveLocal(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    const rest = spec.slice(2);
    const aliases: [string, string][] = [
      ["components/", "frontend/components/"],
      ["context/", "frontend/context/"],
    ];
    let mapped = rest;
    for (const [from, to] of aliases) {
      if (rest.startsWith(from)) {
        mapped = to + rest.slice(from.length);
        break;
      }
    }
    spec = join(ROOT, mapped);
  } else if (spec.startsWith(".")) {
    spec = join(dirname(fromFile), spec);
  } else {
    return null;
  }
  const candidates = [
    spec,
    `${spec}.ts`,
    `${spec}.tsx`,
    join(spec, "index.ts"),
    join(spec, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function localImportSpecs(text: string): string[] {
  const specs: string[] = [];
  const re = /from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    specs.push(match[1]);
  }
  return specs;
}

describe("P9 architecture boundaries", () => {
  it("Client modules do not import server, database, or Node ingest", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    const clientFiles = files.filter(isClientModule);
    assert.ok(clientFiles.length > 40);
    const leak =
      /@\/server\/|@\/lib\/server\/|@\/lib\/db\/|from\s+["']xlsx["']|from\s+["']unpdf["']|from\s+["']tesseract(?:\.js)?["']|from\s+["']pg["']|from\s+["']nodemailer["']|node:fs|node:crypto/;
    for (const file of clientFiles) {
      const text = readFileSync(file, "utf8");
      assert.equal(leak.test(text), false, `client leak in ${relative(ROOT, file)}`);
    }
  });

  it("Client modules do not read secrets via process.env", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    const secret = /process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_PASS|MAIL_USER)/;
    for (const file of files.filter(isClientModule)) {
      const text = readFileSync(file, "utf8");
      assert.equal(secret.test(text), false, `secret env in ${relative(ROOT, file)}`);
    }
  });

  it("Server modules do not import UI components or Tailwind cn", () => {
    const files = walkTsFiles(join(ROOT, "server"));
    const ui = /@\/components\/|@\/lib\/ui\/|from\s+["']framer-motion["']/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(ui.test(text), false, `server → UI in ${relative(ROOT, file)}`);
    }
  });

  it("shared/ does not import server, React, Next, or Node I/O", () => {
    const files = walkTsFiles(join(ROOT, "shared"));
    assert.ok(files.length > 5);
    const forbidden =
      /@\/server\/|@\/app\/|@\/components\/|from\s+["']react["']|from\s+["']react-dom["']|from\s+["']next\/|from\s+["']pg["']|from\s+["']nodemailer["']|from\s+["']xlsx["']|from\s+["']unpdf["']|node:fs|node:crypto|process\.env/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(forbidden.test(text), false, `shared leak in ${relative(ROOT, file)}`);
    }
  });

  it("unused server re-export shims stay empty (no Client landmines)", () => {
    const stubs = [
      "lib/db/postgres.ts",
      "lib/server/json-store.ts",
      "lib/server/workspaces.ts",
      "lib/server/events.ts",
      "lib/server/accounts.ts",
      "lib/server/request-meta.ts",
      "lib/server/send-password-email.ts",
      "lib/parser.ts",
      "lib/engine-upload.ts",
    ];
    for (const rel of stubs) {
      const text = source(rel);
      assert.match(text, /export \{\}/, `${rel} must be an empty stub`);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//);
    }
  });

  it("evaluate route still fail-closes to freeze", () => {
    const text = source("backend/src/http/guard-evaluate.ts");
    assert.match(text, /blocking action/);
    assert.match(text, /failClosedVerdict/);
    const closed = source("server/smart-guard/fail-closed.ts");
    assert.match(closed, /check_failed/);
    assert.match(closed, /decision:\s*"freeze"/);
    const next = source("app/api/smart-guard/evaluate/route.ts");
    assert.match(next, /guard-evaluate/);
  });

  it("Phase 2b Guard enforcement is server-side on sensitive routes", () => {
    for (const rel of [
      "backend/src/http/auth-login.ts",
      "backend/src/http/auth-register.ts",
      "backend/src/http/auth-reset.ts",
      "backend/src/http/analyze-post.ts",
      "backend/src/http/reports-export-post.ts",
    ]) {
      assert.match(source(rel), /requireGuardAllow/, rel);
    }
    const run = source("server/smart-guard/run.ts");
    assert.doesNotMatch(run, /catch\s*\{[\s\S]*account = null/);
    assert.match(source("server/smart-guard/network-code.ts"), /allowSimulatorDemoCode/);
    assert.match(source("server/smart-guard/nac-env.ts"), /NAC_API_KEY is required in production/);
    assert.doesNotMatch(source("app/login/page.tsx"), /toast\.success\(t\("auth\.loggedIn"\)\);[\s\S]*router\.push\("\/dashboard"\);[\s\S]*\} catch/);
  });

  it("detects no circular local imports among project TypeScript files", () => {
    const roots = ["app", "frontend", "components", "context", "lib", "server", "shared", "tests", "backend"];
    const files = roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const deps = localImportSpecs(text)
        .map((spec) => resolveLocal(file, spec))
        .filter((resolved): resolved is string => Boolean(resolved));
      graph.set(file, deps);
    }

    const visiting = new Set<string>();
    const seen = new Set<string>();
    const stack: string[] = [];

    function visit(node: string): string[] | null {
      if (seen.has(node)) return null;
      if (visiting.has(node)) {
        const start = stack.indexOf(node);
        return [...stack.slice(start), node].map((file) => relative(ROOT, file));
      }
      visiting.add(node);
      stack.push(node);
      for (const next of graph.get(node) ?? []) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
      stack.pop();
      visiting.delete(node);
      seen.add(node);
      return null;
    }

    for (const file of files) {
      const cycle = visit(file);
      assert.equal(cycle, null, cycle ? `circular import: ${cycle.join(" → ")}` : "");
    }
  });

  it("shared math is the numeric source of truth for the financial core", () => {
    const analytics = source("lib/financial-engine/core/analytics.ts");
    assert.match(analytics, /@\/shared\/constants\/math/);
    assert.doesNotMatch(analytics, /@\/lib\/utils/);
  });
});

describe("P10 physical-split readiness", () => {
  const coreFiles = () => walkTsFiles(join(ROOT, "lib/financial-engine/core"));

  it("Client cannot reach server, database, repositories, secrets, or Node ingest", () => {
    const files = ["app", "frontend", "components", "context"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    const leak =
      /@\/server\/|@\/lib\/server\/|@\/lib\/db\/|@\/server\/repositories\/|@\/server\/db\/|@\/server\/storage\/|from\s+["']xlsx["']|from\s+["']unpdf["']|from\s+["']tesseract(?:\.js)?["']|from\s+["']pg["']|from\s+["']nodemailer["']|node:fs|process\.env\.(SESSION_SECRET|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|ADMIN_PASSWORD)/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("shared cannot import server, database, React, or Next server APIs", () => {
    const files = walkTsFiles(join(ROOT, "shared"));
    const leak =
      /@\/server\/|@\/lib\/db\/|from\s+["']react["']|from\s+["']next\/headers["']|from\s+["']next\/server["']|cookies\(|from\s+["']pg["']/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("server cannot import UI components, Tailwind cn, or browser-only packages", () => {
    const files = walkTsFiles(join(ROOT, "server"));
    const leak = /@\/components\/|@\/lib\/ui\/|from\s+["']framer-motion["']|from\s+["']recharts["']|from\s+["']react-dropzone["']/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("financial core does not import UI format, parser, database, or secrets", () => {
    const leak =
      /@\/lib\/format["']|@\/server\/financial-engine\/parser|@\/lib\/parser|@\/server\/db\/|@\/server\/storage\/|@\/server\/repositories\/|process\.env|from\s+["']xlsx["']|import\(["']xlsx["']\)/;
    for (const file of coreFiles()) {
      const text = readFileSync(file, "utf8");
      assert.equal(leak.test(text), false, relative(ROOT, file));
    }
  });

  it("financial core uses shared calendar keys, not lib/format", () => {
    const analytics = source("lib/financial-engine/core/analytics.ts");
    const forecast = source("lib/financial-engine/core/forecast.ts");
    const scope = source("lib/financial-engine/core/scope.ts");
    for (const text of [analytics, forecast, scope]) {
      assert.match(text, /@\/shared\/constants\/calendar/);
      assert.doesNotMatch(text, /@\/lib\/format/);
    }
  });

  it("workspace repository does not import the browser tenant module", () => {
    const text = source("server/repositories/workspace.repository.ts");
    assert.match(text, /@\/shared\/identity/);
    assert.doesNotMatch(text, /@\/lib\/tenant/);
  });

  it("no Client-reachable barrel re-exports server modules", () => {
    const barrels = [
      "lib/utils.ts",
      "lib/smart-guard/index.ts",
      "lib/engine.ts",
      "lib/analytics.ts",
      "lib/types.ts",
      "lib/serialize.ts",
    ];
    for (const rel of barrels) {
      const text = source(rel);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//);
      assert.doesNotMatch(text, /from ["']@\/server\/db/);
    }
  });
});

describe("P11 final boundary hardening", () => {
  it("fails if any Client module imports Server", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /from ["']@\/server\//, relative(ROOT, file));
      assert.doesNotMatch(text, /from ["']@\/lib\/server\//, relative(ROOT, file));
    }
  });

  it("fails if shared imports Server", () => {
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /from ["']@\/server\//, relative(ROOT, file));
    }
  });

  it("API routes do not import database adapters or repositories", () => {
    const routes = walkTsFiles(join(ROOT, "app/api"));
    assert.ok(routes.length > 10);
    const leak = /from ["']@\/server\/(db|storage|repositories)\//;
    for (const file of routes) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("Client cannot import parser, OCR, or engine-upload stubs", () => {
    const files = ["app", "frontend", "components", "context"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    const leak = /@\/lib\/parser["']|@\/lib\/engine-upload["']|@\/lib\/pdf-extract["']|@\/lib\/ocr["']|@\/server\/financial-engine\/parser/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("admin.service does not import localStorage metrics module", () => {
    const text = source("server/services/admin.service.ts");
    assert.match(text, /@\/lib\/admin\/types/);
    assert.doesNotMatch(text, /@\/lib\/admin\/metrics/);
  });

  it("POST /api/reports/export proxies to secured backend handler", () => {
    const handler = source("backend/src/http/reports-export-post.ts");
    assert.match(handler, /requireGuardAllow/);
    assert.match(handler, /report_export/);
    assert.match(handler, /buildSecuredMonthlyReport/);
    assert.doesNotMatch(handler, /@\/server\/repositories\//);
    const route = source("app/api/reports/export/route.ts");
    assert.match(route, /reports-export-post/);
    const client = source("frontend/lib/export-report.ts");
    assert.match(client, /\/api\/reports\/export/);
    assert.doesNotMatch(client, /buildMonthlyReportHtml|analyzeParsed|buildAdvisorReport/);
  });

  it("POST /api/analyze uses financial-engine core and shared types, not parser", () => {
    const handler = source("backend/src/http/analyze-post.ts");
    assert.match(handler, /@\/lib\/financial-engine\/core/);
    assert.match(handler, /@\/shared\/types\/financial/);
    assert.doesNotMatch(handler, /@\/lib\/parser/);
    assert.doesNotMatch(handler, /@\/server\/db/);
    const route = source("app/api/analyze/route.ts");
    assert.match(route, /analyze-post/);
    assert.doesNotMatch(route, /@\/lib\/parser/);
  });

  it("financial core cannot import parser, OCR, or database adapters", () => {
    const leak =
      /@\/server\/financial-engine\/parser|@\/lib\/parser|@\/server\/db\/|@\/server\/storage\/|@\/server\/repositories\/|from\s+["']xlsx["']|from\s+["']unpdf["']|from\s+["']tesseract(?:\.js)?["']|from\s+["']pg["']/;
    for (const file of walkTsFiles(join(ROOT, "lib/financial-engine/core"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("server cannot import UI components or browser-only packages", () => {
    const leak = /@\/components\/|@\/lib\/ui\/|from\s+["']framer-motion["']|from\s+["']recharts["']|from\s+["']react-dropzone["']/;
    for (const file of walkTsFiles(join(ROOT, "server"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("secrets cannot reach Client modules", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    const secret = /process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|ADMIN_EMAIL|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_PASS|MAIL_USER)/;
    for (const file of files) {
      assert.equal(secret.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });

  it("parser and ingest packages cannot be imported by Client", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    const leak =
      /@\/server\/financial-engine\/parser|@\/lib\/parser["']|@\/lib\/engine-upload["']|@\/lib\/pdf-extract["']|@\/lib\/ocr["']|from\s+["']xlsx["']|from\s+["']unpdf["']|from\s+["']tesseract(?:\.js)?["']/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, relative(ROOT, file));
    }
  });
});

function posixRel(file: string) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

describe("P12.1 physical-split preparation", () => {
  const backendLeak =
    /from ["']@\/server\/|from ["']@\/lib\/server\/|from ["']@\/lib\/db\/|from ["']@\/server\/(db|storage|repositories)\//;
  const secretEnv =
    /process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|ADMIN_EMAIL|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_PASS|MAIL_USER)|NEXT_PUBLIC_(SESSION_SECRET|ADMIN_PASSWORD|DATABASE_URL|NAC_API_KEY|MAIL_APP_PASSWORD)/;

  it("UI pages, components, and context cannot import backend internals", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "components")),
      ...walkTsFiles(join(ROOT, "context")),
    ];
    assert.ok(files.length > 20);
    for (const file of files) {
      assert.equal(backendLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("Client cannot import database adapters or repositories", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    const leak = /@\/server\/(db|storage|repositories)\/|from ["']@\/lib\/db\/|from ["']pg["']/;
    for (const file of files) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("Client cannot import secrets or NEXT_PUBLIC_ secret names", () => {
    const files = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    for (const file of files) {
      assert.equal(secretEnv.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("shared cannot import backend, database, or React", () => {
    const leak =
      /from ["']@\/server\/|from ["']@\/lib\/db\/|from ["']react["']|from ["']react-dom["']|from ["']next\/|from ["']pg["']|from ["']nodemailer["']|node:fs|process\.env|localStorage\.(get|set|remove)/;
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend cannot import Frontend UI", () => {
    const leak = /from ["']@\/components\/|from ["']@\/frontend\/|from ["']@\/lib\/ui\/|from ["']framer-motion["']|from ["']recharts["']|from ["']react-dropzone["']/;
    for (const file of walkTsFiles(join(ROOT, "server"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("financial core cannot import parser or database", () => {
    const leak =
      /@\/server\/financial-engine\/parser|@\/lib\/parser|@\/server\/db\/|@\/server\/storage\/|@\/server\/repositories\/|from ["']xlsx["']|from ["']pg["']/;
    for (const file of walkTsFiles(join(ROOT, "lib/financial-engine/core"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("API routes cannot import repositories or database adapters", () => {
    const leak = /from ["']@\/server\/(db|storage|repositories)\//;
    for (const file of walkTsFiles(join(ROOT, "app/api"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("product APIs go through services; exceptions are frozen", () => {
    const exempt = new Set(["app/api/smart-guard/step-up/route.ts"]);
    const routes = walkTsFiles(join(ROOT, "app/api"));
    const foundExempt = new Set<string>();
    for (const file of routes) {
      const rel = posixRel(file);
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /from ["']@\/server\/(db|storage|repositories)\//, rel);
      if (exempt.has(rel)) {
        foundExempt.add(rel);
        continue;
      }
      if (
        rel === "app/api/workspace/route.ts" ||
        rel === "app/api/track/route.ts" ||
        rel === "app/api/analyze/route.ts" ||
        rel === "app/api/reports/export/route.ts" ||
        rel === "app/api/auth/login/route.ts" ||
        rel === "app/api/auth/me/route.ts" ||
        rel === "app/api/auth/logout/route.ts" ||
        rel === "app/api/auth/register/route.ts" ||
        rel === "app/api/auth/profile/route.ts" ||
        rel === "app/api/auth/forgot-password/route.ts" ||
        rel === "app/api/auth/reset-password/route.ts" ||
        rel === "app/api/admin/login/route.ts" ||
        rel === "app/api/admin/me/route.ts" ||
        rel === "app/api/admin/logout/route.ts" ||
        rel === "app/api/admin/snapshot/route.ts" ||
        rel === "app/api/admin/users/route.ts" ||
        rel === "app/api/smart-guard/evaluate/route.ts" ||
        rel === "app/api/smart-guard/logs/route.ts" ||
        rel === "app/api/smart-guard/demo/route.ts" ||
        rel === "app/api/smart-guard/step-up/send/route.ts" ||
        rel === "app/api/smart-guard/step-up/verify/route.ts" ||
        rel === "app/api/nac/route.ts" ||
        rel === "app/api/nac/mock/gate/route.ts" ||
        rel === "app/api/nac/sim-swap/v1/check/route.ts" ||
        rel === "app/api/nac/sim-swap/v1/retrieve-date/route.ts" ||
        rel === "app/api/nac/device-swap/v1/check/route.ts" ||
        rel === "app/api/nac/device-swap/v1/retrieve-date/route.ts" ||
        rel === "app/api/nac/number-verification/v1/verify/route.ts" ||
        rel === "app/api/nac/location-verification/v1/verify/route.ts"
      ) {
        assert.match(text, /@\/backend\/src\/http\//, `${rel} must delegate to the backend handler`);
        continue;
      }
      assert.match(text, /@\/server\/services\//, `${rel} must import a service (or be added to the documented P12.1 exception list)`);
    }
    assert.equal(foundExempt.size, exempt.size, "P12.1 service exceptions must stay the documented set");
  });

  it("no NEXT_PUBLIC_ secret exists in project TypeScript", () => {
    const roots = ["app", "frontend", "components", "context", "lib", "server", "shared", "backend"];
    const leak = /NEXT_PUBLIC_(SESSION_SECRET|ADMIN_PASSWORD|ADMIN_EMAIL|DATABASE_URL|NAC_API_KEY|MAIL_APP_PASSWORD|MAIL_USER|MAIL_PASS)/;
    for (const file of roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("cookie names and httpOnly stay merchant sp_session and admin sp_admin", () => {
    const core = source("server/crypto/session-core.ts");
    const cookies = source("server/crypto/session.ts");
    assert.match(core, /MERCHANT_COOKIE = "sp_session"/);
    assert.match(core, /ADMIN_COOKIE = "sp_admin"/);
    assert.match(core, /httpOnly:\s*true/);
    assert.match(core, /sameSite:\s*"lax"/);
    assert.match(core, /serializeSessionCookie/);
    assert.doesNotMatch(core, /Domain=/);
    assert.match(cookies, /from "\.\/session-core"/);
  });

  it("does not introduce duplicate frontend/ or backend/ source trees", () => {
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "backend/api")), false);
    assert.equal(existsSync(join(ROOT, "backend/services")), false);
  });
});

describe("P12.2 backend vertical slice boundaries", () => {
  it("React UI cannot import backend internals", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "components")),
      ...walkTsFiles(join(ROOT, "context")),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /from ["']@\/backend\//, posixRel(file));
      assert.doesNotMatch(text, /from ["']@\/server\/(db|storage|repositories)\//, posixRel(file));
    }
  });

  it("backend cannot import React, Next UI, or browser-only modules", () => {
    const leak =
      /from ["']react["']|from ["']react-dom["']|from ["']next\/server["']|from ["']@\/components\/|from ["']@\/frontend\/|from ["']@\/app\/\(|localStorage\.(get|set|remove)/;
    for (const file of walkTsFiles(join(ROOT, "backend"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("shared cannot import backend internals or database adapters", () => {
    const leak = /from ["']@\/backend\/|from ["']@\/server\/(db|storage|repositories)\//;
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend GET /api/workspace goes through the service re-export, not repositories", () => {
    const text = source("backend/src/http/workspace-get.ts");
    assert.match(text, /from "\.\.\/services\/workspace"/);
    assert.doesNotMatch(text, /from ["']@\/server\/repositories\//);
    assert.doesNotMatch(text, /from ["']\.\.\/repositories\//);
    assert.doesNotMatch(text, /from ["']@\/server\/db\//);
    assert.doesNotMatch(text, /json-store/);
  });

  it("standalone backend does not copy postgres, json-store, or session HMAC", () => {
    const postgres = source("backend/src/storage/postgres.ts");
    const json = source("backend/src/storage/json-store.ts");
    const auth = source("backend/src/services/auth.ts");
    const admin = source("backend/src/services/admin.ts");
    assert.match(postgres, /@\/server\/db\/postgres/);
    assert.match(json, /@\/server\/storage\/json-store/);
    assert.match(auth, /@\/server\/services\/auth\.service/);
    assert.match(admin, /@\/server\/services\/admin\.service/);
    assert.doesNotMatch(postgres, /new Pool/);
    assert.doesNotMatch(json, /process\.cwd\(\)/);
    assert.doesNotMatch(auth, /scrypt|createMerchantToken|encodeSession/);
    assert.doesNotMatch(admin, /timingSafeEqual|ADMIN_PASSWORD|readAccounts/);
  });

  it("backend CORS never uses a wildcard origin", () => {
    const text = source("backend/src/http/cors.ts");
    assert.match(text, /isAllowedFrontendOrigin/);
    assert.match(text, /Access-Control-Allow-Credentials/);
    assert.doesNotMatch(text, /Allow-Origin", "\*"/);
    assert.doesNotMatch(text, /Allow-Origin',\s*'\*'/);
  });

  it("migrated backend handlers go through services, not repositories or adapters", () => {
    const files = [
      "backend/src/http/workspace-get.ts",
      "backend/src/http/workspace-post.ts",
      "backend/src/http/track-post.ts",
      "backend/src/http/analyze-post.ts",
      "backend/src/http/reports-export-post.ts",
      "backend/src/http/auth-login.ts",
      "backend/src/http/auth-me.ts",
      "backend/src/http/auth-register.ts",
      "backend/src/http/auth-profile.ts",
      "backend/src/http/auth-forgot.ts",
      "backend/src/http/auth-reset.ts",
      "backend/src/http/admin-login.ts",
      "backend/src/http/admin-snapshot.ts",
      "backend/src/http/admin-users.ts",
      "backend/src/http/guard-evaluate.ts",
      "backend/src/http/guard-logs.ts",
      "backend/src/http/guard-demo.ts",
      "backend/src/http/guard-stepup-send.ts",
      "backend/src/http/guard-stepup-verify.ts",
      "backend/src/http/nac-catalog.ts",
      "backend/src/http/nac-mock-gate.ts",
      "backend/src/http/nac-sim-swap-check.ts",
      "backend/src/http/nac-sim-swap-date.ts",
      "backend/src/http/nac-device-swap-check.ts",
      "backend/src/http/nac-device-swap-date.ts",
      "backend/src/http/nac-number-verify.ts",
      "backend/src/http/nac-location-verify.ts",
    ];
    for (const rel of files) {
      const text = source(rel);
      assert.match(text, /from "\.\.\/services\//, rel);
      assert.doesNotMatch(text, /from ["']@\/server\/repositories\//, rel);
      assert.doesNotMatch(text, /from ["']@\/server\/db\//, rel);
      assert.doesNotMatch(text, /from ["']@\/server\/storage\//, rel);
    }
    const logout = source("backend/src/http/auth-logout.ts");
    assert.match(logout, /clearMerchantSessionCookie/);
    assert.doesNotMatch(logout, /encodeSession|createMerchantToken/);
    assert.doesNotMatch(logout, /from ["']@\/server\/repositories\//);
    const adminLogout = source("backend/src/http/admin-logout.ts");
    assert.match(adminLogout, /clearAdminSessionCookie/);
    assert.doesNotMatch(adminLogout, /clearMerchantSessionCookie/);
    assert.doesNotMatch(adminLogout, /from ["']@\/server\/repositories\//);
    const adminMe = source("backend/src/http/admin-me.ts");
    assert.match(adminMe, /requireAdmin/);
    assert.doesNotMatch(adminMe, /from ["']@\/server\/repositories\//);
    assert.doesNotMatch(adminMe, /body\.email/);
    const guard = source("backend/src/services/guard.ts");
    assert.match(guard, /@\/server\/services\/guard\.service/);
    assert.doesNotMatch(guard, /createNetworkChallenge|runSmartGuard|findAccount/);
    const nac = source("backend/src/services/nac.ts");
    assert.match(nac, /@\/server\/services\/nac\.service/);
    assert.doesNotMatch(nac, /NAC_API_KEY|livePost|X-RapidAPI-Key/);
  });

  it("browser API client has no secrets and does not hard-code the backend host", () => {
    const client = source("frontend/lib/api/client.ts");
    assert.match(client, /NEXT_PUBLIC_API_BASE_URL/);
    assert.match(client, /credentials: "include"/);
    assert.doesNotMatch(client, /SESSION_SECRET|DATABASE_URL|ADMIN_PASSWORD|NAC_API_KEY|MAIL_APP_PASSWORD/);
    assert.doesNotMatch(client, /127\.0\.0\.1:4000/);
    const ui = ["app", "frontend", "components", "context", "lib"].flatMap((dir) => walkTsFiles(join(ROOT, dir))).filter(isClientModule);
    for (const file of ui) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /fetch\(\s*["']https?:\/\/127\.0\.0\.1:4000/, posixRel(file));
      assert.doesNotMatch(text, /fetch\(\s*["']https?:\/\/localhost:4000/, posixRel(file));
    }
  });
});

describe("P12.5 Smart Guard / Step-Up boundaries", () => {
  it("Client and shared cannot import Smart Guard server, repositories, or secrets", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "components")),
      ...walkTsFiles(join(ROOT, "context")),
      ...walkTsFiles(join(ROOT, "lib")),
      ...walkTsFiles(join(ROOT, "shared")),
    ];
    const leak =
      /from ["']@\/server\/smart-guard|from ["']@\/server\/repositories\/|from ["']@\/server\/db\/|from ["']@\/server\/storage\/|from ["']pg["']|createNetworkChallenge|verifyNetworkChallenge|process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|NAC_API_KEY|DATABASE_URL)/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/export \{\}/.test(text) && text.trim().startsWith("export {}")) continue;
      assert.equal(leak.test(text), false, posixRel(file));
    }
  });

  it("browser Smart Guard client uses apiFetch and stays free of server-only modules", () => {
    const client = source("frontend/lib/smart-guard/client.ts");
    assert.match(client, /from ["']@\/frontend\/lib\/api\/client["']/);
    assert.match(client, /apiFetch\("\/api\/smart-guard\/evaluate"/);
    assert.match(client, /apiFetch\("\/api\/smart-guard\/step-up\/send"/);
    assert.match(client, /apiFetch\("\/api\/smart-guard\/step-up\/verify"/);
    assert.doesNotMatch(client, /from ["']@\/server\//);
    assert.doesNotMatch(client, /SESSION_SECRET|NAC_API_KEY|node:fs|createNetworkChallenge/);
    const demo = source("frontend/components/guard/smart-guard-demo-panel.tsx");
    const logs = source("frontend/components/guard/smart-guard-log-panel.tsx");
    assert.match(demo, /apiFetch\("\/api\/smart-guard\/demo"/);
    assert.match(logs, /apiFetch\("\/api\/smart-guard\/logs/);
  });

  it("backend Guard handlers do not import React, Next UI, or NAC HTTP routes", () => {
    const leak =
      /from ["']react["']|from ["']react-dom["']|from ["']next\/server["']|from ["']@\/components\/|from ["']@\/frontend\/|from ["']@\/app\//;
    for (const rel of [
      "backend/src/http/guard-evaluate.ts",
      "backend/src/http/guard-logs.ts",
      "backend/src/http/guard-demo.ts",
      "backend/src/http/guard-stepup-send.ts",
      "backend/src/http/guard-stepup-verify.ts",
      "backend/src/services/guard.ts",
    ]) {
      assert.equal(leak.test(source(rel)), false, rel);
    }
    const dispatch = source("backend/src/http/dispatch.ts");
    assert.match(dispatch, /\/api\/smart-guard\/evaluate/);
    assert.match(dispatch, /\/api\/smart-guard\/step-up\/send/);
    assert.match(dispatch, /\/api\/nac/);
  });

  it("lib barrels still do not re-export server Smart Guard", () => {
    for (const rel of ["lib/smart-guard/index.ts", "lib/engine.ts", "lib/utils.ts"]) {
      const text = source(rel);
      assert.doesNotMatch(text, /@\/server\/smart-guard/);
      assert.doesNotMatch(text, /@\/server\/services\/guard/);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//);
    }
  });
});

describe("P12.6 NAC boundaries", () => {
  it("Client, shared, and UI cannot import NAC server modules or secrets", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "components")),
      ...walkTsFiles(join(ROOT, "context")),
      ...walkTsFiles(join(ROOT, "lib")),
      ...walkTsFiles(join(ROOT, "shared")),
    ];
    const leak =
      /from ["']@\/server\/smart-guard\/nac-|from ["']@\/server\/smart-guard\/nokia-mock|from ["']@\/server\/smart-guard\/nac-simulator|from ["']@\/server\/smart-guard\/nac-env|from ["']@\/server\/smart-guard\/nac-client|process\.env\.(NAC_API_KEY|NAC_BASE_URL|NAC_RAPIDAPI_HOST)|NEXT_PUBLIC_NAC_/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/export \{\}/.test(text) && !/from ["']@\/server\//.test(text)) continue;
      assert.equal(leak.test(text), false, posixRel(file));
    }
  });

  it("lib NAC stubs stay empty and do not re-export server implementation", () => {
    for (const rel of [
      "lib/smart-guard/nac-client.ts",
      "lib/smart-guard/nac-simulator.ts",
      "lib/smart-guard/nokia-mock.ts",
    ]) {
      const text = source(rel);
      assert.match(text, /export \{\}/);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//);
      assert.doesNotMatch(text, /process\.env\.NAC_API_KEY/);
    }
  });

  it("backend NAC handlers stay free of React and live RapidAPI secrets", () => {
    const leak =
      /from ["']react["']|from ["']react-dom["']|from ["']next\/server["']|from ["']@\/components\/|NAC_API_KEY|X-RapidAPI-Key|nac-env/;
    for (const rel of [
      "backend/src/http/nac-catalog.ts",
      "backend/src/http/nac-mock-gate.ts",
      "backend/src/http/nac-sim-swap-check.ts",
      "backend/src/http/nac-sim-swap-date.ts",
      "backend/src/http/nac-device-swap-check.ts",
      "backend/src/http/nac-device-swap-date.ts",
      "backend/src/http/nac-number-verify.ts",
      "backend/src/http/nac-location-verify.ts",
      "backend/src/services/nac.ts",
    ]) {
      assert.equal(leak.test(source(rel)), false, rel);
    }
    const env = source("server/smart-guard/nac-env.ts");
    assert.match(env, /process\.env\.NAC_API_KEY/);
    assert.match(env, /process\.env\.NAC_BASE_URL/);
  });
});

describe("P13.1 frontend physical-split preparation", () => {
  const frontendLeak =
    /from ["']@\/backend\/|from ["']@\/server\/|from ["']@\/lib\/server\/|from ["']@\/lib\/db\/|from ["']@\/server\/(db|storage|repositories)\/|from ["']pg["']|from ["']nodemailer["']|from ["']xlsx["']|from ["']unpdf["']|from ["']tesseract(?:\.js)?["']|node:fs|process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_USER|MAIL_PASS)/;

  const clientLibFiles = [
    "frontend/lib/api/client.ts",
    "frontend/lib/i18n.ts",
    "frontend/ui/cn.ts",
    "frontend/lib/tenant.ts",
    "frontend/lib/format.ts",
    "frontend/lib/smart-guard/client.ts",
    "frontend/lib/admin/track.ts",
    "frontend/lib/admin/metrics.ts",
    "lib/admin/config.ts",
    "frontend/lib/qa.ts",
    "frontend/lib/financial-agent.ts",
    "frontend/lib/export-report.ts",
  ];

  it("does not introduce a second Next app under frontend/", () => {
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "frontend/package.json")), false);
    assert.equal(existsSync(join(ROOT, "frontend/middleware.ts")), false);
  });

  it("UI pages, components, context, and optional frontend/ cannot import backend or server-only modules", () => {
    const dirs = ["components", "context"];
    if (existsSync(join(ROOT, "hooks"))) dirs.push("hooks");
    if (existsSync(join(ROOT, "frontend"))) dirs.push("frontend");
    const files = [
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
      ...dirs.flatMap((dir) => walkTsFiles(join(ROOT, dir))),
    ];
    assert.ok(files.length > 40);
    for (const file of files) {
      assert.equal(frontendLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("client-owned lib modules cannot import server, backend, db, or secrets", () => {
    for (const rel of clientLibFiles) {
      const text = source(rel);
      assert.equal(frontendLeak.test(text), false, rel);
      assert.doesNotMatch(text, /NEXT_PUBLIC_(SESSION_SECRET|ADMIN_PASSWORD|DATABASE_URL|NAC_API_KEY)/, rel);
    }
  });

  it("shared cannot import backend, server-only modules, or React", () => {
    const leak =
      /from ["']@\/backend\/|from ["']@\/server\/|from ["']@\/components\/|from ["']@\/frontend\/|from ["']react["']|from ["']next\/|from ["']pg["']|node:fs|process\.env/;
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend cannot import Frontend UI", () => {
    const leak =
      /from ["']react["']|from ["']react-dom["']|from ["']next\/server["']|from ["']@\/components\/|from ["']@\/frontend\/|from ["']@\/lib\/ui\/|from ["']framer-motion["']|from ["']recharts["']/;
    for (const file of walkTsFiles(join(ROOT, "backend"))) {
      assert.equal(leak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("empty server landmine stubs stay empty and out of any frontend tree", () => {
    const stubs = [
      "lib/db/postgres.ts",
      "lib/server/json-store.ts",
      "lib/parser.ts",
      "lib/smart-guard/run.ts",
      "lib/smart-guard/nac-client.ts",
      "lib/server/send-password-email.ts",
    ];
    for (const rel of stubs) {
      const text = source(rel);
      assert.match(text, /export \{\}/, rel);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//, rel);
      assert.equal(rel.startsWith("frontend/"), false);
    }
  });
});

describe("P13.2 frontend module organization", () => {
  const frontendForbidden =
    /from ["']@\/backend\/|from ["']@\/server\/|from ["']@\/lib\/server\/|from ["']@\/lib\/db\/|from ["']@\/lib\/parser["']|from ["']@\/server\/(db|storage|repositories)\/|from ["']pg["']|from ["']nodemailer["']|from ["']xlsx["']|from ["']unpdf["']|from ["']tesseract(?:\.js)?["']|node:fs|process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_USER|MAIL_PASS)/;

  const uiImport =
    /from ["']@\/frontend\/|from ["']@\/components\/|from ["']@\/context\//;

  it("keeps a single Next app and does not add frontend/package.json", () => {
    assert.equal(existsSync(join(ROOT, "app")), true);
    assert.equal(existsSync(join(ROOT, "frontend/components")), true);
    assert.equal(existsSync(join(ROOT, "frontend/context")), true);
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "frontend/package.json")), false);
    assert.equal(existsSync(join(ROOT, "frontend/middleware.ts")), false);
  });

  it("frontend cannot import backend, server, database, parser, or secrets", () => {
    const files = walkTsFiles(join(ROOT, "frontend"));
    assert.ok(files.length > 40);
    for (const file of files) {
      assert.equal(frontendForbidden.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend cannot import frontend", () => {
    for (const file of walkTsFiles(join(ROOT, "backend"))) {
      assert.equal(uiImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("shared cannot import frontend", () => {
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(uiImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("does not duplicate Financial Engine core or Smart Guard policy under frontend/", () => {
    assert.equal(existsSync(join(ROOT, "frontend/lib/financial-engine")), false);
    assert.equal(existsSync(join(ROOT, "lib/financial-engine/core/engine.ts")), true);
    assert.equal(existsSync(join(ROOT, "frontend/lib/smart-guard/policy.ts")), false);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/policy.ts")), true);
  });
});

describe("P13.3 frontend import path cleanup", () => {
  const retiredShims = [
    "lib/api/client.ts",
    "lib/i18n.ts",
    "lib/ui/cn.ts",
    "lib/tenant.ts",
    "lib/format.ts",
    "lib/taxonomy.ts",
    "lib/qa.ts",
    "lib/advisor-knowledge.ts",
    "lib/export-report.ts",
    "lib/chart-theme.ts",
    "lib/localize-advisor.ts",
    "lib/localize-warning.ts",
    "lib/column-roles.ts",
    "lib/phone.ts",
    "lib/smart-guard/client.ts",
    "lib/admin/metrics.ts",
    "lib/admin/track.ts",
    "lib/admin/money.ts",
  ];

  const shimImport =
    /from ["']@\/lib\/(api\/client|i18n|format|tenant|taxonomy|qa|advisor-knowledge|export-report|chart-theme|localize-advisor|localize-warning|column-roles|phone|smart-guard\/client|admin\/metrics|admin\/track|admin\/money|ui\/cn)["']/;

  it("retired P13.2 compatibility shims no longer exist", () => {
    for (const rel of retiredShims) {
      assert.equal(existsSync(join(ROOT, rel)), false, rel);
    }
  });

  it("Frontend modules and UI pages import retired modules from @/frontend, not shims", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
    ];
    assert.ok(files.length > 40);
    for (const file of files) {
      assert.equal(shimImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("tests, backend, server, and shared do not import retired shims", () => {
    const files = ["tests", "backend", "server", "shared"].flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    for (const file of files) {
      assert.equal(shimImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("keeps dual-use modules outside frontend/", () => {
    assert.equal(existsSync(join(ROOT, "lib/admin/config.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/admin/types.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/policy.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/types.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/financial-engine/core/engine.ts")), true);
    assert.equal(existsSync(join(ROOT, "frontend/lib/financial-engine")), false);
    assert.equal(existsSync(join(ROOT, "frontend/lib/smart-guard/policy.ts")), false);
    assert.equal(existsSync(join(ROOT, "frontend/lib/admin/config.ts")), false);
    assert.equal(existsSync(join(ROOT, "lib/utils.ts")), true);
  });

  it("does not introduce a second Next app", () => {
    assert.equal(existsSync(join(ROOT, "app")), true);
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "frontend/package.json")), false);
  });
});

describe("P13.4 architecture standard", () => {
  const uiImport = /from ["']@\/frontend\/|from ["']@\/components\/|from ["']@\/context\//;
  const frontendForbidden =
    /from ["']@\/backend\/|from ["']@\/server\/|from ["']@\/lib\/server\/|from ["']@\/lib\/db\/|from ["']pg["']/;
  const sharedForbidden =
    /from ["']react["']|from ["']react-dom["']|from ["']next\/|from ["']@\/frontend\/|from ["']@\/backend\/|from ["']@\/components\/|from ["']pg["']|node:fs|localStorage\.(get|set|remove)/

  it("keeps the standard folders and does not nest a second Next app", () => {
    assert.equal(existsSync(join(ROOT, "app")), true);
    assert.equal(existsSync(join(ROOT, "frontend")), true);
    assert.equal(existsSync(join(ROOT, "backend")), true);
    assert.equal(existsSync(join(ROOT, "server")), true);
    assert.equal(existsSync(join(ROOT, "shared")), true);
    assert.equal(existsSync(join(ROOT, "tests")), true);
    assert.equal(existsSync(join(ROOT, "docs")), true);
    assert.equal(existsSync(join(ROOT, "docs/architecture-standard.md")), true);
    assert.equal(existsSync(join(ROOT, "docs/architecture-rules.md")), true);
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "frontend/package.json")), false);
  });

  it("does not copy Financial Engine or Smart Guard policy into frontend/", () => {
    assert.equal(existsSync(join(ROOT, "frontend/lib/financial-engine")), false);
    assert.equal(existsSync(join(ROOT, "lib/financial-engine/core/engine.ts")), true);
    assert.equal(existsSync(join(ROOT, "frontend/lib/smart-guard/policy.ts")), false);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/policy.ts")), true);
  });

  it("shared does not import React, database, frontend, or backend", () => {
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(sharedForbidden.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("frontend does not import backend or server", () => {
    for (const file of walkTsFiles(join(ROOT, "frontend"))) {
      assert.equal(frontendForbidden.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend does not import frontend", () => {
    for (const file of walkTsFiles(join(ROOT, "backend"))) {
      assert.equal(uiImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("keeps lib/utils.ts in place", () => {
    assert.equal(existsSync(join(ROOT, "lib/utils.ts")), true);
  });
});

describe("P13.5 final architecture hardening", () => {
  const frontendLeak =
    /from ["']@\/backend\/|from ["']@\/server\/|from ["']@\/lib\/server\/|from ["']@\/lib\/db\/|from ["']@\/lib\/parser["']|from ["']pg["']|from ["']nodemailer["']|from ["']xlsx["']|from ["']unpdf["']|from ["']node:|process\.env\.(SESSION_SECRET|ADMIN_PASSWORD|NAC_API_KEY|DATABASE_URL|MAIL_APP_PASSWORD|MAIL_USER|MAIL_PASS)/;
  const backendUi =
    /from ["']@\/frontend\/|from ["']@\/components\/|from ["']@\/context\/|from ["']react["']|from ["']react-dom["']/;
  const sharedLeak =
    /from ["']@\/server\/|from ["']@\/backend\/|from ["']@\/frontend\/|from ["']@\/components\/|from ["']react["']|from ["']pg["']|from ["']node:|localStorage\.(get|set|remove)/;
  const legacyFrontend =
    /from ["']@\/components\/|from ["']@\/context\/|from ["']@\/lib\/(api\/client|i18n|format|tenant|taxonomy|qa|advisor-knowledge|export-report|chart-theme|localize-advisor|localize-warning|column-roles|phone|smart-guard\/client|admin\/metrics|admin\/track|admin\/money|ui\/cn)["']/;

  it("frontend does not import server, backend, database, parser, node builtins, or secrets", () => {
    for (const file of walkTsFiles(join(ROOT, "frontend"))) {
      assert.equal(frontendLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("backend does not import frontend or React UI", () => {
    for (const file of walkTsFiles(join(ROOT, "backend"))) {
      assert.equal(backendUi.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("shared does not import server, backend, frontend, React, or database", () => {
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(sharedLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("does not copy Financial Engine or Smart Guard policy into frontend/", () => {
    assert.equal(existsSync(join(ROOT, "frontend/lib/financial-engine")), false);
    assert.equal(existsSync(join(ROOT, "lib/financial-engine/core/engine.ts")), true);
    assert.equal(existsSync(join(ROOT, "frontend/lib/smart-guard/policy.ts")), false);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/policy.ts")), true);
  });

  it("UI pages and frontend modules do not use retired legacy Frontend import paths", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "frontend")),
      ...walkTsFiles(join(ROOT, "app")).filter((file) => !posixRel(file).startsWith("app/api/")),
    ];
    for (const file of files) {
      assert.equal(legacyFrontend.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("does not introduce a second Next app or frontend package.json", () => {
    assert.equal(existsSync(join(ROOT, "app")), true);
    assert.equal(existsSync(join(ROOT, "frontend/app")), false);
    assert.equal(existsSync(join(ROOT, "frontend/package.json")), false);
    assert.equal(existsSync(join(ROOT, "frontend/middleware.ts")), false);
  });

  it("detects no circular local imports across the standard trees", () => {
    const roots = ["app", "frontend", "backend", "server", "shared", "lib"];
    const files = roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)));
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const deps = localImportSpecs(readFileSync(file, "utf8"))
        .map((spec) => resolveLocal(file, spec))
        .filter((resolved): resolved is string => Boolean(resolved));
      graph.set(file, deps);
    }
    const visiting = new Set<string>();
    const seen = new Set<string>();
    const stack: string[] = [];
    function visit(node: string): string[] | null {
      if (seen.has(node)) return null;
      if (visiting.has(node)) {
        const start = stack.indexOf(node);
        return [...stack.slice(start), node].map((file) => relative(ROOT, file));
      }
      visiting.add(node);
      stack.push(node);
      for (const next of graph.get(node) ?? []) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
      stack.pop();
      visiting.delete(node);
      seen.add(node);
      return null;
    }
    for (const file of files) {
      const cycle = visit(file);
      assert.equal(cycle, null, cycle ? `circular import: ${cycle.join(" → ")}` : "");
    }
  });

  it("dual-use kernels stay single-source outside frontend/", () => {
    assert.equal(existsSync(join(ROOT, "lib/financial-engine/core/engine.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/policy.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/smart-guard/types.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/admin/config.ts")), true);
    assert.equal(existsSync(join(ROOT, "lib/admin/types.ts")), true);
    assert.equal(existsSync(join(ROOT, "frontend/lib/financial-engine")), false);
    assert.equal(existsSync(join(ROOT, "frontend/lib/smart-guard/policy.ts")), false);
    assert.equal(existsSync(join(ROOT, "frontend/lib/admin/config.ts")), false);
    assert.equal(existsSync(join(ROOT, "lib/utils.ts")), true);
  });

  it("server-only landmine stubs stay empty and outside frontend/", () => {
    for (const rel of [
      "lib/parser.ts",
      "lib/db/postgres.ts",
      "lib/server/json-store.ts",
      "lib/smart-guard/run.ts",
      "lib/smart-guard/nac-client.ts",
      "lib/server/send-password-email.ts",
    ]) {
      const text = source(rel);
      assert.match(text, /export \{\}/, rel);
      assert.doesNotMatch(text, /export \* from ["']@\/server\//, rel);
      assert.equal(rel.startsWith("frontend/"), false, rel);
    }
  });
});

describe("P14.1 data-store contract", () => {
  const handlerDataLeak =
    /from ["']@\/server\/db|from ["']@\/server\/repositories|from ["']@\/server\/storage|from ["']@\/backend\/src\/(storage|repositories)|from ["']pg["']|queryPostgres|json-store|from ["']\.\.\/(storage|repositories)\//;
  const serviceDbLeak =
    /from ["']@\/server\/db|from ["']@\/server\/storage|from ["']pg["']|queryPostgres|json-store/;
  const clientDataLeak =
    /from ["']@\/server\/db|from ["']@\/server\/repositories|from ["']@\/server\/storage|from ["']@\/lib\/db|from ["']pg["']|queryPostgres|json-store/;
  const kernelDbLeak =
    /from ["']@\/server\/db|from ["']@\/server\/repositories|from ["']@\/server\/storage|from ["']pg["']|queryPostgres|json-store|from ["']node:fs["']/;

  it("HTTP handlers do not import database, repositories, pg, or json-store", () => {
    const files = walkTsFiles(join(ROOT, "backend/src/http"));
    assert.ok(files.length > 10);
    for (const file of files) {
      assert.equal(handlerDataLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("Next BFF routes do not import database or repositories", () => {
    for (const file of walkTsFiles(join(ROOT, "app/api"))) {
      assert.equal(handlerDataLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("services do not access PostgreSQL or json-store directly", () => {
    const files = walkTsFiles(join(ROOT, "server/services"));
    assert.ok(files.length >= 8);
    for (const file of files) {
      assert.equal(serviceDbLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("frontend and shared do not import database or repositories", () => {
    for (const file of [...walkTsFiles(join(ROOT, "frontend")), ...walkTsFiles(join(ROOT, "shared"))]) {
      assert.equal(clientDataLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("Financial Engine core and Smart Guard policy do not import the data layer", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "lib/financial-engine/core")),
      join(ROOT, "lib/smart-guard/policy.ts"),
    ];
    for (const file of files) {
      assert.equal(kernelDbLeak.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("repositories remain the only module layer that talks to PostgreSQL and json-store", () => {
    const repos = walkTsFiles(join(ROOT, "server/repositories"));
    assert.equal(repos.length, 5);
    let postgresTalkers = 0;
    let jsonTalkers = 0;
    for (const file of repos) {
      const text = readFileSync(file, "utf8");
      if (/from ["']@\/server\/db\/postgres["']/.test(text)) postgresTalkers += 1;
      if (/from ["']@\/server\/storage\/json-store["']/.test(text)) jsonTalkers += 1;
    }
    assert.ok(postgresTalkers >= 4, "user/workspace/event/guard-log repositories must use postgres");
    assert.equal(jsonTalkers, 1, "only demo.repository uses the JSON store adapter");
  });

  it("locks the data-store contract document and does not add a database/ migrations tree", () => {
    assert.equal(existsSync(join(ROOT, "docs/p14.1-data-store-contract.md")), true);
    assert.equal(existsSync(join(ROOT, "database")), false);
  });
});

describe("P14.2 frontend cache contract", () => {
  const storageApi =
    /localStorage\.(getItem|setItem|removeItem|clear|key)|sessionStorage\.(getItem|setItem|removeItem|clear|key)/;
  const dataLayerImport =
    /from ["']@\/server\/(db|storage|repositories)|from ["']@\/lib\/db\/|from ["']pg["']|queryPostgres/;
  const allowedStorageFiles = new Set([
    "frontend/context/analysis-context.tsx",
    "frontend/context/appearance.tsx",
    "frontend/lib/admin/track.ts",
    "frontend/lib/admin/metrics.ts",
    "frontend/lib/taxonomy.ts",
    "frontend/lib/tenant.ts",
    "app/layout.tsx",
  ]);

  it("localStorage usage exists only in the documented Frontend/UI cache files", () => {
    const roots = ["app", "frontend", "server", "backend", "shared", "lib"];
    for (const file of roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)))) {
      const rel = posixRel(file);
      if (storageApi.test(readFileSync(file, "utf8"))) {
        assert.ok(allowedStorageFiles.has(rel), rel);
      }
    }
    for (const rel of allowedStorageFiles) {
      assert.equal(existsSync(join(ROOT, rel)), true, rel);
      assert.equal(storageApi.test(source(rel)), true, rel);
    }
  });

  it("server and backend do not depend on localStorage or sessionStorage", () => {
    for (const file of [...walkTsFiles(join(ROOT, "server")), ...walkTsFiles(join(ROOT, "backend"))]) {
      assert.equal(storageApi.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("shared does not depend on localStorage or sessionStorage", () => {
    for (const file of walkTsFiles(join(ROOT, "shared"))) {
      assert.equal(storageApi.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("merchant and admin authorization do not come from localStorage", () => {
    const auth = source("frontend/context/auth-context.tsx");
    assert.match(auth, /apiFetch\("\/api\/auth\/me"\)/);
    assert.match(auth, /apiFetch\("\/api\/auth\/login"/);
    assert.match(auth, /apiFetch\("\/api\/auth\/logout"/);
    assert.doesNotMatch(auth, storageApi);
    assert.doesNotMatch(auth, /SESSION_KEY|SESSION_USER_KEY|smartprofit-session|smartprofit-user/);

    const admin = source("frontend/context/admin-auth.tsx");
    assert.match(admin, /apiFetch\("\/api\/admin\/me"\)/);
    assert.match(admin, /apiFetch\("\/api\/admin\/login"/);
    assert.doesNotMatch(admin, storageApi);

    const merchantGuard = source("frontend/components/layout/auth-guard.tsx");
    assert.match(merchantGuard, /useAuth/);
    assert.doesNotMatch(merchantGuard, storageApi);

    const adminGuard = source("frontend/components/admin/admin-guard.tsx");
    assert.match(adminGuard, /useAdminAuth/);
    assert.doesNotMatch(adminGuard, storageApi);

    const mw = source("middleware.ts");
    assert.match(mw, /readAdminSession/);
    assert.doesNotMatch(mw, storageApi);
  });

  it("workspace ownership is session-scoped; localStorage is a cache keyed by that email", () => {
    const analysis = source("frontend/context/analysis-context.tsx");
    assert.match(analysis, /useAuth/);
    assert.match(analysis, /ownerEmail = user\?\.email \? normalizeEmail\(user\.email\) : null/);
    assert.match(analysis, /readLocalWorkspace\(ownerEmail\)/);
    assert.match(analysis, /apiFetch\("\/api\/workspace"\)/);
    assert.match(analysis, /apiFetch\("\/api\/workspace", \{\s*method: "POST"/);
    assert.match(analysis, /persistLocal\(ownerEmail, workspace\)/);

    const get = source("backend/src/http/workspace-get.ts");
    assert.match(get, /requireMerchant/);
    assert.match(get, /getMerchantWorkspace\(session\.email\)/);
    assert.doesNotMatch(get, storageApi);

    const post = source("backend/src/http/workspace-post.ts");
    assert.match(post, /requireMerchant/);
    assert.match(post, /saveMerchantWorkspace\(session\.email/);
    assert.doesNotMatch(post, storageApi);
  });

  it("session identity remains server-side cookies, not leftover SESSION_KEY slots", () => {
    const client = source("frontend/lib/api/client.ts");
    assert.match(client, /credentials: "include"/);

    const core = source("server/crypto/session-core.ts");
    assert.match(core, /MERCHANT_COOKIE = "sp_session"/);
    assert.match(core, /ADMIN_COOKIE = "sp_admin"/);
    assert.match(core, /httpOnly:\s*true/);

    const leftoverSessionRead =
      /localStorage\.getItem\(\s*(SESSION_KEY|SESSION_USER_KEY)|localStorage\.getItem\(\s*["']smartprofit-session["']|localStorage\.getItem\(\s*["']smartprofit-user["']/;
    const roots = ["app", "frontend", "server", "backend", "shared", "lib"];
    for (const file of roots.flatMap((dir) => walkTsFiles(join(ROOT, dir)))) {
      assert.equal(leftoverSessionRead.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
    assert.match(source("frontend/lib/tenant.ts"), /export const SESSION_KEY = "smartprofit-session"/);
  });

  it("frontend cache modules do not import database adapters or repositories", () => {
    for (const rel of allowedStorageFiles) {
      assert.equal(dataLayerImport.test(source(rel)), false, rel);
    }
    for (const file of walkTsFiles(join(ROOT, "frontend"))) {
      assert.equal(dataLayerImport.test(readFileSync(file, "utf8")), false, posixRel(file));
    }
  });

  it("locks the frontend cache contract document without changing production storage", () => {
    assert.equal(existsSync(join(ROOT, "docs/p14.2-frontend-cache-contract.md")), true);
    assert.match(source("docs/p14.2-frontend-cache-contract.md"), /Source of Truth/);
    assert.match(source("frontend/context/admin-portal.tsx"), /collectClientFacts/);
    assert.match(source("frontend/context/admin-portal.tsx"), /\/api\/admin\/snapshot/);
    assert.match(source("frontend/lib/admin/metrics.ts"), /mergeFacts/);
  });
});

