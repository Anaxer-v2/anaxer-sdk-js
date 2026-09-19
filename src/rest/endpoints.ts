import type {
  CreatedV1,
  GraduatedV1,
  LaunchpadStatsV1,
  PriceUpdateV1,
  SwapV1,
  TokenMetadataV1,
} from "../types";
import type { HttpClient } from "./http";
import { Page, type PageEnvelope } from "./pagination";

/** Unix ms or ISO-8601 string (rest-v1 §Pagination). */
export type TimeInput = number | string;

export interface TradesListOpts {
  limit?: number;
  cursor?: string;
  from?: TimeInput;
  to?: TimeInput;
  source?: string;
  /** When true, keep only swaps with wrapped SOL on the other leg (build-plan 32b/32c). */
  solOnly?: boolean;
}

export interface CreationsListOpts {
  limit?: number;
  cursor?: string;
  from?: TimeInput;
  to?: TimeInput;
  source?: string;
  excludeMayhem?: boolean;
}

export interface GraduationsListOpts {
  limit?: number;
  cursor?: string;
  from?: TimeInput;
  to?: TimeInput;
  source?: string;
  excludeMayhem?: boolean;
  minLiquiditySol?: number;
}

function timeQuery(value: TimeInput | undefined): string | number | undefined {
  return value;
}

export interface RestApi {
  tokens: {
    get(mint: string): Promise<TokenMetadataV1>;
    batch(mints: string[]): Promise<TokenMetadataV1[]>;
    price(mint: string): Promise<PriceUpdateV1>;
    batchPrice(mints: string[]): Promise<PriceUpdateV1[]>;
    trades(mint: string, opts?: TradesListOpts): Promise<Page<SwapV1>>;
  };
  creations(opts?: CreationsListOpts): Promise<Page<CreatedV1>>;
  graduations(opts?: GraduationsListOpts): Promise<Page<GraduatedV1>>;
  launchpads: {
    stats(opts?: { windowHours?: number }): Promise<LaunchpadStatsV1>;
  };
}

function listPage<T>(
  http: HttpClient,
  path: string,
  baseQuery: Record<string, string | number | boolean | undefined>,
): Promise<Page<T>> {
  const load = (cursor?: string) =>
    http.getJson<PageEnvelope<T>>(path, {
      ...baseQuery,
      cursor: cursor ?? baseQuery.cursor,
    });

  return load().then(
    (envelope) =>
      new Page(envelope, (nextCursor) =>
        http.getJson<PageEnvelope<T>>(path, {
          ...baseQuery,
          cursor: nextCursor,
        }),
      ),
  );
}

/** Wire REST `/v1/*` methods (doc 22 §4.2) — no `programs()`. */
export function createRestApi(http: HttpClient): RestApi {
  return {
    tokens: {
      get(mint: string) {
        return http.getJson<TokenMetadataV1>(`/v1/tokens/${encodeURIComponent(mint)}`);
      },
      async batch(mints: string[]) {
        const body = await http.getJson<{ data: TokenMetadataV1[] }>("/v1/tokens/batch", {
          mints: mints.join(","),
        });
        return body.data;
      },
      price(mint: string) {
        return http.getJson<PriceUpdateV1>(
          `/v1/tokens/${encodeURIComponent(mint)}/price`,
        );
      },
      async batchPrice(mints: string[]) {
        const body = await http.getJson<{ data: PriceUpdateV1[] }>(
          "/v1/tokens/batch/price",
          { mints: mints.join(",") },
        );
        return body.data;
      },
      trades(mint: string, opts: TradesListOpts = {}) {
        return listPage<SwapV1>(http, `/v1/tokens/${encodeURIComponent(mint)}/trades`, {
          limit: opts.limit,
          cursor: opts.cursor,
          from: timeQuery(opts.from),
          to: timeQuery(opts.to),
          source: opts.source,
          solOnly: opts.solOnly,
        });
      },
    },
    creations(opts: CreationsListOpts = {}) {
      return listPage<CreatedV1>(http, "/v1/creations", {
        limit: opts.limit,
        cursor: opts.cursor,
        from: timeQuery(opts.from),
        to: timeQuery(opts.to),
        source: opts.source,
        excludeMayhem: opts.excludeMayhem,
      });
    },
    graduations(opts: GraduationsListOpts = {}) {
      return listPage<GraduatedV1>(http, "/v1/graduations", {
        limit: opts.limit,
        cursor: opts.cursor,
        from: timeQuery(opts.from),
        to: timeQuery(opts.to),
        source: opts.source,
        excludeMayhem: opts.excludeMayhem,
        minLiquiditySol: opts.minLiquiditySol,
      });
    },
    launchpads: {
      stats(opts: { windowHours?: number } = {}) {
        return http.getJson<LaunchpadStatsV1>("/v1/launchpads/stats", {
          windowHours: opts.windowHours,
        });
      },
    },
  };
}
