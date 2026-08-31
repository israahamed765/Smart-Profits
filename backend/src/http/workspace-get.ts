import { isAppError } from "@/server/errors";
import { requireMerchant } from "@/server/middleware/authenticate";
import { getMerchantWorkspace } from "../services/workspace";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * GET /api/workspace — same contract as the Next.js route.
 * HTTP → service → repository (via existing workspace.service). Does not import repositories.
 */
export async function GET(request: Request) {
  try {
    const session = await requireMerchant(request);
    const workspace = await getMerchantWorkspace(session.email);
    return Response.json({ workspace });
  } catch (error) {
    if (isAppError(error)) {
      return jsonError(error.message, error.status);
    }
    console.error("[backend] GET /api/workspace", error instanceof Error ? error.name : "error");
    return jsonError("حدث خطأ غير متوقع.", 500);
  }
}
