const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getApiBase() {
  return API_BASE;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("couples_token");
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("couples_token", token);
  else localStorage.removeItem("couples_token");
}

export type ApiError = { error: string; details?: string };

/** Normalize failed-response bodies for UI copy. */
export function formatApiFailure(body: ApiError | string): string {
  if (typeof body === "string") return body;
  return body.details ? `${body.error}: ${body.details}` : body.error;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string | null
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: ApiError | string }> {
  const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }

  if (!res.ok) {
    const err =
      typeof body === "object" && body !== null && "error" in body
        ? (body as ApiError)
        : { error: text || res.statusText };
    return { ok: false, status: res.status, body: err };
  }

  return { ok: true, data: body as T };
}
