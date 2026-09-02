import { ZodError } from "zod";
import { AppError, isAppError } from "@/server/errors";
import { isGuardDeniedError } from "@/server/smart-guard/enforce";
import { assertSameOrigin } from "@/server/middleware/csrf";

export function jsonOk(data: object, init?: ResponseInit) {
  return Response.json(data, init);
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function backendApiRoute(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    return await handler(request);
  } catch (error) {
    if (isGuardDeniedError(error)) {
      return Response.json({ error: error.message, verdict: error.verdict }, { status: error.status });
    }
    if (isAppError(error)) {
      const codes = (error as AppError & { codes?: string[] }).codes;
      if (codes?.length) {
        return Response.json({ error: error.message, codes }, { status: error.status });
      }
      return jsonError(error.message, error.status);
    }
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message || "بيانات غير صالحة.", 400);
    }
    console.error("[backend]", error instanceof Error ? error.name : "error");
    return jsonError("حدث خطأ غير متوقع.", 500);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("طلب غير صالح.", 400);
  }
}
