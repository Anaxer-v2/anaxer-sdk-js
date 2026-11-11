import { z } from "zod";

export const priceUpdateV1Schema = z
  .object({
    type: z.literal("price"),
    source: z.string().min(1),
    mint: z.string().min(1),
    /** The token's symbol (build-plan 45); null until resolved or when it has none. */
    symbol: z.string().nullable(),
    price: z
      .object({
        sol: z.number().finite(),
        usd: z.number().finite().nullable(),
      })
      .strict(),
    marketCapUsd: z.number().finite().nullable(),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type PriceUpdateV1 = z.infer<typeof priceUpdateV1Schema>;

/**
 * A price as REST returns it (build-plan 48 D8): the stream shape plus `stale`, true when the
 * trade behind it (`timestamp`) is unknown or older than PRICE_STALE_SEC. The WebSocket `prices`
 * frame has no `stale`: it is sent at the moment of a trade.
 */
export const restPriceV1Schema = priceUpdateV1Schema.extend({ stale: z.boolean() }).strict();

export type RestPriceV1 = z.infer<typeof restPriceV1Schema>;
