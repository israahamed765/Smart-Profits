/**
 * Browser API client. Public origin only — never secrets.
 * Empty NEXT_PUBLIC_API_BASE_URL keeps same-origin `/api/*` (Next compatibility).
 */
export function apiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
}

export function apiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${normalized}`;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), { ...init, credentials: "include" });
}
