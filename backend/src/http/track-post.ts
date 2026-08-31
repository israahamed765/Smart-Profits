import { optionalMerchant } from "@/server/middleware/authenticate";
import { trackEventSchema } from "@/server/validators/track.validator";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { recordTrackEvent } from "../services/track";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const session = await optionalMerchant(req);
    const event = trackEventSchema.parse(await readJson(req));
    await recordTrackEvent({
      type: event.type,
      at: event.at,
      label: event.label,
      email: session?.email,
    });
    return jsonOk({ ok: true });
  });
}
