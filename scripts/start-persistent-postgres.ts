import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { initdb as packagedInitdb } from "@embedded-postgres/windows-x64";
import { databaseUrl } from "@/server/db/postgres";

/**
 * Operator-only: start a durable local cluster on DATABASE_URL when Docker is missing.
 * Uses pg_ctl (daemon). Does not import embedded-postgres (that package kills the
 * cluster on Node exit). Binaries and data live under the user profile (ASCII path)
 * because initdb --encoding=UTF8 rejects the Arabic project path.
 */
function parseUrl(url: string) {
  const u = new URL(url.replace(/^postgresql:/i, "http:"));
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    port: Number(u.port || 5432),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
  };
}

function run(bin: string, args: string[], errorLabel: string, cwd: string, pathPrefix: string) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    windowsHide: true,
    cwd,
    env: {
      PATH: `${pathPrefix};${process.env.PATH || ""}`,
      SystemRoot: process.env.SystemRoot,
      windir: process.env.windir,
      USERNAME: process.env.USERNAME,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PATHEXT: process.env.PATHEXT,
      COMSPEC: process.env.COMSPEC,
      LC_MESSAGES: "C",
      LANG: "C",
    },
  });
  if (result.status !== 0) {
    const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`${errorLabel} failed (${result.status}): ${out}`);
  }
  return result;
}

async function main() {
  const url = databaseUrl();
  if (!url) {
    console.error("[pg-start] DATABASE_URL is not set.");
    process.exit(1);
  }
  const parsed = parseUrl(url);
  const home = homedir();
  const dataDir = join(home, ".smartprofit-pg");
  const distDir = join(home, ".smartprofit-pg-dist");
  const nativeRoot = join(dirname(packagedInitdb), "..");
  if (!existsSync(join(distDir, "bin", "postgres.exe"))) {
    mkdirSync(distDir, { recursive: true });
    cpSync(nativeRoot, distDir, { recursive: true });
  }
  const initdb = join(distDir, "bin", "initdb.exe");
  const pgCtl = join(distDir, "bin", "pg_ctl.exe");
  const binDir = join(distDir, "bin");
  mkdirSync(dataDir, { recursive: true });
  const logFile = join(dataDir, "pg.log");

  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    const pwFile = join(tmpdir(), `smartprofit-pg-pw-${process.pid}.txt`);
    writeFileSync(pwFile, `${parsed.password}\n`);
    try {
      run(
        initdb,
        [
          `--pgdata=${dataDir}`,
          "--auth=password",
          `--username=${parsed.user}`,
          `--pwfile=${pwFile}`,
          "--encoding=UTF8",
          "--locale=C",
          "--lc-messages=C",
        ],
        "initdb",
        dataDir,
        binDir,
      );
    } finally {
      try {
        unlinkSync(pwFile);
      } catch {
        // ignore
      }
    }
  }

  const status = spawnSync(pgCtl, ["status", "-D", dataDir], {
    encoding: "utf8",
    windowsHide: true,
    cwd: dataDir,
    env: {
      PATH: `${binDir};${process.env.PATH || ""}`,
      SystemRoot: process.env.SystemRoot,
      windir: process.env.windir,
    },
  });
  if (status.status === 0) {
    console.log("[pg-start] already running");
    console.log(JSON.stringify({ dataDir, distDir, port: parsed.port, alreadyRunning: true }));
    return;
  }

  run(
    pgCtl,
    ["start", "-w", "-D", dataDir, "-l", logFile, "-o", `-p ${parsed.port}`],
    "pg_ctl start",
    dataDir,
    binDir,
  );
  console.log("[pg-start] cluster started (daemon, persistent data dir)");
  console.log(JSON.stringify({ dataDir, distDir, port: parsed.port, alreadyRunning: false }));
}

void main().catch((error) => {
  console.error("[pg-start] failed", error);
  process.exit(1);
});
