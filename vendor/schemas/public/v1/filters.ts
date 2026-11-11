import { z } from "zod";
import type { ChannelV1 } from "./envelope";
import { QUOTE_ASSET_MINTS } from "./quoteAssets";
import { REST_KNOWN_SOURCES } from "./rest";

/**
 * Source names a subscription may filter on: the documented sources (the REST list) plus
 * `internal` (SOL's own price, prices channel). An unknown name is rejected (`invalid_filters`)
 * like REST's `400` — before 2026-11-01 a typo silently matched nothing.
 */
export const STREAM_KNOWN_SOURCES: ReadonlySet<string> = new Set<string>([...REST_KNOWN_SOURCES, "internal"]);

/**
 * Subscription filters (v1).
 *
 * Semantics: AND across fields, OR within a list. Empty object = everything on the
 * channel. Volume fields are rejected (`invalid_filters`) on any channel but `trades` and `transfers`
 * rather than silently ignored. `wallets` is optional on `trades` (1–100) and on
 * `transfers` (watchlist up to `WALLETS_MAX`). `mints` applies to `trades`, `prices` and
 * `transfers` (on transfers any token, SOL included). Whether a plan must send a wallets or
 * mints filter on transfers (`transfersRequiresFilter`) and how many of each
 * (`maxWatchedWallets`, `transfersMintCap`, doc 04a) is checked after this schema. `sources`
 * is rejected on `transfers`.
 * `solOnly` is trades-only (build-plan 32b); quote assets are rejected in `mints` on trades.
 */
/** `wallets` length on `trades`. */
export const TRADES_WALLETS_MAX = 100;
/** `wallets` length any plan can reach on `transfers` (largest `maxWatchedWallets`). */
export const WALLETS_MAX = 1_000;

export const subscriptionFiltersV1Schema = z
  .object({
    sources: z.array(z.string().min(1)).min(1).max(20).optional(),
    mints: z.array(z.string().min(32).max(44)).min(1).max(100).optional(),
    wallets: z.array(z.string().min(32).max(44)).min(1).max(WALLETS_MAX).optional(),
    minVolumeUsd: z.number().nonnegative().optional(),
    maxVolumeUsd: z.number().positive().optional(),
    /** Creations only: true → enrichment-success frames; omit/false → fast creates. */
    enriched: z.boolean().optional(),
    /** Creations + graduations: drop events where mayhemMode === true. */
    excludeMayhem: z.boolean().optional(),
    /** Graduations only: floor on wire liquiditySol (SOL); null liquidity fails the floor. */
    minLiquiditySol: z.number().nonnegative().optional(),
    /** Trades only: true → only swaps with SOL on one side. */
    solOnly: z.boolean().optional(),
    /**
     * Transfers only, with `wallets`: `in` → only transfers a watched wallet received, `out` →
     * only those it sent (as REST's `direction`). Omit for both.
     */
    direction: z.enum(["in", "out"]).optional(),
  })
  .strict()
  .refine(
    (f) =>
      f.minVolumeUsd === undefined ||
      f.maxVolumeUsd === undefined ||
      f.minVolumeUsd <= f.maxVolumeUsd,
    { message: "minVolumeUsd must be <= maxVolumeUsd when both are present" },
  );

export type SubscriptionFiltersV1 = z.infer<typeof subscriptionFiltersV1Schema>;

/** Channel-specific filter rules (doc 04 §4.4). Returns an error message or null. */
export function filtersChannelError(
  channel: ChannelV1,
  filters: SubscriptionFiltersV1,
): string | null {
  const hasVolume = filters.minVolumeUsd !== undefined || filters.maxVolumeUsd !== undefined;
  if (hasVolume && channel !== "trades" && channel !== "transfers") {
    return "volume filters are only valid on the trades and transfers channels";
  }
  if (filters.mints !== undefined && channel !== "trades" && channel !== "prices" && channel !== "transfers") {
    return "mints filter is only valid on trades, prices and transfers channels";
  }
  if (filters.wallets !== undefined && channel !== "trades" && channel !== "transfers") {
    return "wallets filter is only valid on trades and transfers channels";
  }
  if (channel === "trades" && filters.wallets && filters.wallets.length > TRADES_WALLETS_MAX) {
    return `wallets filter on trades accepts at most ${TRADES_WALLETS_MAX} wallets`;
  }
  if (filters.enriched !== undefined && channel !== "creations") {
    return "enriched is only valid on the creations channel";
  }
  if (
    filters.excludeMayhem !== undefined &&
    channel !== "creations" &&
    channel !== "graduations"
  ) {
    return "excludeMayhem is only valid on the creations and graduations channels";
  }
  if (filters.minLiquiditySol !== undefined && channel !== "graduations") {
    return "minLiquiditySol is only valid on the graduations channel";
  }
  if (filters.solOnly !== undefined && channel !== "trades") {
    return "solOnly is only valid on the trades channel";
  }
  if (filters.direction !== undefined) {
    if (channel !== "transfers") return "direction is only valid on the transfers channel";
    if (filters.wallets === undefined) return "direction needs a wallets filter (it is relative to the watched wallets)";
  }
  if (filters.sources !== undefined) {
    const unknown = filters.sources.find((s) => !STREAM_KNOWN_SOURCES.has(s));
    if (unknown !== undefined) {
      return `unknown source "${unknown}" (see the source list in the docs)`;
    }
  }
  if (channel === "trades" && filters.mints) {
    const quoteMint = filters.mints.find((m) => QUOTE_ASSET_MINTS.has(m));
    if (quoteMint !== undefined) {
      return (
        `quote assets (SOL, USDC, USDT) cannot be used in mints on trades — use solOnly: ` +
        `true for SOL-paired trades (rejected: ${quoteMint})`
      );
    }
  }
  if (channel === "transfers") {
    if (filters.sources !== undefined) {
      return "sources is not valid on the transfers channel";
    }
  }
  return null;
}

export function parseFiltersForChannel(
  channel: ChannelV1,
  filters: unknown,
): { ok: true; filters: SubscriptionFiltersV1 } | { ok: false; message: string } {
  const parsed = subscriptionFiltersV1Schema.safeParse(filters);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message };
  }
  const channelErr = filtersChannelError(channel, parsed.data);
  if (channelErr) return { ok: false, message: channelErr };
  return { ok: true, filters: parsed.data };
}
