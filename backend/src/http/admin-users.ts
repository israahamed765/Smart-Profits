import { requireAdmin } from "@/server/middleware/authenticate";
import { adminUserDeleteSchema, adminUserPatchSchema } from "@/server/validators/admin.validator";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { deleteMerchantAccount, patchMerchantAccount } from "../services/admin";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    await requireAdmin(req);
    const input = adminUserPatchSchema.parse(await readJson(req));
    const account = await patchMerchantAccount(input);
    return jsonOk({ ok: true, account });
  });
}

export function DELETE(request: Request) {
  return backendApiRoute(request, async (req) => {
    await requireAdmin(req);
    const input = adminUserDeleteSchema.parse(await readJson(req));
    const deleted = await deleteMerchantAccount(input.email);
    return jsonOk({ ok: true, deleted });
  });
}
