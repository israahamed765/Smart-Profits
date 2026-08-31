import { DEFAULT_NAC_DEMO, type NacDemoFlags } from "@/lib/smart-guard/types";
import { readJsonFile, writeJsonFile } from "@/server/storage/json-store";

const FILE = "nac-demo.json";

type DemoMap = Record<string, NacDemoFlags>;

async function readAll(): Promise<DemoMap> {
  const parsed = await readJsonFile<DemoMap>(FILE, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function writeAll(map: DemoMap) {
  await writeJsonFile(FILE, map);
}

export async function readDemoFlags(email: string): Promise<NacDemoFlags> {
  const map = await readAll();
  return { ...DEFAULT_NAC_DEMO, ...map[email.trim().toLowerCase()] };
}

export async function writeDemoFlags(email: string, flags: Partial<NacDemoFlags>) {
  const key = email.trim().toLowerCase();
  const map = await readAll();
  map[key] = { ...DEFAULT_NAC_DEMO, ...map[key], ...flags };
  await writeAll(map);
  return map[key];
}
