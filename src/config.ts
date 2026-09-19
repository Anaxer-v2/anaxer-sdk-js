export const DEFAULT_BASE_URL = "https://api.anaxer.com";
export const DEFAULT_HEARTBEAT_MS = 15_000;
export const DEFAULT_REST_MAX_RETRIES = 2;
export const DEFAULT_RECONNECT_BASE_MS = 500;
export const DEFAULT_RECONNECT_MAX_MS = 30_000;

export type ReconnectConfig =
  | false
  | {
      baseDelayMs: number;
      maxDelayMs: number;
      /** `null` = unlimited retries. */
      maxRetries: number | null;
    };

export interface ResolvedClientConfig {
  apiKey: string;
  baseUrl: string;
  wsUrl: string;
  heartbeatMs: number;
  restMaxRetries: number;
  reconnect: ReconnectConfig;
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Derive `wss://…/v1/stream` (or `ws://` for http) from a REST base URL. */
export function deriveWsUrl(baseUrl: string): string {
  const base = stripTrailingSlash(baseUrl);
  if (base.startsWith("https://")) {
    return `wss://${base.slice("https://".length)}/v1/stream`;
  }
  if (base.startsWith("http://")) {
    return `ws://${base.slice("http://".length)}/v1/stream`;
  }
  return `${base}/v1/stream`;
}

export function resolveReconnect(
  reconnect: boolean | { baseDelayMs?: number; maxDelayMs?: number; maxRetries?: number } | undefined,
): ReconnectConfig {
  if (reconnect === false) return false;
  const opts = reconnect === true || reconnect === undefined ? {} : reconnect;
  return {
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_RECONNECT_BASE_MS,
    maxDelayMs: opts.maxDelayMs ?? DEFAULT_RECONNECT_MAX_MS,
    maxRetries: opts.maxRetries === undefined ? null : opts.maxRetries,
  };
}

export function reconnectDelayMs(
  attempt: number,
  cfg: { baseDelayMs: number; maxDelayMs: number },
): number {
  // attempt is 1-based: first reconnect uses 2^0 = 1 × base
  const exp = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** (attempt - 1));
  const jitter = 0.8 + Math.random() * 0.4; // ±20%
  return Math.max(0, Math.floor(exp * jitter));
}
