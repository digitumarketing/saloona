/**
 * The single HTTP client for the dashboard.
 *
 * Every network call in the app goes through `api`, which means error handling,
 * session expiry, and plan-gate responses are handled once. The previous build
 * called `fetch` inline in each component and swallowed failures, so a 401 left
 * the screen blank with no explanation.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** Field-keyed validation messages from a 422 response. */
    readonly fields?: Record<string, string>,
    readonly requiredPlan?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the response was a plan gate rather than a fault. */
  get isUpgradeRequired(): boolean {
    return this.status === 402;
  }

  get isValidation(): boolean {
    return this.status === 422 && !!this.fields;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * What a 401 means depends on which surface is asking.
 *
 * In the dashboard it means the staff session expired, and the only useful
 * response is the sign-in page. In the customer wallet it means "there is no
 * wallet on this device" — a normal first-visit state — and sending a salon's
 * customer to the salon's staff login screen would be both baffling and wrong.
 * The wallet therefore clears this handler and deals with the error itself.
 */
let unauthenticatedHandler: (() => void) | null = () => {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
};

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  unauthenticatedHandler = handler;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: "same-origin",
      signal: options.signal,
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the server. Check your connection.", "network_error");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (response.ok) return payload as T;

  // An expired or revoked session must land on the sign-in page rather than
  // showing an error the user cannot act on.
  if (response.status === 401 && unauthenticatedHandler) {
    unauthenticatedHandler();
    throw new ApiError(401, "Your session has expired. Please sign in again.", "unauthenticated");
  }

  const body = (payload ?? {}) as {
    error?: string;
    code?: string;
    fields?: Record<string, string>;
    requiredPlan?: string;
  };

  throw new ApiError(
    response.status,
    body.error ?? `Request failed (${response.status})`,
    body.code,
    body.fields,
    body.requiredPlan
  );
}

export const api = {
  get: <T,>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { method: "GET", query, signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" })
};

/** Turns any thrown value into something safe to show a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
