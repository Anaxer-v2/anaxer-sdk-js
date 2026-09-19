import { z } from "zod";

/** Stable REST error codes (doc 09 §4.3). HTTP status maps separately (502 vs 503 share `upstream_unavailable`). */
export const restErrorCodeV1Schema = z.enum([
  "invalid_request",
  "unauthorized",
  "not_found",
  "rate_limited",
  "quota_exceeded",
  "internal",
  "upstream_unavailable",
]);

export type RestErrorCodeV1 = z.infer<typeof restErrorCodeV1Schema>;

export const restErrorBodyV1Schema = z
  .object({
    error: z
      .object({
        code: restErrorCodeV1Schema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type RestErrorBodyV1 = z.infer<typeof restErrorBodyV1Schema>;

/** Effective query window after plan retention clamp (unix ms). */
export const restWindowV1Schema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  })
  .strict();

export type RestWindowV1 = z.infer<typeof restWindowV1Schema>;

/** Paginated list envelope for store-backed historical endpoints. */
export function restListEnvelopeV1Schema<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      data: z.array(item),
      next: z.string().nullable(),
      window: restWindowV1Schema,
    })
    .strict();
}

/** Bounded batch lookup envelope — no `next` / `window`. */
export function restBatchEnvelopeV1Schema<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      data: z.array(item),
    })
    .strict();
}

export const restCursorV1Schema = z.string().min(1);

export const restLimitV1Schema = z.coerce.number().int().min(1).max(200).default(50);

/** Known consumer `source` slugs (ws-v1.md + `bonkfun`). Unknown → 400 on REST filters. */
export const REST_KNOWN_SOURCES = [
  "pump_fun",
  "pump_amm",
  "raydium_launchlab",
  "raydium_cpmm",
  "raydium_clmm",
  "raydium_v4",
  "meteora_dbc",
  "meteora_damm_v2",
  "meteora_dlmm",
  "orca_whirlpool",
  "meteora_pools",
  "pancakeswap",
  "bonkfun",
] as const;

export type RestKnownSourceV1 = (typeof REST_KNOWN_SOURCES)[number];

export const restKnownSourceV1Schema = z.enum(REST_KNOWN_SOURCES);

export const REST_BATCH_MINTS_MAX = 50;

export const launchpadStatsSourceRowV1Schema = z
  .object({
    source: z.string().min(1),
    creations: z.number().int().nonnegative(),
    graduations: z.number().int().nonnegative(),
    graduationRate: z.number().finite().nonnegative(),
  })
  .strict();

export type LaunchpadStatsSourceRowV1 = z.infer<typeof launchpadStatsSourceRowV1Schema>;

export const launchpadStatsV1Schema = z
  .object({
    windowHours: z.number().int().positive(),
    window: restWindowV1Schema,
    sources: z.array(launchpadStatsSourceRowV1Schema),
  })
  .strict();

export type LaunchpadStatsV1 = z.infer<typeof launchpadStatsV1Schema>;

/**
 * Launchpad sources always returned by `/v1/launchpads/stats` (doc 09 §3.11 / B6).
 * Meteora DBC is excluded — launchpad signal is pump.fun + Raydium only
 * (founder, 2026-07-12); `meteora_dbc` stays a valid REST filter value for
 * historical rows only, see `REST_KNOWN_SOURCES`.
 */
export const LAUNCHPAD_STATS_SOURCES = [
  "pump_fun",
  "raydium_launchlab",
  "bonkfun",
] as const;
