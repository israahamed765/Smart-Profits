import { spawnSync } from "node:child_process";

function hasDocker() {
  const probe = spawnSync("docker", ["--version"], { encoding: "utf8", windowsHide: true, shell: false });
  return probe.status === 0;
}

async function main() {
  console.log("[db:up] starting...");
  if (process.platform === "win32" && !hasDocker()) {
    console.log("[db:up] Docker not found on Windows — starting embedded PostgreSQL.");
    const { startPersistentPostgres } = await import("./start-persistent-postgres");
    await startPersistentPostgres();
    return;
  }

  const result = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
    stdio: "inherit",
    cwd: process.cwd(),
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

void main().catch((error) => {
  console.error("[db:up] failed", error);
  process.exit(1);
});
