import type { ResolvedClientConfig } from "./config";
import {
  DEFAULT_BASE_URL,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_REST_MAX_RETRIES,
  deriveWsUrl,
  resolveReconnect,
  stripTrailingSlash,
} from "./config";

export interface ClientConfig {
  apiKey: string;
  /** REST base, default "https://api.anaxer.com". No trailing slash required. */
  baseUrl?: string;
  /** WS URL, default derived from baseUrl → "wss://api.anaxer.com/v1/stream". */
  wsUrl?: string;
  /** default true; false disables auto-reconnect; object tunes it. */
  reconnect?: boolean | { baseDelayMs?: number; maxDelayMs?: number; maxRetries?: number };
  /** ping interval ms, default 15_000; 0 disables heartbeat. */
  heartbeatMs?: number;
  /** REST transient-failure retries (429/5xx), default 2; 0 disables. */
  restMaxRetries?: number;
}

export function resolveClientConfig(config: ClientConfig): ResolvedClientConfig {
  if (!config.apiKey) {
    throw new Error("connect(): apiKey is required");
  }
  const baseUrl = stripTrailingSlash(config.baseUrl ?? DEFAULT_BASE_URL);
  return {
    apiKey: config.apiKey,
    baseUrl,
    wsUrl: config.wsUrl ?? deriveWsUrl(baseUrl),
    heartbeatMs: config.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
    restMaxRetries: config.restMaxRetries ?? DEFAULT_REST_MAX_RETRIES,
    reconnect: resolveReconnect(config.reconnect),
  };
}
