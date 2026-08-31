import { requireMerchant } from "@/server/middleware/authenticate";
import { profileUpdateSchema } from "@/server/validators/profile.validator";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { getProfile, updateProfile } from "../services/profile";

export function GET(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const profile = await getProfile(session.email);
    return jsonOk(profile);
  });
}

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await requireMerchant(req);
    const patch = profileUpdateSchema.parse(await readJson(req));
    const account = await updateProfile(session.email, patch);
    return jsonOk({ ok: true, account });
  });
}
