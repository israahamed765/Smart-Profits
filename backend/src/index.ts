import { pathToFileURL } from "node:url";
import { backendListenHost, backendPort, loadBackendEnv } from "./config/env";
import { bindRepoRoot } from "./config/paths";
import { createBackendServer } from "./http/server";

bindRepoRoot();
loadBackendEnv();

export { createBackendServer } from "./http/server";

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry && import.meta.url === entry) {
  const port = backendPort();
  const host = backendListenHost();
  const server = createBackendServer();
  server.listen(port, host, () => {
    console.log(`[backend] listening on http://${host}:${port}`);
  });
}
