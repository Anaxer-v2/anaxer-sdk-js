import type {
  CreatedV1,
  GraduatedV1,
  LaunchpadStatsV1,
  RestPriceV1,
  SwapV1,
  TokenMetadataV1,
  TransferV1,
} from "../types";
import { AnaxerError } from "../errors";
import type { HttpClient } from "./http";
import { Page, type PageEnvelope } from "./pagination";

/** Unix ms or ISO-8601 string (rest-v1 §Pagination). */
export type TimeInput = number | string;

/**
 * Source filter on list endpoints: one `source`, or a `sources` list (OR, up to 20) — never
 * both (the API answers `400`). Names must be documented sources (`pump_fun`, `pump_amm`, …).
 */
export type SourceFilterOpts =
  | { source?: string; sources?: never }
  | { sources?: string[]; source?: never };

/** Size bounds in USD on `volumeUsd`. A set bound excludes rows with `volumeUsd: null`. */
export interface SizeFilterOpts {
  minVolumeUsd?: number;
  maxVolumeUsd?: number;
}

/** Paging and time window shared by every list endpoint. */
export interface ListWindowOpts {
  /** Rows per page, 1–200 (default 50). */
  limit?: number;
  cursor?: string;
  from?: TimeInput;
  to?: TimeInput;
}

/** `client.tokens.trades(mint, opts)` — swaps where `mint` is either side. */
export type TradesListOpts = ListWindowOpts &
  SourceFilterOpts &
  SizeFilterOpts & {
    /** When true, keep only swaps with wrapped SOL on the other leg (build-plan 32b/32c). */
    solOnly?: boolean;
  };

export type CreationsListOpts = ListWindowOpts &
  SourceFilterOpts & {
    excludeMayhem?: boolean;
  };

export type GraduationsListOpts = ListWindowOpts &
  SourceFilterOpts & {
    excludeMayhem?: boolean;
    minLiquiditySol?: number;
  };

/** `client.wallets.trades(wallet, opts)` — the REST side of the `trades` `wallets` filter. */
export type WalletTradesListOpts = ListWindowOpts &
  SourceFilterOpts &
  SizeFilterOpts & {
    /** Keep trades with any of these tokens on either side (up to 100; quote assets rejected). */
    mints?: string[];
    /** When true, keep only swaps with wrapped SOL on one side. */
    solOnly?: boolean;
  };

/** `client.wallets.transfers(wallet, opts)` — a wallet's wallet-to-wallet transfers. */
export type WalletTransfersListOpts = ListWindowOpts &
  SizeFilterOpts & {
    /** `in` = received by the wallet, `out` = sent by it. Omit for both. */
    direction?: "in" | "out";
    /** Keep transfers of any of these tokens (wrapped SOL included; up to 100). */
    mints?: string[];
  };

function timeQuery(value: TimeInput | undefined): string | number | undefined {
  return value;
}

function listQuery(values: string[] | undefined): string | undefined {
  return values === undefined ? undefined : values.join(",");
}

/** `source` / `sources` → query params, refusing both at once (JS callers bypass the type). */
function sourceQuery(opts: { source?: string; sources?: string[] }): {
  source?: string;
  sources?: string;
} {
  if (opts.source !== undefined && opts.sources !== undefined) {
    throw new AnaxerError("invalid_request", "Pass either source or sources, not both");
  }
  return { source: opts.source, sources: listQuery(opts.sources) };
}

export interface RestApi {
  tokens: {
    get(mint: string): Promise<TokenMetadataV1>;
    /** Up to 50 mints (`REST_BATCH_MINTS_MAX`). */
    batch(mints: string[]): Promise<TokenMetadataV1[]>;
    price(mint: string): Promise<RestPriceV1>;
    /** Up to 100 mints (`REST_BATCH_PRICE_MINTS_MAX`). */
    batchPrice(mints: string[]): Promise<RestPriceV1[]>;
    trades(mint: string, opts?: TradesListOpts): Promise<Page<SwapV1>>;
  };
  wallets: {
    trades(wallet: string, opts?: WalletTradesListOpts): Promise<Page<SwapV1>>;
    transfers(wallet: string, opts?: WalletTransfersListOpts): Promise<Page<TransferV1>>;
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

/** Wire REST `/v1/*` methods (doc 22 §4.2) — no `programs()`. Path params are URL-encoded. */
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
        return http.getJson<RestPriceV1>(
          `/v1/tokens/${encodeURIComponent(mint)}/price`,
        );
      },
      async batchPrice(mints: string[]) {
        const body = await http.getJson<{ data: RestPriceV1[] }>(
          "/v1/tokens/batch/price",
          { mints: mints.join(",") },
        );
        return body.data;
      },
      async trades(mint: string, opts: TradesListOpts = {}) {
        return listPage<SwapV1>(http, `/v1/tokens/${encodeURIComponent(mint)}/trades`, {
          limit: opts.limit,
          cursor: opts.cursor,
          from: timeQuery(opts.from),
          to: timeQuery(opts.to),
          ...sourceQuery(opts),
          solOnly: opts.solOnly,
          minVolumeUsd: opts.minVolumeUsd,
          maxVolumeUsd: opts.maxVolumeUsd,
        });
      },
    },
    wallets: {
      async trades(wallet: string, opts: WalletTradesListOpts = {}) {
        return listPage<SwapV1>(http, `/v1/wallets/${encodeURIComponent(wallet)}/trades`, {
          limit: opts.limit,
          cursor: opts.cursor,
          from: timeQuery(opts.from),
          to: timeQuery(opts.to),
          mints: listQuery(opts.mints),
          ...sourceQuery(opts),
          solOnly: opts.solOnly,
          minVolumeUsd: opts.minVolumeUsd,
          maxVolumeUsd: opts.maxVolumeUsd,
        });
      },
      async transfers(wallet: string, opts: WalletTransfersListOpts = {}) {
        return listPage<TransferV1>(
          http,
          `/v1/wallets/${encodeURIComponent(wallet)}/transfers`,
          {
            limit: opts.limit,
            cursor: opts.cursor,
            from: timeQuery(opts.from),
            to: timeQuery(opts.to),
            direction: opts.direction,
            mints: listQuery(opts.mints),
            minVolumeUsd: opts.minVolumeUsd,
            maxVolumeUsd: opts.maxVolumeUsd,
          },
        );
      },
    },
    async creations(opts: CreationsListOpts = {}) {
      return listPage<CreatedV1>(http, "/v1/creations", {
        limit: opts.limit,
        cursor: opts.cursor,
        from: timeQuery(opts.from),
        to: timeQuery(opts.to),
        ...sourceQuery(opts),
        excludeMayhem: opts.excludeMayhem,
      });
    },
    async graduations(opts: GraduationsListOpts = {}) {
      return listPage<GraduatedV1>(http, "/v1/graduations", {
        limit: opts.limit,
        cursor: opts.cursor,
        from: timeQuery(opts.from),
        to: timeQuery(opts.to),
        ...sourceQuery(opts),
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
