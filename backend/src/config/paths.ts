import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (`smart-profit/`) so JSON adapter keeps using existing `data/`. */
export function repoRoot() {
  return resolve(join(dirname(fileURLToPath(import.meta.url)), "../../.."));
}

export function bindRepoRoot() {
  const root = repoRoot();
  if (resolve(process.cwd()) !== root) {
    process.chdir(root);
  }
  return root;
}
