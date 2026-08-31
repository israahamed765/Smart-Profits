import { requireMerchant } from "@/server/middleware/authenticate";
import { rateLimit } from "@/server/middleware/rate-limit";
import { reportExportSchema } from "@/shared/validation/report-export";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { currentMerchant } from "../services/auth";
import { buildSecuredMonthlyReport } from "../services/report-export";
import { requireGuardAllow } from "../services/guard";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "report-export", 10, 60_000);
    const session = await requireMerchant(req);
    const input = reportExportSchema.parse(await readJson(req));
    const account = await currentMerchant(session.email);

    await requireGuardAllow(req, {
      action: "report_export",
      email: session.email,
      phone: account.phone,
    });

    return jsonOk(await buildSecuredMonthlyReport(session.email, input));
  });
}
