import { rateLimit } from "@/server/middleware/rate-limit";
import { forgotPasswordSchema } from "@/server/validators/auth.validator";
import { backendApiRoute, jsonOk, readJson } from "./api-route";
import { requestPasswordReset } from "../services/auth";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    rateLimit(req, "auth-forgot", 5, 60_000);
    const input = forgotPasswordSchema.parse(await readJson(req));
    const result = await requestPasswordReset(input.email);
    return jsonOk({
      ok: true,
      emailed: result.emailed,
      demoCode: result.demoCode,
      message: result.emailed
        ? `تم إرسال كود إعادة التعيين إلى ${input.email}.`
        : "تم إنشاء كود إعادة التعيين. أدخليه مع كلمة المرور الجديدة.",
    });
  });
}
