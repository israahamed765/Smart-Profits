export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

/** True for AppError even if tsx/ESM loaded `server/errors` twice (instanceof would fail). */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  const nameOk = candidate.name === "AppError" || candidate.name === "GuardDeniedError";
  return nameOk && typeof candidate.status === "number" && typeof candidate.message === "string";
}
