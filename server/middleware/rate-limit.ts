import { AppError } from "@/server/errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function rateLimit(request: Request, bucket: string, limit: number, windowMs: number) {
  const key = `${bucket}:${clientIp(request)}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new AppError("محاولات كثيرة. انتظري قليلاً ثم أعيدي المحاولة.", 429);
  }
}
