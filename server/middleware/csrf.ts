import { AppError } from "@/server/errors";
import { allowedFrontendHosts } from "@/server/http/origins";

function allowedHosts(request: Request) {
  const hosts = new Set<string>();
  const headerHost = request.headers.get("host");
  if (headerHost) hosts.add(headerHost);
  for (const host of allowedFrontendHosts()) hosts.add(host);
  return hosts;
}

export function assertSameOrigin(request: Request) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/nac")) return;

  const origin = request.headers.get("origin") || request.headers.get("referer");
  if (!origin) {
    throw new AppError("طلب غير مسموح.", 403);
  }

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("طلب غير مسموح.", 403);
  }

  if (!allowedHosts(request).has(originHost)) {
    throw new AppError("طلب غير مسموح.", 403);
  }
}
