/**
 * Next.js compatibility proxy to the standalone backend.
 * Server-only. Does not change public /api/* paths.
 */
export async function maybeProxyToBackend(
  request: Request,
  fallback: (request: Request) => Promise<Response>,
): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL?.trim();
  if (!backendUrl) return fallback(request);

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, backendUrl);
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "origin", "referer", "host"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const upstream = await fetch(target, init);
    const body = await upstream.arrayBuffer();
    const out = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) out.set("content-type", contentType);
    const setCookie = upstream.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) out.append("set-cookie", cookie);
    return new Response(body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: "حدث خطأ غير متوقع." }, { status: 500 });
  }
}
