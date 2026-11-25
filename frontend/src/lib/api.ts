// Talks to the Go API through Next's /api rewrite (same origin, so the
// HttpOnly session cookie just works). Errors arrive as stable codes that
// the UI translates with t(`errors.${code}`).

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

function url(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof data === "object" && data && "error" in data ? String(data.error) : [502,503,504].includes(res.status) ? "service_unavailable" : "internal";
    throw new ApiError(code, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T = void>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = void>(path: string, body: unknown) => request<T>("PUT", path, body),
};

/** The error code to show for anything thrown by api.*. */
export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : "internal";
}
