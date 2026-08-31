/**
 * Explicit frontend origins for CSRF + CORS.
 * Never a wildcard. Production must set FRONTEND_ORIGIN (and/or APP_URL).
 */
export function allowedFrontendOrigins(): string[] {
  const raw = [process.env.FRONTEND_ORIGIN, process.env.APP_URL]
    .flatMap((value) => (value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(raw)];
}

export function allowedFrontendHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const origin of allowedFrontendOrigins()) {
    try {
      hosts.add(new URL(origin).host);
    } catch {
      // ignore invalid origin entries
    }
  }
  return hosts;
}

export function isAllowedFrontendOrigin(origin: string): boolean {
  return allowedFrontendOrigins().includes(origin);
}
