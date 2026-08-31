import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadBackendEnv } from "../config/env";
import { mergeCors, preflightResponse } from "./cors";
import { dispatchProductRequest } from "./dispatch";

async function incomingToRequest(req: IncomingMessage) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = req.method || "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    if (body.length) init.body = body;
  }
  return new Request(url, init);
}

async function writeResponse(nodeRes: ServerResponse, response: Response) {
  nodeRes.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.() ?? [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    nodeRes.setHeader(key, value);
  });
  if (cookies.length === 1) nodeRes.setHeader("Set-Cookie", cookies[0]);
  else if (cookies.length > 1) nodeRes.setHeader("Set-Cookie", cookies);
  nodeRes.end(Buffer.from(await response.arrayBuffer()));
}

export function createBackendServer() {
  loadBackendEnv();
  return createServer((req, res) => {
    void (async () => {
      try {
        const request = await incomingToRequest(req);
        if ((req.method || "").toUpperCase() === "OPTIONS") {
          await writeResponse(res, preflightResponse(request));
          return;
        }
        const handled = await dispatchProductRequest(request);
        if (!handled) {
          await writeResponse(res, mergeCors(request, Response.json({ error: "Not found." }, { status: 404 })));
          return;
        }
        await writeResponse(res, mergeCors(request, handled));
      } catch {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "حدث خطأ غير متوقع." }));
      }
    })();
  });
}
