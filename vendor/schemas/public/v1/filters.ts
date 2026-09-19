import { z } from "zod";
import type { ChannelV1 } from "./envelope";
import { QUOTE_ASSET_MINTS } from "./quoteAssets";

/**
 * Subscription filters (v1).
 *
 * Semantics: AND across fields, OR within a list. Empty object = everything on the
 * channel. Volume fields are rejected (`invalid_filters`) on any non-`trades` channel
 * rather than silently ignored. `wallets` is optional on `trades` (1–100) and required
 * on `transfers` (watchlist; over-cap rejected against `maxWatchedWallets`, doc 04a).
 * `mints` applies to `trades`/`prices` only. `mints`/`sources` rejected on `transfers`.
 * `solOnly` is trades-only (build-plan 32b); quote assets are rejected in `mints` on trades.
 */
export const subscriptionFiltersV1Schema = z
  .object({
    sources: z.array(z.string().min(1)).min(1).max(20).optional(),
    mints: z.array(z.string().min(32).max(44)).min(1).max(100).optional(),
    wallets: z.array(z.string().min(32).max(44)).min(1).max(100).optional(),
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
  if (hasVolume && channel !== "trades") {
    return "volume filters are only valid on the trades channel";
  }
  if (filters.mints !== undefined && channel !== "trades" && channel !== "prices") {
    return "mints filter is only valid on trades and prices channels";
  }
  if (filters.wallets !== undefined && channel !== "trades" && channel !== "transfers") {
    return "wallets filter is only valid on trades and transfers channels";
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
    if (!filters.wallets || filters.wallets.length === 0) {
      return "transfers requires a non-empty wallets watchlist";
    }
    if (filters.sources !== undefined || filters.mints !== undefined) {
      return "sources and mints are not valid on the transfers channel";
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
