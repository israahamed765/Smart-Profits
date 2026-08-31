import { isAllowedFrontendOrigin } from "@/server/http/origins";

/** CORS for the standalone backend only. Exact origin echo. Never `*`. */
export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = (request.headers.get("origin") || "").trim();
  if (!origin || !isAllowedFrontendOrigin(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

export function mergeCors(request: Request, response: Response): Response {
  const extra = corsHeaders(request);
  if (![...extra.keys()].length) return response;
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers.set(key, value);
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  extra.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

export function preflightResponse(request: Request): Response {
  const extra = corsHeaders(request);
  if (!extra.has("Access-Control-Allow-Origin")) {
    return new Response(null, { status: 403 });
  }
  extra.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers: extra });
}
