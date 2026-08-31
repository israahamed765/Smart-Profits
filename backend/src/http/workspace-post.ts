import { workspaceSaveSchema } from "@/server/validators/workspace.validator";
import { requireMerchant } from "@/server/middleware/authenticate";
import type { PersistedWorkspace } from "@/lib/financial-engine/serialization";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { saveMerchantWorkspace } from "../services/workspace";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const body = workspaceSaveSchema.parse(await readJson(req));
    await saveMerchantWorkspace(session.email, body.workspace as unknown as PersistedWorkspace);
    return jsonOk({ ok: true });
  });
}
