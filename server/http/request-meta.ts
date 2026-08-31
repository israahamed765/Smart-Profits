export function requestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "",
    userAgent: request.headers.get("user-agent") || "",
  };
}
