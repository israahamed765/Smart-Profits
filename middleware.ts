import { NextResponse } from "next/server";
import { readAdminSession } from "@/server/crypto/session";

export async function middleware(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin")) return NextResponse.next();
  if (url.pathname === "/api/admin/login") return NextResponse.next();

  const session = await readAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "غير مصرح. سجّلي دخول الإدارة." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
