import { DEFAULT_SETTINGS } from "@/lib/financial-engine/core/sample-data";
import { FileParseError } from "@/shared/types/financial";
import type { AppSettings, TaxonomyMap } from "@/shared/types/financial";
import { normalizeOpexSettings } from "@/lib/financial-engine/core/opex";
import { requireMerchant } from "@/server/middleware/authenticate";
import { rateLimit } from "@/server/middleware/rate-limit";
import { backendApiRoute, jsonError } from "./api-route";
import { analyzeMerchantFile } from "../services/analyze";
import { requireGuardAllow } from "../services/guard";

const MAX_BYTES = 8 * 1024 * 1024;

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "analyze", 12, 60_000);
    const session = await requireMerchant(req);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("لم يتم إرفاق ملف للتحليل.", 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError("الملف أكبر من الحد المسموح (8MB).", 400);
    }

    await requireGuardAllow(req, {
      action: "file_upload",
      email: session.email,
      fileBytes: file.size,
      fileName: file.name,
    });

    const settingsRaw = form.get("settings");
    const taxonomyRaw = form.get("taxonomy");
    const settings: AppSettings = settingsRaw
      ? normalizeOpexSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(String(settingsRaw)) })
      : DEFAULT_SETTINGS;
    const taxonomy: TaxonomyMap | undefined = taxonomyRaw ? (JSON.parse(String(taxonomyRaw)) as TaxonomyMap) : undefined;

    try {
      const { parsed, result } = await analyzeMerchantFile(file, settings, taxonomy);
      return Response.json({ parsed, result });
    } catch (error) {
      const message =
        error instanceof FileParseError || error instanceof Error ? error.message : "فشل تحليل الملف.";
      return jsonError(message, 400);
    }
  });
}
