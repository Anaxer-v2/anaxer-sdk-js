/**
 * Public payload + filter types for `@anaxer/sdk`.
 *
 * Payload types and `SubscriptionFiltersV1` are sourced from the private schemas
 * workspace package (public/v1) and inlined into `dist/` by tsup. The `*Filters`
 * aliases are SDK-local subsets (doc 22 §3a Q3) — assignable to
 * `SubscriptionFiltersV1`, not exported by schemas.
 *
 * Build note (doc 22 decision 5 fallback): tsup's dts rollup retains an import of
 * `zod` when expanding `z.infer` types, so `zod` is a declared runtime dependency.
 */
export type {
  SwapV1,
  CreatedV1,
  GraduatedV1,
  PriceUpdateV1,
  TransferV1,
  TokenMetadataV1,
  LaunchpadStatsV1,
  SubscriptionFiltersV1,
} from "@anaxer/schemas/public/v1";

import type { SubscriptionFiltersV1 } from "@anaxer/schemas/public/v1";

/** Wire protocol version on the envelope (`v: 1`). Independent of the SDK package version. */
export const WIRE_VERSION = 1 as const;

/** `trades` channel filters — subset of `SubscriptionFiltersV1`. */
export type TradesFilters = Pick<
  SubscriptionFiltersV1,
  "sources" | "mints" | "wallets" | "minVolumeUsd" | "maxVolumeUsd" | "solOnly"
>;

/** `creations` channel filters — subset of `SubscriptionFiltersV1`. */
export type CreationsFilters = Pick<
  SubscriptionFiltersV1,
  "sources" | "enriched" | "excludeMayhem"
>;

/** `graduations` channel filters — subset of `SubscriptionFiltersV1`. */
export type GraduationsFilters = Pick<
  SubscriptionFiltersV1,
  "sources" | "excludeMayhem" | "minLiquiditySol"
>;

/** `prices` channel filters — subset of `SubscriptionFiltersV1`. */
export type PricesFilters = Pick<SubscriptionFiltersV1, "sources" | "mints">;
