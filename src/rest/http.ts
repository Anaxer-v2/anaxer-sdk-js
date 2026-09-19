import { AnaxerError, type AnaxerErrorCode } from "../errors";

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Max retries after the first attempt (0 = no retries). */
  maxRetries: number;
  /** Injectable for tests. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `Retry-After` as seconds or HTTP-date; fallback when absent/invalid. */
export function parseRetryAfterMs(
  header: string | null,
  fallbackMs: number,
): number {
  if (!header) return fallbackMs;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.floor(asInt * 1000);
  }
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    return Math.max(0, when - Date.now());
  }
  return fallbackMs;
}

function defaultBackoffMs(attempt: number): number {
  // attempt is 0-based retry index
  return Math.min(30_000, 500 * 2 ** attempt);
}

function mapHttpError(status: number, body: unknown): AnaxerError {
  const errObj =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
      ? (body.error as { code?: string; message?: string })
      : null;
  const code = (errObj?.code ?? fallbackCode(status)) as AnaxerErrorCode;
  const message = errObj?.message ?? `HTTP ${status}`;
  return new AnaxerError(code, message, { status });
}

function fallbackCode(status: number): AnaxerErrorCode {
  if (status === 400) return "invalid_request";
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 503) return "upstream_unavailable";
  if (status >= 500) return "internal";
  return "invalid_request";
}

export type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      sp.set(key, value ? "true" : "false");
      continue;
    }
    sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

/**
 * Authenticated GET wrapper: Bearer auth, JSON parse, 429/5xx retry (doc 22 decision 12).
 */
export class HttpClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  }

  async getJson<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    const url = `${this.opts.baseUrl}${path}${buildQuery(query ?? {})}`;
    let attempt = 0;

    for (;;) {
      const res = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      const status = res.status;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      const retryable = status === 429 || status >= 500;
      if (retryable && attempt < this.opts.maxRetries) {
        const fallback = defaultBackoffMs(attempt);
        const retryAfter =
          res.headers.get("retry-after") ?? res.headers.get("Retry-After");
        const delay = parseRetryAfterMs(retryAfter, fallback);
        attempt += 1;
        await sleep(delay);
        continue;
      }

      throw mapHttpError(status, body);
    }
  }
}
