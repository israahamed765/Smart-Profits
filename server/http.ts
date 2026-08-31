import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "@/server/errors";
import { isGuardDeniedError } from "@/server/smart-guard/enforce";
import { assertSameOrigin } from "@/server/middleware/csrf";

export { requestMeta } from "@/server/http/request-meta";

export function jsonOk(data: object, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("طلب غير صالح.", 400);
  }
}

export function apiRoute(handler: (request: Request) => Promise<NextResponse>) {
  return async (request: Request) => {
    try {
      assertSameOrigin(request);
      return await handler(request);
    } catch (error) {
      if (isGuardDeniedError(error)) {
        return NextResponse.json({ error: error.message, verdict: error.verdict }, { status: error.status });
      }
      if (isAppError(error)) {
        return jsonError(error.message, error.status);
      }
      if (error instanceof ZodError) {
        return jsonError(error.issues[0]?.message || "بيانات غير صالحة.", 400);
      }
      console.error("[api]", error);
      return jsonError("حدث خطأ غير متوقع.", 500);
    }
  };
}
